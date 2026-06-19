import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceAlert, AlertType } from './entities/price-alert.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { TickersService } from '../tickers/tickers.service';
import { WebPushService } from '../web-push/web-push.service';
import {
  CreatePriceAlertDto,
  UpdatePriceAlertDto,
} from './dto/create-price-alert.dto';
import { QuotaService } from '../../common/quota/quota.service';

@Injectable()
export class PriceAlertsService {
  private readonly logger = new Logger(PriceAlertsService.name);

  constructor(
    @InjectRepository(PriceAlert)
    private readonly alertRepo: Repository<PriceAlert>,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => TickersService))
    private readonly tickersService: TickersService,
    private readonly webPushService: WebPushService,
    private readonly quota: QuotaService,
  ) {}

  /**
   * Create a new price alert for a user.
   */
  async create(userId: string, dto: CreatePriceAlertDto): Promise<PriceAlert> {
    const count = await this.alertRepo.count({ where: { user_id: userId } });
    await this.quota.assertWithinLimit(userId, 'priceAlerts', count);

    const ticker = await this.tickersService.findOneBySymbol(dto.symbol);
    if (!ticker) {
      throw new NotFoundException(`Ticker ${dto.symbol} not found`);
    }

    // For percent-change alerts, we need the current price as baseline
    let referencePrice: number | undefined;
    if (
      dto.alert_type === 'percent_change_up' ||
      dto.alert_type === 'percent_change_down'
    ) {
      const price = await this.getCurrentPrice(dto.symbol);
      if (price) referencePrice = price;
    }

    const alert = this.alertRepo.create({
      user_id: userId,
      ticker_id: ticker.id,
      symbol: ticker.symbol,
      alert_type: dto.alert_type as AlertType,
      target_value: dto.target_value,
      ...(referencePrice !== undefined && { reference_price: referencePrice }),
      cooldown_minutes: dto.cooldown_minutes ?? 60,
    });

    const saved = await this.alertRepo.save(alert);
    this.logger.log(
      `Alert created: ${saved.id} — ${dto.alert_type} ${dto.target_value} on ${dto.symbol} for user ${userId}`,
    );
    return saved;
  }

  /**
   * Get all alerts for a specific user.
   */
  async findAllForUser(userId: string): Promise<PriceAlert[]> {
    return this.alertRepo.find({
      where: { user_id: userId },
      relations: ['ticker'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Get distinct symbols that have at least one active alert.
   * Used by the cron to know which symbols need price checking.
   */
  async findActiveAlertSymbols(): Promise<string[]> {
    const result = await this.alertRepo
      .createQueryBuilder('alert')
      .select('DISTINCT alert.symbol', 'symbol')
      .where('alert.enabled = true')
      .getRawMany();
    return result.map((r) => r.symbol);
  }

  /**
   * Update an alert (enable/disable, change target, change cooldown).
   */
  async updateAlert(
    id: string,
    userId: string,
    dto: UpdatePriceAlertDto,
  ): Promise<PriceAlert> {
    const alert = await this.alertRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (dto.enabled !== undefined) alert.enabled = dto.enabled;
    if (dto.target_value !== undefined) alert.target_value = dto.target_value;
    if (dto.cooldown_minutes !== undefined)
      alert.cooldown_minutes = dto.cooldown_minutes;

    return this.alertRepo.save(alert);
  }

  /**
   * Delete an alert.
   */
  async deleteAlert(id: string, userId: string): Promise<void> {
    const result = await this.alertRepo.delete({ id, user_id: userId });
    if (result.affected === 0) {
      throw new NotFoundException('Alert not found');
    }
  }

  /**
   * Evaluate all active alerts for a given symbol against the current price.
   * Called by the market-data cron after each price fetch.
   */
  async evaluateAlerts(symbol: string, currentPrice: number): Promise<void> {
    if (!currentPrice || currentPrice <= 0) return;

    const now = new Date();

    // Fetch active alerts past their OWN cooldown window. Previously this used a
    // hardcoded 1-hour floor, which kept alerts with a shorter cooldown silent
    // for up to an hour. Compare against each alert's cooldown_minutes instead.
    const alerts = await this.alertRepo
      .createQueryBuilder('alert')
      .where('alert.enabled = true')
      .andWhere('alert.symbol = :symbol', { symbol })
      .andWhere(
        `(alert.triggered_at IS NULL OR alert.triggered_at < (:now::timestamptz - (COALESCE(alert.cooldown_minutes, 60) * interval '1 minute')))`,
        { now },
      )
      .getMany();

    for (const alert of alerts) {
      // Lazily capture a baseline for percent-change alerts that never got one
      // (e.g. price data was unavailable at creation time). Without this the
      // alert can never fire.
      if (
        (alert.alert_type === 'percent_change_up' ||
          alert.alert_type === 'percent_change_down') &&
        (!alert.reference_price || alert.reference_price <= 0)
      ) {
        alert.reference_price = currentPrice;
        await this.alertRepo.save(alert);
        continue; // Baseline just set — nothing to compare against yet.
      }

      if (!this.checkCondition(alert, currentPrice)) continue;

      // Atomically claim the trigger. Concurrent/overlapping evaluations for the
      // same symbol could otherwise both read the alert before either marks it
      // triggered, firing the notification twice. The conditional UPDATE ensures
      // exactly one evaluation wins.
      const claim = await this.alertRepo
        .createQueryBuilder()
        .update(PriceAlert)
        .set({ triggered_at: now })
        .where('id = :id', { id: alert.id })
        .andWhere(
          `(triggered_at IS NULL OR triggered_at < (:now::timestamptz - (COALESCE(cooldown_minutes, 60) * interval '1 minute')))`,
          { now },
        )
        .execute();
      if (!claim.affected) continue; // Another evaluation already fired it.

      alert.triggered_at = now;
      await this.triggerAlert(alert, currentPrice);
    }
  }

  /**
   * Check if an alert condition is met.
   */
  private checkCondition(alert: PriceAlert, currentPrice: number): boolean {
    switch (alert.alert_type) {
      case 'price_above':
        return currentPrice >= alert.target_value;
      case 'price_below':
        return currentPrice <= alert.target_value;
      case 'percent_change_up':
        if (!alert.reference_price || alert.reference_price <= 0) return false;
        return (
          ((currentPrice - alert.reference_price) / alert.reference_price) *
            100 >=
          alert.target_value
        );
      case 'percent_change_down':
        if (!alert.reference_price || alert.reference_price <= 0) return false;
        return (
          ((alert.reference_price - currentPrice) / alert.reference_price) *
            100 >=
          alert.target_value
        );
      default:
        return false;
    }
  }

  /**
   * Fire an alert — creates an in-app notification and marks the alert as triggered.
   */
  private async triggerAlert(
    alert: PriceAlert,
    currentPrice: number,
  ): Promise<void> {
    this.logger.log(
      `Alert TRIGGERED: ${alert.symbol} ${alert.alert_type} target=${alert.target_value} current=${currentPrice}`,
    );

    // Build notification message
    const { title, message } = this.buildNotificationMessage(
      alert,
      currentPrice,
    );

    // Create in-app notification
    await this.notificationsService.create(
      alert.user_id,
      'price_alert',
      title,
      message,
      {
        symbol: alert.symbol,
        alertId: alert.id,
        alertType: alert.alert_type,
        targetValue: alert.target_value,
        currentPrice,
      },
    );

    // Send web push notification (non-blocking — don't let push failure block the alert)
    this.webPushService
      .sendToUser(alert.user_id, {
        title,
        body: message,
        icon: '/favicon.svg',
        data: {
          url: `/ticker/${alert.symbol}`,
          symbol: alert.symbol,
          alertType: alert.alert_type,
        },
      })
      .catch((err) => {
        this.logger.warn(
          `Web push failed for user ${alert.user_id}: ${err.message}`,
        );
      });

    // triggered_at is set atomically by the claim in evaluateAlerts before this
    // runs, so there is no separate save here (avoids overwriting the claim).
  }

  /**
   * Build human-readable notification title and message.
   */
  private buildNotificationMessage(
    alert: PriceAlert,
    currentPrice: number,
  ): { title: string; message: string } {
    const price = currentPrice.toFixed(2);
    const target = alert.target_value.toFixed(
      alert.alert_type.startsWith('percent') ? 1 : 2,
    );

    switch (alert.alert_type) {
      case 'price_above':
        return {
          title: `${alert.symbol} hit $${price}`,
          message: `${alert.symbol} reached $${price}, above your target of $${target}.`,
        };
      case 'price_below':
        return {
          title: `${alert.symbol} dropped to $${price}`,
          message: `${alert.symbol} fell to $${price}, below your target of $${target}.`,
        };
      case 'percent_change_up': {
        const pctChange = alert.reference_price
          ? (
              ((currentPrice - alert.reference_price) / alert.reference_price) *
              100
            ).toFixed(1)
          : '?';
        return {
          title: `${alert.symbol} up ${pctChange}%`,
          message: `${alert.symbol} is up ${pctChange}% from $${alert.reference_price?.toFixed(2)} to $${price} (target: +${target}%).`,
        };
      }
      case 'percent_change_down': {
        const pctDrop = alert.reference_price
          ? (
              ((alert.reference_price - currentPrice) / alert.reference_price) *
              100
            ).toFixed(1)
          : '?';
        return {
          title: `${alert.symbol} down ${pctDrop}%`,
          message: `${alert.symbol} is down ${pctDrop}% from $${alert.reference_price?.toFixed(2)} to $${price} (target: -${target}%).`,
        };
      }
      default:
        return {
          title: `Price Alert: ${alert.symbol}`,
          message: `${alert.symbol} is at $${price}.`,
        };
    }
  }

  /**
   * Get current price for a symbol from the latest OHLCV record.
   * Used when creating percent-change alerts to capture the baseline.
   */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      // We use a raw query to avoid circular dep with MarketDataService
      const result = await this.alertRepo.query(
        `SELECT close FROM price_ohlcv
         WHERE symbol_id = (SELECT id FROM tickers WHERE symbol = $1)
         AND timeframe = '1d'
         ORDER BY ts DESC LIMIT 1`,
        [symbol],
      );
      if (result?.[0]?.close) {
        return parseFloat(result[0].close);
      }
      return null;
    } catch {
      this.logger.warn(`Could not fetch current price for ${symbol}`);
      return null;
    }
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { PortfolioPosition } from './entities/portfolio-position.entity';
import { PortfolioAnalysis } from './entities/portfolio-analysis.entity';
import { PortfolioTrade } from './entities/portfolio-trade.entity';
import { PortfolioCashBalance } from './entities/portfolio-cash-balance.entity';
import {
  PortfolioPendingOrder,
  PendingOrderSide,
} from './entities/portfolio-pending-order.entity';
import { CreatePortfolioPositionDto } from './dto/create-portfolio-position.dto';
import { UpdatePortfolioPositionDto } from './dto/update-portfolio-position.dto';
import { SellPositionDto } from './dto/sell-position.dto';
import { BuyAtMarketDto } from './dto/buy-at-market.dto';
import { CashOperationDto } from './dto/cash-operation.dto';
import { RecordTradeDto } from './dto/record-trade.dto';
import { MarketDataService } from '../market-data/market-data.service';
import { MarketStatusService } from '../market-data/market-status.service';
import { LlmService } from '../llm/llm.service';
import { TickersService } from '../tickers/tickers.service';
import { CreditService } from '../users/credit.service';
import { CurrencyService } from '../currency/currency.service';
import { QuotaService } from '../../common/quota/quota.service';

/** Cash balance after a trade, echoed back to the client. */
interface CashBalanceView {
  currency: string;
  amount: number;
}

/** A buy/sell that executed immediately because the market was open. */
export interface ExecutedOrderResult {
  status: 'executed';
  side: PendingOrderSide;
  position: PortfolioPosition | null;
  trade: PortfolioTrade;
  cost?: number;
  proceeds?: number;
  realized_pnl?: number;
  cash_balance: CashBalanceView;
}

/** A buy/sell parked as pending because the market was closed at placement. */
export interface PendingOrderResult {
  status: 'pending';
  side: PendingOrderSide;
  order: PortfolioPendingOrder;
}

export type MarketOrderResult = ExecutedOrderResult | PendingOrderResult;

@Injectable()
export class PortfolioService implements OnModuleInit {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    @InjectRepository(PortfolioPosition)
    private readonly positionRepo: Repository<PortfolioPosition>,
    @InjectRepository(PortfolioAnalysis)
    private readonly analysisRepo: Repository<PortfolioAnalysis>,
    @InjectRepository(PortfolioPendingOrder)
    private readonly pendingRepo: Repository<PortfolioPendingOrder>,
    @Inject(forwardRef(() => MarketDataService))
    private readonly marketDataService: MarketDataService,
    private readonly marketStatusService: MarketStatusService,
    private readonly llmService: LlmService,
    @Inject(forwardRef(() => TickersService))
    private readonly tickersService: TickersService,
    @Inject(forwardRef(() => CreditService))
    private readonly creditService: CreditService,
    private readonly currencyService: CurrencyService,
    private readonly quota: QuotaService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing PortfolioService...');
    // Auto-heal currency data on startup
    const result = await this.backfillPositionCurrencies();
    this.logger.log(
      `Currency Backfill Result: Updated ${result.updated}, Skipped ${result.skipped}`,
    );
  }

  /**
   * Buy a position. This is the STRICT simulator path: the buy must be funded
   * by simulator cash in the same currency, which is deducted atomically. New
   * users start at a zero balance, so a buy requires depositing cash first.
   * Every buy is mirrored into the append-only trade ledger.
   */
  async create(
    userId: string,
    dto: CreatePortfolioPositionDto,
  ): Promise<PortfolioPosition> {
    // Auto-detect currency from ticker if not explicitly provided (read-only,
    // safe to resolve before taking the per-user lock).
    const currency = await this.resolveCurrency(dto.symbol, dto.currency);

    // Serialize concurrent creates for THIS user inside a transaction. Without
    // the advisory lock, two parallel requests could both pass the count-based
    // quota check before either inserts, letting the user exceed their limit;
    // it also serializes the read-modify-write on the cash balance.
    return this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);

      const repo = tx.getRepository(PortfolioPosition);
      const count = await repo.count({ where: { user_id: userId } });
      await this.quota.assertWithinLimit(userId, 'portfolioPositions', count);

      // Deduct the cost from cash first — throws if the user can't afford it,
      // aborting the transaction before any position/trade is written.
      const cost = this.round2(dto.shares * dto.buy_price);
      await this.adjustCashTx(tx, userId, currency, -cost, { enforce: true });

      const position = repo.create({
        ...dto,
        currency,
        user_id: userId,
      });
      const saved = await repo.save(position);

      await this.insertTradeTx(tx, {
        userId,
        positionId: saved.id,
        symbol: saved.symbol,
        side: 'buy',
        shares: dto.shares,
        price: dto.buy_price,
        currency,
        tradeDate: dto.buy_date,
        source: 'app',
      });

      return saved;
    });
  }

  /**
   * Sell shares of an existing position — MARKET-HOURS GATED.
   *
   * If the symbol's market is open the sale executes immediately (reduces/closes
   * the lot, books realized P&L, credits proceeds, records a SELL trade). If the
   * market is closed the order is QUEUED as pending and filled by the cron filler
   * at the next open, at the market price at fill time. Selling more than is held
   * (or more than is left after already-pending sells) is rejected either way.
   */
  async sell(
    userId: string,
    positionId: string,
    dto: SellPositionDto,
  ): Promise<MarketOrderResult> {
    // Resolve the lot + market status before taking the per-user lock (reads).
    const position = await this.findOne(userId, positionId);
    const currency = position.currency || 'USD';
    const status = await this.marketStatusService.getMarketStatus(
      position.symbol,
    );

    // Market closed → queue it. The user-entered price is informational only;
    // pending orders fill at the live price at the next open.
    if (!status.isOpen) {
      return this.placePendingOrder(userId, {
        position,
        symbol: position.symbol,
        side: 'sell',
        shares: dto.shares,
        currency,
        region: status.region,
        requestedPrice: dto.price,
        fees: dto.fees,
        note: dto.note,
      });
    }

    // Market open → execute now at the confirmed price.
    const result = await this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);
      const repo = tx.getRepository(PortfolioPosition);
      const fresh = await repo.findOne({
        where: { id: positionId, user_id: userId },
      });
      if (!fresh) throw new NotFoundException('Position not found');
      return this.executeSellTx(tx, fresh, {
        userId,
        shares: dto.shares,
        price: dto.price,
        currency: fresh.currency || 'USD',
        sellDate: dto.sell_date || this.todayIso(),
        fees: dto.fees,
        note: dto.note,
        source: 'app',
      });
    });

    return { status: 'executed', side: 'sell', ...result };
  }

  /**
   * Buy MORE shares of an existing position at the LIVE market price —
   * MARKET-HOURS GATED. (This is distinct from `create`/"Add Position", the
   * ungated historical import where the user types the price + date.)
   *
   * Market open → executes now at the current snapshot price, weighted-averaged
   * into the lot, debiting cash (must be funded). Market closed → queued as a
   * pending buy and filled at the market price at the next open.
   */
  async buy(
    userId: string,
    positionId: string,
    dto: BuyAtMarketDto,
  ): Promise<MarketOrderResult> {
    const position = await this.findOne(userId, positionId);
    const currency = position.currency || 'USD';
    const status = await this.marketStatusService.getMarketStatus(
      position.symbol,
    );
    const price = await this.getCurrentPrice(position.symbol);
    if (price == null) {
      throw new BadRequestException(
        `No live price available for ${position.symbol}; cannot place a market buy.`,
      );
    }

    // Market closed → queue it. Soft-check funds at placement (the strict check
    // runs again at fill time, since both price and cash can move meanwhile).
    if (!status.isOpen) {
      const cash = await this.getCashAmount(userId, currency);
      const estCost = this.round2(dto.shares * price + (dto.fees ?? 0));
      if (estCost > cash) {
        throw new BadRequestException(
          `Insufficient ${currency} cash: ~${estCost.toFixed(2)} needed at the ` +
            `current price, have ${cash.toFixed(2)}. Deposit cash first.`,
        );
      }
      return this.placePendingOrder(userId, {
        position,
        symbol: position.symbol,
        side: 'buy',
        shares: dto.shares,
        currency,
        region: status.region,
        requestedPrice: price,
        fees: dto.fees,
        note: dto.note,
      });
    }

    // Market open → execute now at the live price.
    const result = await this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);
      const repo = tx.getRepository(PortfolioPosition);
      const fresh = await repo.findOne({
        where: { id: positionId, user_id: userId },
      });
      if (!fresh) throw new NotFoundException('Position not found');
      return this.executeBuyTx(tx, {
        userId,
        position: fresh,
        symbol: fresh.symbol,
        shares: dto.shares,
        price,
        currency: fresh.currency || 'USD',
        tradeDate: this.todayIso(),
        fees: dto.fees,
        note: dto.note,
        source: 'app',
      });
    });

    return {
      status: 'executed',
      side: 'buy',
      position: result.position,
      trade: result.trade,
      cost: result.cost,
      cash_balance: result.cash_balance,
    };
  }

  /**
   * List a user's pending orders plus recent terminal ones (filled/cancelled/
   * failed), newest first — enough for the UI to show "queued" orders and recent
   * outcomes. Decimal columns arrive as strings; the client coerces as needed.
   */
  async getPendingOrders(userId: string): Promise<PortfolioPendingOrder[]> {
    return this.pendingRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: 50,
    });
  }

  /** Cancel a still-pending order. No-op-safe: a non-pending order is rejected. */
  async cancelPendingOrder(
    userId: string,
    id: string,
  ): Promise<PortfolioPendingOrder> {
    return this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);
      const repo = tx.getRepository(PortfolioPendingOrder);
      const order = await repo.findOne({ where: { id, user_id: userId } });
      if (!order) throw new NotFoundException('Pending order not found');
      if (order.status !== 'pending') {
        throw new BadRequestException(
          `Order is already ${order.status}; nothing to cancel.`,
        );
      }
      order.status = 'cancelled';
      return repo.save(order);
    });
  }

  /**
   * Cron entry point: fill every pending order whose market is now open, at the
   * live market price. Concurrency-safe for prod multi-instance: each order is
   * filled inside a per-user advisory-lock transaction that re-checks the order
   * is still 'pending' under a row lock, so two runners can't double-fill.
   */
  async fillDuePendingOrders(): Promise<{
    filled: number;
    failed: number;
    skipped: number;
  }> {
    // Quick gate: if both US and EU are shut, nothing is fillable (OTHER tracks
    // US hours), so skip the table scan entirely.
    const markets = await this.marketStatusService.getAllMarketsStatus();
    if (!markets.us.isOpen && !markets.eu.isOpen) {
      return { filled: 0, failed: 0, skipped: 0 };
    }

    const due = await this.pendingRepo.find({
      where: { status: 'pending' },
      order: { created_at: 'ASC' },
      take: 100,
    });
    if (due.length === 0) return { filled: 0, failed: 0, skipped: 0 };

    let filled = 0;
    let failed = 0;
    let skipped = 0;
    for (const order of due) {
      // Per-order live check (cached per region — cheap). Leave it pending if
      // its specific market isn't open yet.
      const status = await this.marketStatusService.getMarketStatus(
        order.symbol,
      );
      if (!status.isOpen) {
        skipped++;
        continue;
      }
      try {
        const outcome = await this.fillOneOrder(order.id);
        if (outcome === 'filled') filled++;
        else if (outcome === 'failed') failed++;
        else skipped++;
      } catch (e) {
        failed++;
        this.logger.error(
          `Failed to fill pending order ${order.id}: ${e?.message ?? e}`,
        );
      }
    }
    return { filled, failed, skipped };
  }

  /** Current simulator cash balances, one entry per currency (zero rows omitted). */
  async getCashBalances(
    userId: string,
  ): Promise<{ currency: string; amount: number }[]> {
    const repo = this.positionRepo.manager.getRepository(PortfolioCashBalance);
    const rows = await repo.find({
      where: { user_id: userId },
      order: { currency: 'ASC' },
    });
    return rows.map((r) => ({
      currency: r.currency,
      amount: Number(r.amount),
    }));
  }

  /** Add simulator cash to a currency balance. */
  async depositCash(
    userId: string,
    dto: CashOperationDto,
  ): Promise<{ currency: string; amount: number }> {
    const currency = dto.currency || 'USD';
    return this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);
      const amount = await this.adjustCashTx(
        tx,
        userId,
        currency,
        this.round2(dto.amount),
        { enforce: false },
      );
      return { currency, amount };
    });
  }

  /** Withdraw simulator cash from a currency balance (cannot go negative). */
  async withdrawCash(
    userId: string,
    dto: CashOperationDto,
  ): Promise<{ currency: string; amount: number }> {
    const currency = dto.currency || 'USD';
    return this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);
      const amount = await this.adjustCashTx(
        tx,
        userId,
        currency,
        -this.round2(dto.amount),
        { enforce: true },
      );
      return { currency, amount };
    });
  }

  /** Trade history (most recent first), optionally filtered to one symbol. */
  async getTrades(
    userId: string,
    opts?: { symbol?: string; limit?: number; offset?: number },
  ): Promise<PortfolioTrade[]> {
    const repo = this.positionRepo.manager.getRepository(PortfolioTrade);
    const where: Record<string, unknown> = { user_id: userId };
    if (opts?.symbol) where.symbol = opts.symbol.toUpperCase();
    return repo.find({
      where,
      order: { trade_date: 'DESC', created_at: 'DESC' },
      take: Math.min(opts?.limit ?? 100, 500),
      skip: opts?.offset ?? 0,
    });
  }

  /**
   * Record an externally-executed trade for consolidation (typically via MCP).
   * Permissive by design — it mirrors a trade that already happened elsewhere,
   * so it does NOT enforce sufficient cash; buys may drive the balance negative.
   * Idempotent on `external_id`: re-recording the same key returns the original
   * trade untouched. Sells reduce the given lot, or the oldest matching lot
   * (FIFO) when no `position_id` is supplied; a sell with no matching lot is
   * still recorded as a pure ledger/cash entry.
   */
  async recordTrade(
    userId: string,
    dto: RecordTradeDto,
  ): Promise<{ trade: PortfolioTrade; idempotent: boolean }> {
    const symbol = dto.symbol.toUpperCase();
    const currency = await this.resolveCurrency(symbol, dto.currency);
    const source = dto.source || 'mcp';
    const fees = dto.fees ?? 0;

    return this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);

      // Idempotency: a previously-imported external_id is a no-op.
      if (dto.external_id) {
        const existing = await tx.getRepository(PortfolioTrade).findOne({
          where: { user_id: userId, external_id: dto.external_id },
        });
        if (existing) return { trade: existing, idempotent: true };
      }

      const posRepo = tx.getRepository(PortfolioPosition);

      if (dto.side === 'buy') {
        // Cash mirror (allowed to go negative) + open a new lot.
        const cost = this.round2(dto.shares * dto.price + fees);
        await this.adjustCashTx(tx, userId, currency, -cost, {
          enforce: false,
        });
        const position = posRepo.create({
          user_id: userId,
          symbol,
          shares: dto.shares,
          buy_price: dto.price,
          buy_date: dto.trade_date,
          currency,
        });
        const saved = await posRepo.save(position);
        const trade = await this.insertTradeTx(tx, {
          userId,
          positionId: saved.id,
          symbol,
          side: 'buy',
          shares: dto.shares,
          price: dto.price,
          fees,
          currency,
          tradeDate: dto.trade_date,
          source,
          externalId: dto.external_id,
          note: dto.note,
        });
        return { trade, idempotent: false };
      }

      // side === 'sell'
      let position: PortfolioPosition | null = null;
      if (dto.position_id) {
        position = await posRepo.findOne({
          where: { id: dto.position_id, user_id: userId },
        });
        if (!position) throw new NotFoundException('Position not found');
      } else {
        position = await posRepo.findOne({
          where: { user_id: userId, symbol },
          order: { buy_date: 'ASC' },
        });
      }

      let realizedPnl: number | null = null;
      let tradePositionId: string | null = null;
      if (position) {
        const held = Number(position.shares);
        const sell = Math.min(dto.shares, held);
        const costBasis = this.round2(sell * Number(position.buy_price));
        const proceedsForLot = this.round2(sell * dto.price);
        realizedPnl = this.round2(proceedsForLot - costBasis);
        const remaining = this.round2(held - sell);
        if (remaining <= 0) {
          await posRepo.remove(position);
          tradePositionId = null;
        } else {
          position.shares = remaining;
          await posRepo.save(position);
          tradePositionId = position.id;
        }
      }

      const proceeds = this.round2(dto.shares * dto.price - fees);
      await this.adjustCashTx(tx, userId, currency, proceeds, {
        enforce: false,
      });
      const trade = await this.insertTradeTx(tx, {
        userId,
        positionId: tradePositionId,
        symbol,
        side: 'sell',
        shares: dto.shares,
        price: dto.price,
        fees,
        realizedPnl,
        currency,
        tradeDate: dto.trade_date,
        source,
        externalId: dto.external_id,
        note: dto.note,
      });
      return { trade, idempotent: false };
    });
  }

  /**
   * Net-worth summary: market value of holdings + simulator cash, in an optional
   * display currency. Holdings value is reused from findAll (already converted);
   * cash is converted best-effort (native amount kept if no FX rate is available).
   */
  async getPortfolioSummary(
    userId: string,
    displayCurrency?: string,
  ): Promise<{
    currency: string;
    holdings_value: number;
    cash_value: number;
    net_worth: number;
    positions_count: number;
    cash_balances: { currency: string; amount: number }[];
  }> {
    const positions = await this.findAll(userId, displayCurrency);
    const holdingsValue = positions.reduce(
      (sum, p) => sum + (Number(p.current_value) || 0),
      0,
    );

    const cash = await this.getCashBalances(userId);
    let cashValue = 0;
    for (const c of cash) {
      if (displayCurrency && c.currency !== displayCurrency) {
        const rate = await this.currencyService.getRate(
          c.currency,
          displayCurrency,
        );
        cashValue += rate != null ? c.amount * rate : c.amount;
      } else {
        cashValue += c.amount;
      }
    }

    const currency = displayCurrency || positions[0]?.currency || 'USD';
    return {
      currency,
      holdings_value: this.round2(holdingsValue),
      cash_value: this.round2(cashValue),
      net_worth: this.round2(holdingsValue + cashValue),
      positions_count: positions.length,
      cash_balances: cash,
    };
  }

  // ---------------------------------------------------------------------------
  // Trading-simulator internals
  // ---------------------------------------------------------------------------

  /**
   * Execute a BUY inside an open transaction: debit cash (enforced), add the
   * shares to the given lot (weighted-average cost) or open a fresh lot if none
   * is passed, and append a BUY trade. Caller must hold the per-user advisory
   * lock. Shared by the live `buy` path and the pending-order filler.
   */
  private async executeBuyTx(
    tx: EntityManager,
    args: {
      userId: string;
      position: PortfolioPosition | null;
      symbol: string;
      shares: number;
      price: number;
      currency: string;
      tradeDate: string;
      fees?: number;
      note?: string | null;
      source?: string;
    },
  ): Promise<{
    position: PortfolioPosition;
    trade: PortfolioTrade;
    cost: number;
    cash_balance: CashBalanceView;
  }> {
    const repo = tx.getRepository(PortfolioPosition);
    const fees = args.fees ?? 0;
    const cost = this.round2(args.shares * args.price + fees);

    // Debit first so an unaffordable buy aborts before any lot/trade is written.
    const cashAfter = await this.adjustCashTx(tx, args.userId, args.currency, -cost, {
      enforce: true,
    });

    let position = args.position;
    if (position) {
      // Weighted-average the new shares into the existing lot's cost basis.
      const heldShares = Number(position.shares);
      const heldCost = heldShares * Number(position.buy_price);
      const addCost = args.shares * args.price;
      const newShares = this.round2(heldShares + args.shares);
      const newAvg =
        newShares > 0
          ? this.round2((heldCost + addCost) / newShares)
          : Number(position.buy_price);
      position.shares = newShares;
      position.buy_price = newAvg;
      position = await repo.save(position);
    } else {
      position = await repo.save(
        repo.create({
          user_id: args.userId,
          symbol: args.symbol,
          shares: args.shares,
          buy_price: args.price,
          buy_date: args.tradeDate,
          currency: args.currency,
        }),
      );
    }

    const trade = await this.insertTradeTx(tx, {
      userId: args.userId,
      positionId: position.id,
      symbol: args.symbol,
      side: 'buy',
      shares: args.shares,
      price: args.price,
      fees,
      currency: args.currency,
      tradeDate: args.tradeDate,
      source: args.source ?? 'app',
      note: args.note,
    });

    return {
      position,
      trade,
      cost,
      cash_balance: { currency: args.currency, amount: cashAfter },
    };
  }

  /**
   * Execute a SELL inside an open transaction: reduce/close the lot, book the
   * realized P&L, credit proceeds (gross − fees), and append a SELL trade. Caller
   * must hold the per-user advisory lock. Shared by the live `sell` path and the
   * pending-order filler.
   */
  private async executeSellTx(
    tx: EntityManager,
    position: PortfolioPosition,
    args: {
      userId: string;
      shares: number;
      price: number;
      currency: string;
      sellDate: string;
      fees?: number;
      note?: string | null;
      source?: string;
    },
  ): Promise<{
    position: PortfolioPosition | null;
    trade: PortfolioTrade;
    proceeds: number;
    realized_pnl: number;
    cash_balance: CashBalanceView;
  }> {
    const repo = tx.getRepository(PortfolioPosition);
    const held = Number(position.shares);
    const sharesToSell = args.shares;
    // Tiny epsilon so floating-point representation of a "sell all" doesn't trip.
    if (sharesToSell > held + 1e-9) {
      throw new BadRequestException(
        `Cannot sell ${sharesToSell} shares; only ${held} held.`,
      );
    }

    const fees = args.fees ?? 0;
    const gross = this.round2(sharesToSell * args.price);
    const proceeds = this.round2(gross - fees);
    const costBasis = this.round2(sharesToSell * Number(position.buy_price));
    const realizedPnl = this.round2(proceeds - costBasis);
    const symbol = position.symbol;

    // Reduce or close the lot. A full sell deletes the row; the SELL trade is
    // kept (FK is ON DELETE SET NULL), so history survives.
    const remaining = this.round2(held - sharesToSell);
    let updatedPosition: PortfolioPosition | null;
    let tradePositionId: string | null;
    if (remaining <= 0) {
      await repo.remove(position);
      updatedPosition = null;
      tradePositionId = null;
    } else {
      position.shares = remaining;
      updatedPosition = await repo.save(position);
      tradePositionId = position.id;
    }

    const trade = await this.insertTradeTx(tx, {
      userId: args.userId,
      positionId: tradePositionId,
      symbol,
      side: 'sell',
      shares: sharesToSell,
      price: args.price,
      fees,
      realizedPnl,
      currency: args.currency,
      tradeDate: args.sellDate,
      source: args.source ?? 'app',
      note: args.note,
    });

    const cashAfter = await this.adjustCashTx(
      tx,
      args.userId,
      args.currency,
      proceeds,
      { enforce: false },
    );

    return {
      position: updatedPosition,
      trade,
      proceeds,
      realized_pnl: realizedPnl,
      cash_balance: { currency: args.currency, amount: cashAfter },
    };
  }

  /**
   * Park a buy/sell as a pending order (market was closed). For sells, validate
   * the requested shares against what's left after already-pending sells on the
   * same lot so a user can't queue more than they hold.
   */
  private async placePendingOrder(
    userId: string,
    args: {
      position: PortfolioPosition | null;
      symbol: string;
      side: PendingOrderSide;
      shares: number;
      currency: string;
      region: string;
      requestedPrice?: number | null;
      fees?: number;
      note?: string | null;
    },
  ): Promise<PendingOrderResult> {
    return this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);
      const repo = tx.getRepository(PortfolioPendingOrder);

      if (args.side === 'sell' && args.position) {
        const held = Number(args.position.shares);
        const pendingSells = await repo.find({
          where: {
            user_id: userId,
            position_id: args.position.id,
            side: 'sell',
            status: 'pending',
          },
        });
        const reserved = pendingSells.reduce(
          (sum, o) => sum + Number(o.shares),
          0,
        );
        const available = this.round2(held - reserved);
        if (args.shares > available + 1e-9) {
          throw new BadRequestException(
            `Cannot queue a sell of ${args.shares}: only ${available} shares ` +
              `available (${reserved} already queued).`,
          );
        }
      }

      const order = repo.create({
        user_id: userId,
        position_id: args.position?.id ?? null,
        symbol: args.symbol,
        side: args.side,
        shares: args.shares,
        currency: args.currency,
        status: 'pending',
        region: args.region,
        requested_price: args.requestedPrice ?? null,
        fees: args.fees ?? 0,
        note: args.note ?? null,
        attempts: 0,
      });
      const saved = await repo.save(order);
      return { status: 'pending' as const, side: args.side, order: saved };
    });
  }

  /**
   * Fill ONE pending order at the live price. Execution is atomic (per-user
   * advisory lock + row lock + status re-check); failures are recorded in a
   * separate transaction so a rolled-back attempt never leaves the row wedged.
   */
  private async fillOneOrder(
    orderId: string,
  ): Promise<'filled' | 'failed' | 'skipped'> {
    const pre = await this.pendingRepo.findOne({ where: { id: orderId } });
    if (!pre || pre.status !== 'pending') return 'skipped';

    // Price outside the transaction (no DB lock held during the network call).
    const price = await this.getCurrentPrice(pre.symbol);
    if (price == null) {
      return this.markOrderUnfilled(orderId, 'No live price available.');
    }

    try {
      return await this.positionRepo.manager.transaction(async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `portfolio:${pre.user_id}`,
        ]);
        const pendingRepo = tx.getRepository(PortfolioPendingOrder);
        // Re-load under a row lock and re-check: another runner may have taken it.
        const order = await pendingRepo.findOne({
          where: { id: orderId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!order || order.status !== 'pending') return 'skipped' as const;

        const posRepo = tx.getRepository(PortfolioPosition);
        let tradeId: string;
        if (order.side === 'buy') {
          const position = order.position_id
            ? await posRepo.findOne({
                where: { id: order.position_id, user_id: order.user_id },
              })
            : null;
          const { trade } = await this.executeBuyTx(tx, {
            userId: order.user_id,
            position,
            symbol: order.symbol,
            shares: Number(order.shares),
            price,
            currency: order.currency,
            tradeDate: this.todayIso(),
            fees: Number(order.fees) || 0,
            note: order.note,
            source: 'app',
          });
          tradeId = trade.id;
        } else {
          const position = order.position_id
            ? await posRepo.findOne({
                where: { id: order.position_id, user_id: order.user_id },
              })
            : null;
          if (!position) {
            throw new BadRequestException('Position no longer exists.');
          }
          const result = await this.executeSellTx(tx, position, {
            userId: order.user_id,
            shares: Number(order.shares),
            price,
            currency: order.currency,
            sellDate: this.todayIso(),
            fees: Number(order.fees) || 0,
            note: order.note,
            source: 'app',
          });
          tradeId = result.trade.id;
        }

        order.status = 'filled';
        order.filled_at = new Date();
        order.filled_price = price;
        order.filled_trade_id = tradeId;
        await pendingRepo.save(order);
        return 'filled' as const;
      });
    } catch (e) {
      // Expected failures (insufficient cash, lot gone) roll the attempt back
      // atomically; record the reason / bump attempts in a fresh transaction.
      return this.markOrderUnfilled(orderId, e?.message ?? String(e));
    }
  }

  /**
   * Record a failed fill attempt: bump `attempts`, store the reason, and mark the
   * order permanently 'failed' once it has exhausted its retry budget (so a
   * forever-unfundable order doesn't churn every minute indefinitely).
   */
  private async markOrderUnfilled(
    orderId: string,
    reason: string,
  ): Promise<'failed' | 'skipped'> {
    const MAX_ATTEMPTS = 10;
    return this.positionRepo.manager.transaction(async (tx) => {
      const repo = tx.getRepository(PortfolioPendingOrder);
      const order = await repo.findOne({
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order || order.status !== 'pending') return 'skipped';
      order.attempts = (order.attempts ?? 0) + 1;
      order.error = reason;
      if (order.attempts >= MAX_ATTEMPTS) order.status = 'failed';
      await repo.save(order);
      return order.status === 'failed' ? 'failed' : 'skipped';
    });
  }

  /** Best-effort live price (snapshot close) for a symbol; null if unavailable. */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const snap: any = await this.marketDataService.getSnapshot(symbol);
      const close = Number(snap?.latestPrice?.close);
      return Number.isFinite(close) && close > 0 ? close : null;
    } catch {
      return null;
    }
  }

  /** Read a (user, currency) cash amount without locking; 0 if no row exists. */
  private async getCashAmount(
    userId: string,
    currency: string,
  ): Promise<number> {
    const repo = this.positionRepo.manager.getRepository(PortfolioCashBalance);
    const row = await repo.findOne({ where: { user_id: userId, currency } });
    return row ? Number(row.amount) : 0;
  }

  /** Round to 2 decimals, avoiding binary-float drift on .005 boundaries. */
  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /** Today's date as YYYY-MM-DD (the column type is a plain date). */
  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Resolve a trade currency: explicit value wins, else the ticker's native currency. */
  private async resolveCurrency(
    symbol: string,
    explicit?: string,
  ): Promise<string> {
    if (explicit) return explicit;
    const ticker = await this.tickersService.findOneBySymbol(symbol);
    return ticker?.currency || 'USD';
  }

  /**
   * Apply a signed delta to a (user, currency) cash balance inside a transaction
   * and return the new amount. Find-or-create then mutate; the caller must hold
   * the per-user advisory lock so this read-modify-write is race-free. With
   * `enforce`, a resulting negative balance is rejected.
   */
  private async adjustCashTx(
    tx: EntityManager,
    userId: string,
    currency: string,
    delta: number,
    opts: { enforce: boolean },
  ): Promise<number> {
    const repo = tx.getRepository(PortfolioCashBalance);
    let row = await repo.findOne({
      where: { user_id: userId, currency },
    });
    if (!row) {
      row = repo.create({ user_id: userId, currency, amount: 0 });
    }
    const current = Number(row.amount);
    const next = this.round2(current + delta);
    if (opts.enforce && next < 0) {
      throw new BadRequestException(
        `Insufficient ${currency} cash: need ${Math.abs(delta).toFixed(2)}, ` +
          `have ${current.toFixed(2)}. Deposit cash first.`,
      );
    }
    row.amount = next;
    await repo.save(row);
    return next;
  }

  /** Insert an append-only trade-ledger row inside a transaction. */
  private async insertTradeTx(
    tx: EntityManager,
    t: {
      userId: string;
      positionId?: string | null;
      symbol: string;
      side: 'buy' | 'sell';
      shares: number;
      price: number;
      fees?: number;
      realizedPnl?: number | null;
      currency: string;
      tradeDate: string;
      source?: string;
      externalId?: string | null;
      note?: string | null;
    },
  ): Promise<PortfolioTrade> {
    const repo = tx.getRepository(PortfolioTrade);
    const trade = repo.create({
      user_id: t.userId,
      position_id: t.positionId ?? null,
      symbol: t.symbol,
      side: t.side,
      shares: t.shares,
      price: t.price,
      total_value: this.round2(t.shares * t.price),
      fees: t.fees ?? 0,
      realized_pnl: t.realizedPnl ?? null,
      currency: t.currency,
      trade_date: t.tradeDate,
      source: t.source ?? 'app',
      external_id: t.externalId ?? null,
      note: t.note ?? null,
    });
    return repo.save(trade);
  }

  async findAll(userId: string, displayCurrency?: string): Promise<any[]> {
    const positions = await this.positionRepo.find({
      where: { user_id: userId },
      order: { symbol: 'ASC' },
    });

    const symbols = positions.map((p) => p.symbol);
    if (symbols.length === 0) return [];

    let snapshots: any[] = [];
    try {
      // Fetch full snapshots (Price, Risk, Fundamentals) for all symbols
      snapshots = await this.marketDataService.getSnapshots(symbols);
    } catch {
      // Fallback to empty if fails
    }

    // Create a map for fast lookup
    const snapshotMap = new Map();
    snapshots.forEach((s) => {
      if (s && s.ticker) {
        snapshotMap.set(s.ticker.symbol, s);
      }
    });

    const enriched = positions.map((pos) => {
      const snapshot = snapshotMap.get(pos.symbol);

      // Default values from position or fallback
      let currentPrice = Number(pos.buy_price);
      let changePercent = 0;

      if (snapshot && snapshot.latestPrice) {
        currentPrice = Number(snapshot.latestPrice.close);
        changePercent = Number(snapshot.latestPrice.change || 0); // Assuming 'change' or similar property exists, or calculate diff
        // If latestPrice has 'change' (daily change %), use it.
        // Finnhub quote usually has 'dp'. MarketDataService.getSnapshot maps quote to OHLCV.
        // Let's check MarketDataService.getSnapshot logic.
        // It maps Finnhub quote: o, h, l, c, pc.
        // It doesn't explicitly save 'change' or 'dp' to OHLCV entity usually, unless extended.
        // But getAnalyzerTickers calculates it: ((close - prevClose) / prevClose) * 100

        if (snapshot.latestPrice.prevClose) {
          const close = Number(snapshot.latestPrice.close);
          const prev = Number(snapshot.latestPrice.prevClose);
          if (prev !== 0) {
            changePercent = ((close - prev) / prev) * 100;
          }
        }
      }

      const currentValue = Number(pos.shares) * currentPrice;
      const costBasis = Number(pos.shares) * Number(pos.buy_price);
      const gainLoss = currentValue - costBasis;
      const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

      // Merge the full snapshot data into the response
      // This gives frontend access to:
      // - fundamentals (market_cap, pe, sector)
      // - aiAnalysis (risk, upside, rating)
      // - ticker (logo, name)
      // - counts (analysts, news)
      // Base result in native currency
      const result = {
        ...pos,
        ...snapshot, // Spread the full snapshot (ticker, fundamentals, aiAnalysis, etc.)
        current_price: currentPrice,
        change_percent: changePercent,
        current_value: currentValue,
        cost_basis: costBasis,
        gain_loss: gainLoss,
        gain_loss_percent: gainLossPercent,
      };

      return result;
    });

    // If displayCurrency is specified and differs, convert values
    if (displayCurrency) {
      const conversions = await Promise.all(
        enriched.map(async (pos) => {
          const nativeCurrency = pos.currency || 'USD';
          if (nativeCurrency === displayCurrency) {
            return { ...pos, display_currency: displayCurrency };
          }
          const rate = await this.currencyService.getRate(
            nativeCurrency,
            displayCurrency,
          );

          if (rate === null) {
            return {
              ...pos,
              display_currency: displayCurrency,
              conversion_unavailable: true,
            };
          }

          return {
            ...pos,
            original_currency: pos.currency,
            original_current_price: pos.current_price,
            original_current_value: pos.current_value,
            original_cost_basis: pos.cost_basis,
            original_gain_loss: pos.gain_loss,
            original_buy_price: pos.buy_price,

            currency: displayCurrency,
            current_price: pos.current_price * rate,
            current_value: pos.current_value * rate,
            cost_basis: pos.cost_basis * rate,
            gain_loss: pos.gain_loss * rate,
            buy_price: pos.buy_price * rate,

            conversion_rate: rate,
          };
        }),
      );
      return conversions;
    }

    return enriched;
  }

  async getAllDistinctPortfolioSymbols(): Promise<string[]> {
    const positions = await this.positionRepo
      .createQueryBuilder('position')
      .select('DISTINCT position.symbol', 'symbol')
      .getRawMany();

    return positions.map((p) => p.symbol);
  }

  /**
   * Backfill currency on positions that have 'USD' default by looking up their ticker's native currency.
   * Call this from a cron job to auto-heal existing positions.
   */
  async backfillPositionCurrencies(): Promise<{
    updated: number;
    skipped: number;
  }> {
    const positions = await this.positionRepo.find({
      where: { currency: 'USD' }, // Only positions with default USD
    });

    let updated = 0;
    let skipped = 0;

    for (const pos of positions) {
      const ticker = await this.tickersService.findOneBySymbol(pos.symbol);
      if (ticker && ticker.currency && ticker.currency !== 'USD') {
        pos.currency = ticker.currency;
        await this.positionRepo.save(pos);
        updated++;
      } else {
        skipped++;
      }
    }

    return { updated, skipped };
  }

  async findOne(userId: string, id: string): Promise<PortfolioPosition> {
    const position = await this.positionRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!position) {
      throw new NotFoundException(`Position not found`);
    }
    return position;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdatePortfolioPositionDto,
  ): Promise<PortfolioPosition> {
    const position = await this.findOne(userId, id);
    Object.assign(position, dto);
    return this.positionRepo.save(position);
  }

  async remove(userId: string, id: string): Promise<void> {
    const position = await this.findOne(userId, id);
    await this.positionRepo.remove(position);
  }

  async analyzePortfolio(
    userId: string,
    riskAppetite: string,
    horizon: string = 'medium-term',
    goal: string = 'growth',
    model: string = 'gemini',
  ): Promise<string> {
    const portfolio = await this.findAll(userId);
    if (portfolio.length === 0) {
      return 'You have no positions to analyze. Add some stocks to your portfolio first.';
    }

    // Deduct Credits
    const cost = this.creditService.getModelCost(model);
    await this.creditService.deductCredits(
      userId,
      cost,
      'portfolio_analysis_spend',
      {
        riskAppetite,
        horizon,
        goal,
        model,
      },
    );

    // Construct Prompt
    const portfolioSummary = portfolio
      .map(
        (p) =>
          `- ${p.symbol}: ${p.shares} shares @ $${p.buy_price} (Current: $${p.current_price.toFixed(2)}). G/L: ${p.gain_loss_percent.toFixed(2)}%`,
      )
      .join('\n');

    const riskDir = this.getRiskInstructions(riskAppetite);
    const horizonDir = this.getHorizonInstructions(horizon);
    const goalDir = this.getGoalInstructions(goal);

    const prompt = `
    ### ANALYST PERSONA & CORE MANDATE
    You are a high-conviction financial strategist.
    TONE: ${riskDir.tone}
    STRATEGY FOCUS: ${goalDir.focus} ${horizonDir.focus}
    
    ### CRITICAL CONSTRAINTS (MANDATORY)
    1. ${riskDir.mandate}
    2. ${horizonDir.mandate}
    3. ${goalDir.mandate}

    ### USER PROFILE
    - Risk Appetite: ${riskAppetite} (Stick to this strictly)
    - Investment Horizon: ${horizon}
    - Primary Goal: ${goal}
    
    ### PORTFOLIO DATA
    ${portfolioSummary}

    ### ANALYSIS TASKS
    1. **Risk-Profile Alignment**: ${riskDir.assessmentGuideline}
    2. **Strategic Moves**: Suggest 1-2 moves (Trim/Sell/Add) explicitly designed to achieve the "${goal}" goal within the ${horizon} timeframe.
    3. **High-Impact Opportunities**: ${goalDir.opportunityGuideline} ${riskDir.suggestionGuideline}
    
    ### FORMATTING
    - DO NOT use generic boilerplate.
    - Be punchy, direct, and opinionated.
    - Max 300 words. Use clear Markdown headings.
    `;

    const response = await this.llmService.generateText(prompt, model);

    // Persist to DB
    const analysis = this.analysisRepo.create({
      userId,
      riskAppetite,
      horizon,
      goal,
      model,
      prompt,
      response,
    });
    await this.analysisRepo.save(analysis);

    return response;
  }

  async getAnalyses(userId: string) {
    return this.analysisRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  async getQuickRecommendation(userId: string): Promise<{
    recommendation: string;
    model: string;
    positions: number;
  }> {
    const portfolio = await this.findAll(userId);
    if (portfolio.length === 0) {
      return {
        recommendation:
          'No positions yet. Add stocks to your portfolio to get recommendations.',
        model: 'none',
        positions: 0,
      };
    }

    const portfolioSummary = portfolio
      .map(
        (p) =>
          `- ${p.symbol}: ${p.shares} shares @ $${p.buy_price} (Now: $${p.current_price.toFixed(2)}, G/L: ${p.gain_loss_percent.toFixed(2)}%)`,
      )
      .join('\n');

    const prompt = `Analyze this portfolio and give 3 concise, actionable recommendations.

PORTFOLIO:
${portfolioSummary}

OUTPUT FORMAT (strict Markdown):
### Diversification
[1 sentence assessment]

### Risk Flags
[1-2 sentences on concentration / drawdown risks]

### Next Moves
1. [Specific action: Trim/Add/Hold + ticker + 1-line rationale]
2. [Specific action: Trim/Add/Hold + ticker + 1-line rationale]
3. [Specific action: Trim/Add/Hold + ticker + 1-line rationale]

Keep total under 150 words. Be direct, no boilerplate.`;

    const result = await this.llmService.generateResearch({
      question: prompt,
      tickers: portfolio.map((p) => p.symbol),
      numericContext: {},
      quality: 'recommendation',
      provider: 'gemini',
      maxTokens: 400,
    });

    return {
      recommendation: result.answerMarkdown,
      model: result.models[0] || 'gemini-3.1-flash-lite',
      positions: portfolio.length,
    };
  }

  private getRiskInstructions(riskAppetite: string) {
    const risk = riskAppetite.toLowerCase();

    if (risk === 'high') {
      return {
        tone: "Aggressive, opportunistic, and calculated. Think 'YOLO' but with financial logic.",
        mandate:
          "Do NOT give conservative or 'safe' advice. The user is here for growth and high-risk plays. If they have high-risk stocks, don't tell them to sell just because they are risky—tell them how to double down or find regular high-beta winners.",
        assessmentGuideline:
          "Embrace the volatility. Identify if the 'alpha' potential is high enough.",
        suggestionGuideline:
          "Suggest similar high-risk, high-reward plays, small-caps, or speculative catalysts. Focus on the 'odds' and potential multiples.",
      };
    }

    if (risk === 'low') {
      return {
        tone: 'Conservative, defensive, and wealth-preserving.',
        mandate:
          'Focus on capital preservation, dividends, and blue-chip stability. Warn against excessive volatility.',
        assessmentGuideline:
          "Flag any speculative positions as dangerous 'mismatches' for a conservative profile.",
        suggestionGuideline:
          'Suggest defensive sectors, index funds, or high-dividend yielding blue chips.',
      };
    }

    // Default: Medium
    return {
      tone: 'Balanced, rational, and growth-oriented.',
      mandate:
        "Balance risk and reward. Avoid extreme speculative plays but don't be overly defensive.",
      assessmentGuideline:
        'Identify the core holdings and suggest trimming outliers that are either too risky or too stagnant.',
      suggestionGuideline:
        'Suggest established growth stocks and sector-leading companies.',
    };
  }

  private getHorizonInstructions(horizon: string) {
    const h = horizon.toLowerCase();
    if (h.includes('short')) {
      return {
        focus: 'Immediate catalysts, technical setups, and liquidity.',
        mandate:
          'Ignore 5-year outlooks; focus on what moves the needle in the next 3-6 months.',
      };
    }
    if (h.includes('long')) {
      return {
        focus: 'Fundamental moats, compounding potential, and macro-trends.',
        mandate:
          'Ignore short-term noise; focus on positions that can be held through full market cycles.',
      };
    }
    return {
      focus: 'Medium-term business execution and sector tailwinds.',
      mandate:
        'Focus on the 1-3 year horizon; look for sustainable operational performance.',
    };
  }

  private getGoalInstructions(goal: string) {
    const g = goal.toLowerCase();
    if (g === 'trading' || g.includes('momentum')) {
      return {
        focus: 'Momentum, relative strength, and price action.',
        mandate:
          'Prioritize tickers with high relative strength and clear upward trends.',
        opportunityGuideline:
          "Look for 'hot' sectors and stocks with high institutional accumulation markers.",
      };
    }
    if (g === 'income' || g.includes('dividend')) {
      return {
        focus: 'Cash flow, dividend coverage, and yield stability.',
        mandate: 'Prioritize payout safety and dividend-growth consistency.',
        opportunityGuideline:
          'Identify high-quality yield generators with strong balance sheets.',
      };
    }
    return {
      focus: 'Capital appreciation and revenue growth.',
      mandate:
        'Prioritize companies with accelerating sales or expanding margins.',
      opportunityGuideline:
        'Identify growth engines that are gaining market share.',
    };
  }
}

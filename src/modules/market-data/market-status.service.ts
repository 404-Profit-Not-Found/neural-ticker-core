import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface MarketStatus {
  exchange: string;
  isOpen: boolean;
  session: 'pre-market' | 'regular' | 'post-market' | null;
  holiday: string | null;
  timezone: string;
  timestamp: number;
}

@Injectable()
export class MarketStatusService {
  private readonly logger = new Logger(MarketStatusService.name);
  private cachedStatus: MarketStatus | null = null;
  private lastFetch: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get current market status for US exchanges.
   * Uses Finnhub Market Status API: GET /api/v1/stock/market-status?exchange=US
   */
  async getMarketStatus(exchange = 'US'): Promise<MarketStatus> {
    const now = Date.now();

    // Return cached if fresh
    if (this.cachedStatus && now - this.lastFetch < this.CACHE_TTL_MS) {
      return this.cachedStatus;
    }

    try {
      const apiKey = this.configService.get<string>('finnhub.apiKey');
      const url = `https://finnhub.io/api/v1/stock/market-status?exchange=${exchange}&token=${apiKey}`;

      const { data } = await firstValueFrom(
        this.httpService.get<MarketStatus>(url),
      );

      this.cachedStatus = data;
      this.lastFetch = now;

      this.logger.log(
        `Market Status [${exchange}]: ${data.isOpen ? 'OPEN' : 'CLOSED'} (${data.session || 'closed'})`,
      );
      return data;
    } catch (error) {
      this.logger.error(`Failed to fetch market status: ${error.message}`);
      // Fallback: assume market is closed on error to avoid unnecessary API calls
      return {
        exchange,
        isOpen: false,
        session: null,
        holiday: null,
        timezone: 'America/New_York',
        timestamp: now,
      };
    }
  }

  /**
   * Check if market will be open today (useful for scheduling).
   */
  async isMarketTradingDay(): Promise<boolean> {
    const status = await this.getMarketStatus();
    // If it's a holiday, market is closed all day
    return !status.holiday;
  }

  /**
   * Check if we're in a suitable window for pre-market analysis.
   * Returns true if we're within 30-60 min before regular session.
   */
  async isPreMarketAnalysisWindow(): Promise<boolean> {
    const status = await this.getMarketStatus();
    return status.session === 'pre-market' || status.isOpen;
  }
}

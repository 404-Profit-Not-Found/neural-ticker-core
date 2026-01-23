import { Injectable, Logger } from '@nestjs/common';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';
import { FinnhubService } from '../finnhub/finnhub.service';

export interface MarketStatusResult {
  isOpen: boolean;
  session: 'pre' | 'regular' | 'post' | 'closed';
  timezone: string;
  exchange: string;
  region: 'US' | 'EU' | 'ASIA' | 'OTHER';
  fallback?: boolean;
}

@Injectable()
export class MarketStatusService {
  private readonly logger = new Logger(MarketStatusService.name);

  // Caching & Coalescing
  private statusCache = new Map<
    string,
    { data: MarketStatusResult; expires: number }
  >();
  private pendingRequests = new Map<string, Promise<MarketStatusResult>>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Known EU exchange suffixes and codes
  private readonly EU_EXCHANGES = [
    'LSE',
    'XETRA',
    'PA',
    'AS',
    'MC',
    'MI',
    'SW',
    'VI',
    'BR',
    'HE',
    'CO',
    'ST',
    'OL',
    '.DE',
    '.L',
    '.PA',
    '.AS',
    '.MC',
    '.MI',
    '.SW',
    '.VI',
    '.BR',
    '.HE',
    '.CO',
    '.ST',
    '.OL',
  ];

  constructor(
    private readonly yahooFinanceService: YahooFinanceService,
    private readonly finnhubService: FinnhubService,
  ) {}

  /**
   * Determines the region (US/EU) based on symbol or exchange.
   */
  public getRegion(symbol: string, exchange?: string): 'US' | 'EU' | 'OTHER' {
    const upperSymbol = symbol.toUpperCase();
    const upperExchange = (exchange || '').toUpperCase();

    for (const eu of this.EU_EXCHANGES) {
      if (upperSymbol.includes(eu) || upperExchange.includes(eu)) {
        return 'EU';
      }
    }

    // Default to US for common US exchanges or no suffix
    if (
      !symbol.includes('.') ||
      upperExchange.includes('NASDAQ') ||
      upperExchange.includes('NYSE')
    ) {
      return 'US';
    }

    return 'OTHER';
  }

  /**
   * Gets market status for a specific symbol/exchange.
   * Optimizes performance via Caching & Request Coalescing.
   */
  async getMarketStatus(
    symbol: string = '',
    exchange: string = 'US',
  ): Promise<MarketStatusResult> {
    const region = symbol
      ? this.getRegion(symbol, exchange)
      : exchange === 'ASIA'
        ? 'ASIA'
        : exchange === 'US'
          ? 'US'
          : 'EU';

    // Grouping Key: Status is generally region-wide, not per-ticker.
    // US status is the same for AAPL and MSFT.
    // EU status is the same for all Frankfurt stocks.
    // We cache by Region + Exchange to be safe, or just Region for major markets.
    const cacheKey = `${region}-${exchange}`;

    // 1. Check Cache
    const cached = this.statusCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    // 2. Check Pending Requests (Coalescing)
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey)!;
    }

    // 3. Fetch Fresh Data
    const promise = (async () => {
      try {
        let result: MarketStatusResult;

        if (region === 'EU' || region === 'OTHER') {
          // EU: Try Yahoo Finance ^STOXX50E as proxy first
          if (!symbol && region === 'EU') {
            try {
              result = await this.getStatusFromYahoo('^STOXX50E', 'EU');
            } catch {
              result = this.getEUFallback();
            }
          } else {
            // Specific symbol or OTHER
            if (symbol) {
              result = await this.getStatusFromYahoo(symbol, region);
            } else {
              result = this.getEUFallback();
            }
          }
        } else if (region === 'ASIA') {
          // ASIA: Try Yahoo Finance ^HSI (Hang Seng) as proxy
          try {
            result = await this.getStatusFromYahoo('^HSI', 'ASIA');
          } catch {
            result = this.getAsiaFallback();
          }
        } else {
          // US: Skip Finnhub (restricted on free tier). Use Yahoo Finance ^GSPC as proxy.
          result = await this.getStatusFromYahoo('^GSPC', 'US');
        }

        // 4. Update Cache
        this.statusCache.set(cacheKey, {
          data: result,
          expires: Date.now() + this.CACHE_TTL,
        });

        return result;
      } finally {
        // Cleanup pending request
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, promise);
    return promise;
  }

  /**
   * Gets market status for all major markets (for the MarketStatusBar).
   */
  async getAllMarketsStatus(): Promise<{
    us: MarketStatusResult;
    eu: MarketStatusResult;
    asia: MarketStatusResult;
  }> {
    const [us, eu, asia] = await Promise.all([
      this.getMarketStatus(undefined, 'US'),
      this.getMarketStatus(undefined, 'EU'),
      this.getMarketStatus(undefined, 'ASIA'),
    ]);
    return { us, eu, asia };
  }

  private async getStatusFromYahoo(
    symbol: string,
    region: 'US' | 'EU' | 'ASIA' | 'OTHER',
  ): Promise<MarketStatusResult> {
    try {
      const status = await this.yahooFinanceService.getMarketStatus(symbol);
      return {
        isOpen: status.isOpen,
        session: this.normalizeSession(status.session),
        timezone: status.timezone,
        exchange: status.exchange,
        region,
      };
    } catch {
      this.logger.warn(
        `Yahoo Finance status failed for ${symbol}, using fallback`,
      );
      return region === 'EU'
        ? this.getEUFallback()
        : region === 'ASIA'
          ? this.getAsiaFallback()
          : this.getUSFallback();
    }
  }

  private async getStatusFromFinnhub(
    symbol?: string,
    exchange: string = 'US',
  ): Promise<MarketStatusResult> {
    try {
      const status = await this.finnhubService.getMarketStatus(exchange);
      if (status) {
        return {
          isOpen: status.isOpen,
          session: status.isOpen ? 'regular' : 'closed',
          timezone: status.t || 'America/New_York',
          exchange: exchange,
          region: 'US',
        };
      }
    } catch {
      this.logger.warn(`Finnhub status failed, using fallback`);
    }

    // Fallback: Try Yahoo Finance for US market status (using S&P 500 as proxy)
    // Finnhub free tier often blocks 'marketStatus', but Yahoo quote for ^GSPC is usually available
    if (exchange === 'US') {
      this.logger.debug(
        'Finnhub US status unavailable, checking Yahoo Finance (^GSPC)...',
      );
      return this.getStatusFromYahoo('^GSPC', 'US');
    }

    return this.getUSFallback();
  }

  private normalizeSession(
    session: string,
  ): 'pre' | 'regular' | 'post' | 'closed' {
    const s = session.toLowerCase();
    if (s === 'regular') return 'regular';
    if (s === 'pre' || s === 'prepre') return 'pre';
    if (s === 'post' || s === 'postpost') return 'post';
    return 'closed';
  }

  /**
   * Time-based fallback for US market hours.
   * US markets: 9:30 AM - 4:00 PM ET
   * Pre-market: 4:00 AM - 9:30 AM ET
   * Post-market: 4:00 PM - 8:00 PM ET
   */
  /**
   * Time-based fallback for US market hours.
   * US markets: 9:30 AM - 4:00 PM ET
   * Pre-market: 4:00 AM - 9:30 AM ET
   * Post-market: 4:00 PM - 8:00 PM ET
   */
  private getUSFallback(): MarketStatusResult {
    const now = new Date();

    // Robust time extraction using Intl
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short',
    });

    const parts = formatter.formatToParts(now);
    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    const minutePart = parts.find((p) => p.type === 'minute')?.value;
    const weekdayPart = parts.find((p) => p.type === 'weekday')?.value;

    if (!hourPart || !minutePart || !weekdayPart) {
      // Absolute fallback if Intl fails
      return {
        isOpen: false,
        session: 'closed',
        timezone: 'America/New_York',
        exchange: 'US',
        region: 'US',
        fallback: true,
      };
    }

    const hours = parseInt(hourPart === '24' ? '0' : hourPart, 10);
    const minutes = parseInt(minutePart, 10);
    const timeInMinutes = hours * 60 + minutes;

    // Weekday check (Mon-Fri)
    // Intl weekday returns 'Mon', 'Tue', etc.
    const isWeekend = weekdayPart === 'Sat' || weekdayPart === 'Sun';
    const isWeekday = !isWeekend;

    const preMarketStart = 4 * 60; // 4:00 AM
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM
    const postMarketEnd = 20 * 60; // 8:00 PM

    let session: 'pre' | 'regular' | 'post' | 'closed' = 'closed';
    let isOpen = false;

    if (isWeekday) {
      if (timeInMinutes >= marketOpen && timeInMinutes < marketClose) {
        session = 'regular';
        isOpen = true;
      } else if (
        timeInMinutes >= preMarketStart &&
        timeInMinutes < marketOpen
      ) {
        session = 'pre';
      } else if (
        timeInMinutes >= marketClose &&
        timeInMinutes < postMarketEnd
      ) {
        session = 'post';
      }
    }

    return {
      isOpen,
      session,
      timezone: 'America/New_York',
      exchange: 'US',
      region: 'US',
      fallback: true,
    };
  }

  /**
   * Time-based fallback for EU market hours.
   * EU markets: 9:00 AM - 5:30 PM CET (Xetra core hours)
   * Note: Some exchanges open at 8:00, but 9:00 is core Xetra.
   * Adjusted to 8:00 to match previous logic logic range, but closing at 17:30.
   */
  private getEUFallback(): MarketStatusResult {
    const now = new Date();

    // Robust time extraction using Intl
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short',
    });

    const parts = formatter.formatToParts(now);
    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    const minutePart = parts.find((p) => p.type === 'minute')?.value;
    const weekdayPart = parts.find((p) => p.type === 'weekday')?.value;

    if (!hourPart || !minutePart || !weekdayPart) {
      return {
        isOpen: false,
        session: 'closed',
        timezone: 'Europe/Berlin',
        exchange: 'EU',
        region: 'EU',
        fallback: true,
      };
    }

    const hours = parseInt(hourPart === '24' ? '0' : hourPart, 10);
    const minutes = parseInt(minutePart, 10);
    const timeInMinutes = hours * 60 + minutes;

    const isWeekend = weekdayPart === 'Sat' || weekdayPart === 'Sun';
    const isWeekday = !isWeekend;

    const marketOpen = 8 * 60; // 8:00 AM CET
    const marketClose = 17 * 60 + 30; // 5:30 PM CET

    const isOpen =
      isWeekday && timeInMinutes >= marketOpen && timeInMinutes < marketClose;

    return {
      isOpen,
      session: isOpen ? 'regular' : 'closed',
      timezone: 'Europe/Berlin',
      exchange: 'EU',
      region: 'EU',
      fallback: true,
    };
  }

  /**
   * Time-based fallback for ASIAN market hours (using Hong Kong as approx proxy).
   * HKT is UTC+8.
   * Trading: 9:30 - 16:00 HKT (with lunch break 12:00-13:00, but we'll simplify to open).
   */
  private getAsiaFallback(): MarketStatusResult {
    const now = new Date();

    // Robust time extraction using Intl
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Hong_Kong',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short',
    });

    const parts = formatter.formatToParts(now);
    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    const minutePart = parts.find((p) => p.type === 'minute')?.value;
    const weekdayPart = parts.find((p) => p.type === 'weekday')?.value;

    if (!hourPart || !minutePart || !weekdayPart) {
      return {
        isOpen: false,
        session: 'closed',
        timezone: 'Asia/Hong_Kong',
        exchange: 'ASIA',
        region: 'ASIA',
        fallback: true,
      };
    }

    const hours = parseInt(hourPart === '24' ? '0' : hourPart, 10);
    const minutes = parseInt(minutePart, 10);
    const timeInMinutes = hours * 60 + minutes;

    const isWeekend = weekdayPart === 'Sat' || weekdayPart === 'Sun';
    const isWeekday = !isWeekend;

    const marketOpen = 9 * 60 + 30; // 9:30 AM HKT
    const marketClose = 16 * 60; // 4:00 PM HKT

    const isOpen =
      isWeekday && timeInMinutes >= marketOpen && timeInMinutes < marketClose;

    return {
      isOpen,
      session: isOpen ? 'regular' : 'closed',
      timezone: 'Asia/Hong_Kong',
      exchange: 'ASIA',
      region: 'ASIA',
      fallback: true,
    };
  }
}

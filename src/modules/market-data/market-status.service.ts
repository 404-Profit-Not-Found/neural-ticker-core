import { Injectable, Logger } from '@nestjs/common';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';

export interface MarketStatusResult {
  isOpen: boolean;
  session: 'pre' | 'regular' | 'post' | 'closed';
  timezone: string;
  exchange: string;
  region: 'US' | 'EU' | 'OTHER';
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

  constructor(private readonly yahooFinanceService: YahooFinanceService) {}

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

        // User requested ONLY Yahoo for status.
        // If no symbol provided, use major indices as proxies.
        const statusSymbol = symbol || (region === 'EU' ? '^GDAXI' : '^GSPC');

        try {
          result = await this.getStatusFromYahoo(statusSymbol, region);
        } catch (e) {
          this.logger.warn(
            `Yahoo status check failed for ${statusSymbol}, using fallback: ${e.message}`,
          );
          result =
            region === 'EU' ? this.getEUFallback() : this.getUSFallback();
        }

        // 4. Update Cache (Dynamic TTL)
        // If market is CLOSED, cache for longer (30 mins) to save API calls.
        const isClosed = !result.isOpen || result.session === 'closed';
        const ttl = isClosed ? 30 * 60 * 1000 : this.CACHE_TTL;

        this.statusCache.set(cacheKey, {
          data: result,
          expires: Date.now() + ttl,
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
  }> {
    const [us, eu] = await Promise.all([
      this.getMarketStatus(undefined, 'US'),
      this.getMarketStatus(undefined, 'EU'),
    ]);
    return { us, eu };
  }

  private async getStatusFromYahoo(
    symbol: string,
    region: 'US' | 'EU' | 'OTHER',
  ): Promise<MarketStatusResult> {
    // Optimization: Skip Yahoo on weekends to save API calls
    // Use the region's fallback logic to determine if it's strictly a weekend
    const fallback =
      region === 'EU' ? this.getEUFallback() : this.getUSFallback();

    // Check local system time as a fast proxy (0=Sun, 6=Sat)
    // Ideally we trust fallback's timezone aware logic, but access to it is indirect.
    // However, fallback logic calculates "isWeekend". Rethinking:
    // If I just call fallback and check dates, but getUSFallback constructs new dates.
    // Let's copy the timezone-aware weekend check here.

    const tz = region === 'EU' ? 'Europe/Berlin' : 'America/New_York';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
    });
    const day = formatter.format(new Date()); // 'Sat', 'Sun', etc.
    if (day === 'Sat' || day === 'Sun') {
      return fallback;
    }

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
      return fallback;
    }
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
}

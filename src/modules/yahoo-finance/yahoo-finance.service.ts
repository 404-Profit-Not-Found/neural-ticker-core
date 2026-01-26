import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';
import { getErrorMessage } from '../../utils/error.util';

@Injectable()
export class YahooFinanceService implements OnModuleInit {
  private readonly logger = new Logger(YahooFinanceService.name);
  private yahoo = new YahooFinance({
    suppressNotices: ['yahooSurvey', 'ripHistorical'],
    fetchOptions: {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://finance.yahoo.com/',
        Connection: 'keep-alive',
      },
    },
  });

  onModuleInit() {
    try {
      // @ts-expect-error - explicitly set internal env to be safe as constructor options might be ignored in some builds
      this.yahoo._env.suppressNotices = ['yahooSurvey', 'ripHistorical'];
    } catch {
      // fail silently
    }
    this.logger.log(
      'Yahoo Finance service initialized with suppressed notices and spoofed User-Agent',
    );
  }

  /**
   * Fetches real-time or delayed quote for a symbol.
   */
  async getQuote(symbol: string): Promise<any> {
    try {
      this.logger.debug(`Fetching quote for ${symbol} from Yahoo Finance`);
      return await this.yahoo.quote(symbol);
    } catch (error) {
      this.handleError(error, `Quote fetch failed for ${symbol}`);
      throw error;
    }
  }

  /**
   * Fetches summary profile and financial data.
   */
  async getSummary(symbol: string): Promise<any> {
    try {
      this.logger.debug(`Fetching summary for ${symbol} from Yahoo Finance`);
      return await this.yahoo.quoteSummary(symbol, {
        modules: [
          'summaryProfile',
          'defaultKeyStatistics',
          'financialData',
          'calendarEvents',
          'earnings',
          'summaryDetail', // Added for 52-week range and other details
        ],
      });
    } catch (error) {
      this.handleError(error, `Summary fetch failed for ${symbol}`);
      throw error;
    }
  }

  /**
   * Fetches chart data (supports intraday).
   */
  async getChart(
    symbol: string,
    interval: '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '1h' | '1d' = '1d',
    from?: Date,
    to?: Date,
  ): Promise<any> {
    try {
      this.logger.debug(
        `Fetching chart data for ${symbol} with interval ${interval}`,
      );

      const queryOptions: any = { interval };
      if (from) queryOptions.period1 = from;
      if (to) queryOptions.period2 = to;

      // If no dates, yahoo chart defaults to appropriate range, but we usually pass them.

      const result = await this.yahoo.chart(symbol, queryOptions);

      return result;
    } catch (error) {
      this.handleError(error, `Chart fetch failed for ${symbol}`);
      // return null or throw?
      // Service expects us to throw if completely failed?
      // Let's force return null on error to handle gracefully in caller
      return null;
    }
  }

  /**
   * Fetches historical OHLCV data.
   */
  async getHistorical(
    symbol: string,
    from: Date,
    to: Date = new Date(),
    interval: '1d' | '1wk' | '1mo' = '1d',
  ): Promise<any> {
    try {
      this.logger.debug(
        `Fetching historical data for ${symbol} from Yahoo Finance`,
      );
      return await this.yahoo.historical(symbol, {
        period1: from,
        period2: to,
        interval,
      });
    } catch (error) {
      this.handleError(error, `Historical fetch failed for ${symbol}`);
      throw error;
    }
  }

  /**
   * Gets market status for a symbol from its quote data.
   * Useful for EU stocks where Finnhub doesn't provide market status.
   */
  async getMarketStatus(symbol: string): Promise<{
    isOpen: boolean;
    session: string;
    timezone: string;
    exchange: string;
  }> {
    try {
      const quote = await this.getQuote(symbol);
      const marketState = (quote?.marketState || 'CLOSED').toLowerCase();
      const isOpen = marketState === 'regular';
      return {
        isOpen,
        session: marketState,
        timezone: quote?.exchangeTimezoneName || 'Unknown',
        exchange: quote?.fullExchangeName || quote?.exchange || 'Unknown',
      };
    } catch (error) {
      this.handleError(error, `Market status fetch failed for ${symbol}`);
      // Return a safe fallback
      return {
        isOpen: false,
        session: 'closed',
        timezone: 'Unknown',
        exchange: 'Unknown',
      };
    }
  }

  /**
   * Searches for symbols or news related to a query.
   */
  async search(query: string): Promise<any> {
    try {
      this.logger.debug(`Searching for "${query}" on Yahoo Finance`);
      return await this.yahoo.search(query);
    } catch (error) {
      this.handleError(error, `Search failed for "${query}"`);
      throw error;
    }
  }

  private handleError(error: any, context: string) {
    this.logger.error(`${context}: ${getErrorMessage(error)}`);
  }
}

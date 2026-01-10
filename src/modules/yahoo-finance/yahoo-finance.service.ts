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
        ],
      });
    } catch (error) {
      this.handleError(error, `Summary fetch failed for ${symbol}`);
      throw error;
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

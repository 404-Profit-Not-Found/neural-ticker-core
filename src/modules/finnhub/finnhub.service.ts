import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getErrorMessage } from '../../utils/error.util';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const finnhub = require('finnhub');

@Injectable()
export class FinnhubService implements OnModuleInit {
  private readonly logger = new Logger(FinnhubService.name);
  private finnhubClient: any;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('finnhub.apiKey');
    this.finnhubClient = new finnhub.DefaultApi(apiKey);
  }

  async getCompanyProfile(symbol: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.finnhubClient.companyProfile2(
        { symbol },
        (error: any, data: any) => {
          if (error) {
            this.handleError(error, symbol);
            return reject(new Error(getErrorMessage(error)));
          }
          resolve(data);
        },
      );
    });
  }

  async getQuote(symbol: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.finnhubClient.quote(symbol, (error: any, data: any) => {
        if (error) {
          this.handleError(error, symbol);
          return reject(new Error(getErrorMessage(error)));
        }
        resolve(data);
      });
    });
  }

  async getCompanyNews(symbol: string, from: string, to: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.finnhubClient.companyNews(
        symbol,
        from,
        to,
        (error: any, data: any) => {
          if (error) {
            this.handleError(error, symbol);
            return reject(new Error(getErrorMessage(error)));
          }
          resolve(data);
        },
      );
    });
  }

  async getGeneralNews(category = 'general', minId?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.finnhubClient.marketNews(
        category,
        { minId },
        (error: any, data: any) => {
          if (error) {
            this.handleError(error, 'general-news');
            return reject(new Error(getErrorMessage(error)));
          }
          resolve(data);
        },
      );
    });
  }

  async getBasicFinancials(symbol: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.finnhubClient.companyBasicFinancials(
        symbol,
        'all',
        (error: any, data: any) => {
          if (error) {
            this.handleError(error, symbol);
            return reject(new Error(getErrorMessage(error)));
          }
          resolve(data);
        },
      );
    });
  }

  async getSymbols(exchange: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.finnhubClient.stockSymbols(exchange, {}, (error: any, data: any) => {
        if (error) {
          this.handleError(error, exchange);
          return reject(new Error(getErrorMessage(error)));
        }
        resolve(data);
      });
    });
  }

  async getHistorical(
    symbol: string,
    resolution: string,
    from: number,
    to: number,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.finnhubClient.stockCandles(
        symbol,
        resolution,
        from,
        to,
        (error: any, data: any) => {
          if (error) {
            this.handleError(error, symbol);
            return reject(new Error(getErrorMessage(error)));
          }
          resolve(data);
        },
      );
    });
  }

  async searchSymbols(query: string): Promise<any> {
    return new Promise((resolve) => {
      this.finnhubClient.symbolSearch(query, {}, (error: any, data: any) => {
        if (error) {
          this.handleError(error, 'symbolSearch');
          return resolve({ result: [] }); // Fail gracefully for search
        }
        resolve(data);
      });
    });
  }

  private marketStatusCache: Record<string, { data: any; timestamp: number }> =
    {};
  private readonly CACHE_TTL = 60 * 1000; // 1 minute

  async getMarketStatus(exchange: string): Promise<any> {
    // Standardize exchange (Finnhub free tier primarily supports US)
    const targetExchange = exchange === 'US' ? 'US' : 'US';

    const cached = this.marketStatusCache[targetExchange];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    return new Promise((resolve) => {
      this.finnhubClient.marketStatus(
        { exchange: targetExchange },
        (error: any, data: any) => {
          if (error) {
            const msg = getErrorMessage(error);
            // Suppress warnings for market status access restrictions (common on free tier)
            if (
              msg.toLowerCase().includes('access') ||
              msg.includes('403') ||
              msg.toLowerCase().includes('plan')
            ) {
              this.logger.debug(
                `Market status access restricted (${targetExchange}), returning null.`,
              );
              return resolve(null);
            }

            this.handleError(error, `marketStatus-${targetExchange}`);
            // Gracefully return null when access is restricted
            return resolve(null);
          }
          this.marketStatusCache[targetExchange] = {
            data,
            timestamp: Date.now(),
          };
          resolve(data);
        },
      );
    });
  }

  private handleError(error: any, context?: string) {
    const msg = getErrorMessage(error);
    const logMsg = `Finnhub API Error [${context}]: ${msg}`;

    // Downgrade noise for common restricted access errors (where we usually fallback)
    if (
      msg.includes('429') ||
      msg.toLowerCase().includes('limit') ||
      msg.toLowerCase().includes('too many')
    ) {
      this.logger.error(`🚨 FINNHUB RATE LIMIT EXCEEDED [${context}]: ${msg}`);
    } else if (
      msg.toLowerCase().includes('access') ||
      msg.toLowerCase().includes('restricted') ||
      msg.toLowerCase().includes('plan')
    ) {
      this.logger.warn(logMsg);
    } else {
      this.logger.error(logMsg);
    }
  }
}

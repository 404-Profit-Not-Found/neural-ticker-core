import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
      this.finnhubClient.companyProfile2({ symbol }, (error: any, data: any) => {
        if (error) {
          this.handleError(error, symbol);
          return reject(error);
        }
        resolve(data);
      });
    });
  }

  async getQuote(symbol: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.finnhubClient.quote(symbol, (error: any, data: any) => {
        if (error) {
          this.handleError(error, symbol);
          return reject(error);
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
            return reject(error);
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
            return reject(error);
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
            return reject(error);
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
          return reject(error);
        }
        resolve(data);
      });
    });
  }

  private handleError(error: any, context?: string) {
    this.logger.error(`Finnhub API Error [${context}]: ${error.message || error}`);
  }
}

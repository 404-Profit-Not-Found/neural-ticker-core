import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

@Injectable()
export class FinnhubService {
  private readonly logger = new Logger(FinnhubService.name);

  constructor(private readonly httpService: HttpService) {}

  async getCompanyProfile(symbol: string): Promise<any> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get('/stock/profile2', {
          params: { symbol },
        }),
      );
      return data;
    } catch (error) {
      this.handleError(error, symbol);
    }
  }

  async getQuote(symbol: string): Promise<any> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get('/quote', {
          params: { symbol },
        }),
      );
      return data;
    } catch (error) {
      this.handleError(error, symbol);
    }
  }

  async getCompanyNews(symbol: string, from: string, to: string): Promise<any> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get('/company-news', {
          params: { symbol, from, to },
        }),
      );
      return data;
    } catch (error) {
      this.handleError(error, symbol);
    }
  }

  private handleError(error: any, context?: string) {
    if (error instanceof AxiosError) {
      this.logger.error(
        `Finnhub API Error [${context}]: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`,
      );
    } else {
      this.logger.error(`Unexpected Error [${context}]: ${error.message}`);
    }
    throw error;
  }
}

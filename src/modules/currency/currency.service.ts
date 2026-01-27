import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  lastUpdated: Date;
}

@Injectable()
export class CurrencyService implements OnModuleInit {
  private readonly logger = new Logger(CurrencyService.name);
  private cachedRates: ExchangeRates | null = null;
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  private readonly SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.refreshRates();
  }

  async getRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;

    const rates = await this.getRates();
    if (!rates) {
      this.logger.warn(`No exchange rates available, returning 1 for ${from}/${to}`);
      return 1;
    }

    // Rates are relative to USD
    const fromRate = from === 'USD' ? 1 : rates.rates[from];
    const toRate = to === 'USD' ? 1 : rates.rates[to];

    if (!fromRate || !toRate) {
      this.logger.warn(`Missing rate for ${from} or ${to}, returning 1`);
      return 1;
    }

    // Convert: amount in 'from' currency to USD, then to 'to' currency
    return toRate / fromRate;
  }

  async convert(amount: number, from: string, to: string): Promise<number> {
    const rate = await this.getRate(from, to);
    return amount * rate;
  }

  getSupportedCurrencies(): string[] {
    return this.SUPPORTED_CURRENCIES;
  }

  async getRates(): Promise<ExchangeRates | null> {
    if (this.cachedRates && this.isCacheValid()) {
      return this.cachedRates;
    }
    return this.refreshRates();
  }

  private isCacheValid(): boolean {
    if (!this.cachedRates) return false;
    const age = Date.now() - this.cachedRates.lastUpdated.getTime();
    return age < this.CACHE_TTL_MS;
  }

  private async refreshRates(): Promise<ExchangeRates | null> {
    const apiKey = this.configService.get<string>('EXCHANGERATE');
    if (!apiKey) {
      this.logger.error('EXCHANGERATE API key not configured');
      return this.cachedRates;
    }

    try {
      // ExchangeRate-API format: https://v6.exchangerate-api.com/v6/YOUR-API-KEY/latest/USD
      const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;
      this.logger.debug(`Fetching exchange rates from ExchangeRate-API`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.result !== 'success') {
        throw new Error(data['error-type'] || 'Unknown API error');
      }

      // Filter to only supported currencies
      const filteredRates: Record<string, number> = {};
      for (const currency of this.SUPPORTED_CURRENCIES) {
        if (data.conversion_rates[currency]) {
          filteredRates[currency] = data.conversion_rates[currency];
        }
      }

      this.cachedRates = {
        base: 'USD',
        rates: filteredRates,
        lastUpdated: new Date(),
      };

      this.logger.log(`Exchange rates updated: ${Object.keys(filteredRates).length} currencies`);
      return this.cachedRates;
    } catch (error) {
      this.logger.error(`Failed to fetch exchange rates: ${error}`);
      // Return stale cache if available
      return this.cachedRates;
    }
  }
}

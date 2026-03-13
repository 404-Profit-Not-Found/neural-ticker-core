import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRateEntity } from './entities/exchange-rate.entity';

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
  // Removed hardcoded list to support dynamic API rates
  // private readonly SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ExchangeRateEntity)
    private readonly rateRepo: Repository<ExchangeRateEntity>,
  ) {}

  async onModuleInit() {
    await this.refreshRates();
  }

  async getRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;

    // Ensure we have rates
    const rates = await this.getRates();
    if (!rates) {
      this.logger.error(
        `CRITICAL: No exchange rates available. Returning 1.0 for ${from}/${to} - VALUES WILL BE INCORRECT.`,
      );
      return 1;
    }

    // Rates are relative to USD (Base)
    const fromRate = from === 'USD' ? 1 : rates.rates[from];
    const toRate = to === 'USD' ? 1 : rates.rates[to];

    if (!fromRate || !toRate) {
      this.logger.warn(
        `Missing rate for ${from} or ${to} (Base: ${rates.base}). Defaulting to 1.`,
      );
      return 1;
    }

    return toRate / fromRate;
  }

  async convert(amount: number, from: string, to: string): Promise<number> {
    const rate = await this.getRate(from, to);
    return amount * rate;
  }

  getSupportedCurrencies(): string[] {
    if (!this.cachedRates || !this.cachedRates.rates) return ['USD'];
    return Object.keys(this.cachedRates.rates).sort();
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

  /**
   * Tries to fetch from API.
   * If API fails, falls back to Database.
   * If Database has data, updates Cache.
   */
  private async refreshRates(): Promise<ExchangeRates | null> {
    const ratesMap: Record<string, number> = {};
    let source = 'NONE';

    // 1. Try API
    try {
      const apiKey = this.configService.get<string>('EXCHANGERATE');
      if (apiKey) {
        this.logger.debug(`Fetching exchange rates from ExchangeRate-API...`);
        const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;
        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          if (data.result === 'success') {
            const entities: ExchangeRateEntity[] = [];

            // Add USD implicitly (Base)
            ratesMap['USD'] = 1;

            // Save ALL rates provided by the API
            for (const [currency, rate] of Object.entries(
              data.conversion_rates,
            )) {
              if (typeof rate === 'number') {
                ratesMap[currency] = rate;
                entities.push(
                  this.rateRepo.create({
                    currency_code: currency,
                    rate_to_usd: rate,
                    last_updated: new Date(),
                  }),
                );
              }
            }

            // Batch Save to DB
            if (entities.length > 0) {
              await this.rateRepo.save(entities);
              source = 'API';
            }
          }
        }
      } else {
        this.logger.warn(
          'EXCHANGERATE API key is missing. Skipping API fetch.',
        );
      }
    } catch (e) {
      this.logger.warn(`ExchangeRate API failed: ${e}`);
    }

    // 2. If API failed (or yielded no results), try DB Fallback
    if (Object.keys(ratesMap).length <= 1) {
      // <= 1 because USD is always added
      try {
        const dbRates = await this.rateRepo.find();
        if (dbRates.length > 0) {
          dbRates.forEach((r) => {
            ratesMap[r.currency_code] = r.rate_to_usd;
          });
          source = 'DATABASE';
          this.logger.log(
            `Loaded ${dbRates.length} rates from Database (Fallback)`,
          );
        }
      } catch (e) {
        this.logger.error(`Database rate fetch failed: ${e}`);
      }
    }

    // 3. Update Cache if we have data
    if (Object.keys(ratesMap).length > 1) {
      this.cachedRates = {
        base: 'USD',
        rates: ratesMap,
        lastUpdated: new Date(),
      };
      if (source === 'API') {
        this.logger.log(
          `Exchange rates updated from API: ${Object.keys(ratesMap).length} currencies`,
        );
      }
    } else {
      // If we represent a failure state
      if (this.cachedRates) {
        this.logger.warn('Refresh failed. Using stale cache.');
      } else {
        this.logger.error(
          'Could not load exchange rates from API or DB. System running without FX data.',
        );
      }
    }

    return this.cachedRates;
  }
}

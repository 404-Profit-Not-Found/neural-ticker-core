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
  // De-dupes concurrent refreshes so 80 simultaneous requests (prod container
  // concurrency) trigger ONE fetch chain, not 80.
  private refreshPromise: Promise<ExchangeRates | null> | null = null;
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  private readonly FETCH_TIMEOUT_MS = 6000;
  // Removed hardcoded list to support dynamic API rates
  // private readonly SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];

  /**
   * Static rate snapshot (units of currency per 1 USD) — the very last resort,
   * reached only on a cold instance where ALL live sources (keyed + keyless)
   * AND the DB cache are unreachable. These are deliberately real, recent rates
   * — NOT 1.0 — so values stay approximately correct rather than corrupt, and
   * are replaced automatically on the next successful refresh.
   * Snapshot: 2026-06-20 (ExchangeRate-API, base USD).
   */
  private static readonly FALLBACK_RATES: Record<string, number> = {
    USD: 1,
    EUR: 0.872,
    GBP: 0.7559,
    CHF: 0.8068,
    JPY: 161.2229,
    CAD: 1.4149,
    AUD: 1.4256,
    DKK: 6.5065,
    HKD: 7.8377,
    SEK: 9.5792,
    NOK: 9.693,
    CNY: 6.789,
    SGD: 1.2907,
    KRW: 1531.0046,
    INR: 94.4113,
    BRL: 5.1559,
    MXN: 17.3329,
    NZD: 1.7419,
    ZAR: 16.4561,
    PLN: 3.7124,
    TRY: 46.4549,
    ILS: 2.9592,
    TWD: 31.6463,
    CZK: 21.1057,
    HUF: 306.9427,
  };

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ExchangeRateEntity)
    private readonly rateRepo: Repository<ExchangeRateEntity>,
  ) {}

  async onModuleInit() {
    await this.refreshRates();
  }

  /**
   * Returns the conversion rate from->to, or `null` when rates are genuinely
   * unavailable (no FX data, or a missing currency). Callers MUST handle null
   * and surface "conversion unavailable" rather than silently using 1.0, which
   * would corrupt foreign-currency values.
   */
  async getRate(from: string, to: string): Promise<number | null> {
    if (from === to) return 1;

    // Ensure we have rates
    const rates = await this.getRates();
    if (!rates) {
      this.logger.error(
        `No exchange rates available for ${from}/${to}. Returning null (conversion unavailable).`,
      );
      return null;
    }

    // Rates are relative to USD (Base)
    const fromRate = from === 'USD' ? 1 : rates.rates[from];
    const toRate = to === 'USD' ? 1 : rates.rates[to];

    if (!fromRate || !toRate) {
      this.logger.warn(
        `Missing rate for ${from} or ${to} (Base: ${rates.base}). Returning null (conversion unavailable).`,
      );
      return null;
    }

    return toRate / fromRate;
  }

  async convert(
    amount: number,
    from: string,
    to: string,
  ): Promise<number | null> {
    const rate = await this.getRate(from, to);
    if (rate === null) return null;
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
    // Single shared refresh for all concurrent callers.
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshRates().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private isCacheValid(): boolean {
    if (!this.cachedRates) return false;
    const age = Date.now() - this.cachedRates.lastUpdated.getTime();
    return age < this.CACHE_TTL_MS;
  }

  /**
   * Self-healing refresh. Tries live sources in priority order, then the DB
   * cache, then the static snapshot floor. The KEYLESS live sources are what
   * make this self-heal: even an environment with no EXCHANGERATE key and an
   * empty exchange_rates table loads live rates with zero manual intervention,
   * and every success is persisted to the DB for the next cold start.
   */
  private async refreshRates(): Promise<ExchangeRates | null> {
    // 1. Live sources, tried in order until one returns real rates.
    const providers: Array<{
      name: string;
      fetch: () => Promise<Record<string, number>>;
    }> = [
      // Keyed ExchangeRate-API first (highest update frequency) — used only if
      // a key is configured; silently skipped otherwise.
      { name: 'ExchangeRate-API (keyed)', fetch: () => this.fetchKeyedApi() },
      // Keyless ExchangeRate-API open tier — ~160 currencies, no key required.
      { name: 'open.er-api.com (keyless)', fetch: () => this.fetchOpenErApi() },
      // Keyless Frankfurter (ECB) — ~30 majors, independent provider/origin.
      {
        name: 'Frankfurter/ECB (keyless)',
        fetch: () => this.fetchFrankfurter(),
      },
    ];

    for (const provider of providers) {
      try {
        const rates = await provider.fetch();
        // > 1 because USD:1 is always present; require ≥1 real currency.
        if (Object.keys(rates).length > 1) {
          await this.persistRates(rates);
          this.cachedRates = { base: 'USD', rates, lastUpdated: new Date() };
          this.logger.log(
            `Exchange rates updated from ${provider.name}: ${Object.keys(rates).length} currencies`,
          );
          return this.cachedRates;
        }
      } catch (e) {
        this.logger.warn(`FX provider "${provider.name}" failed: ${e}`);
      }
    }

    // 2. All live sources failed → DB cache persisted on a previous run.
    try {
      const dbRates = await this.rateRepo.find();
      if (dbRates.length > 0) {
        const rates: Record<string, number> = { USD: 1 };
        dbRates.forEach((r) => {
          rates[r.currency_code] = r.rate_to_usd;
        });
        this.cachedRates = { base: 'USD', rates, lastUpdated: new Date() };
        this.logger.warn(
          `Live FX sources unavailable — loaded ${dbRates.length} rates from DB cache.`,
        );
        return this.cachedRates;
      }
    } catch (e) {
      this.logger.error(`Database rate fetch failed: ${e}`);
    }

    // 3. Nothing live, nothing in DB. Keep an existing (stale) cache rather
    // than downgrading it; only on a truly cold instance fall to the snapshot.
    if (this.cachedRates) {
      this.logger.warn(
        'FX refresh failed on every source — keeping existing (stale) cache.',
      );
      return this.cachedRates;
    }

    this.cachedRates = {
      base: 'USD',
      rates: { ...CurrencyService.FALLBACK_RATES },
      lastUpdated: new Date(),
    };
    this.logger.error(
      'All live FX sources and the DB are unavailable — using STATIC FALLBACK ' +
        'snapshot. This self-heals automatically on the next successful refresh.',
    );
    return this.cachedRates;
  }

  // --- Live providers -------------------------------------------------------

  /** Keyed ExchangeRate-API. Returns {} when no key is configured. */
  private async fetchKeyedApi(): Promise<Record<string, number>> {
    const apiKey = this.configService.get<string>('EXCHANGERATE');
    if (!apiKey) return {};
    const data = await this.fetchJson(
      `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`,
    );
    if (data?.result !== 'success' || !data?.conversion_rates) return {};
    return this.normalizeRates(data.conversion_rates);
  }

  /** Keyless ExchangeRate-API "open" tier (~160 currencies). */
  private async fetchOpenErApi(): Promise<Record<string, number>> {
    const data = await this.fetchJson('https://open.er-api.com/v6/latest/USD');
    if (data?.result !== 'success' || !data?.rates) return {};
    return this.normalizeRates(data.rates);
  }

  /** Keyless Frankfurter (European Central Bank, ~30 majors). */
  private async fetchFrankfurter(): Promise<Record<string, number>> {
    const data = await this.fetchJson(
      'https://api.frankfurter.dev/v1/latest?base=USD',
    );
    if (!data?.rates) return {};
    return this.normalizeRates(data.rates);
  }

  // --- Helpers --------------------------------------------------------------

  /** GET JSON with a hard timeout so a hung provider can't stall the chain. */
  private async fetchJson(url: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Coerce a provider payload into a clean {CCY: number} map with USD=1. */
  private normalizeRates(raw: Record<string, unknown>): Record<string, number> {
    const map: Record<string, number> = { USD: 1 };
    for (const [ccy, rate] of Object.entries(raw)) {
      if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
        map[ccy.toUpperCase()] = rate;
      }
    }
    return map;
  }

  /**
   * Persist rates to the DB so they survive restarts and serve as the offline
   * fallback. Best-effort: a DB failure must not stop in-memory rates from
   * being used (e.g. a read-replica or a transient outage).
   */
  private async persistRates(rates: Record<string, number>): Promise<void> {
    try {
      const entities = Object.entries(rates).map(([code, rate]) =>
        this.rateRepo.create({
          currency_code: code,
          rate_to_usd: rate,
          last_updated: new Date(),
        }),
      );
      if (entities.length > 0) await this.rateRepo.save(entities);
    } catch (e) {
      this.logger.warn(`Failed to persist exchange rates to DB: ${e}`);
    }
  }
}

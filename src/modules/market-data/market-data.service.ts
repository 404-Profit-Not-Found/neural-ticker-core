import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, ArrayContains, Brackets } from 'typeorm';
import { ConfigService } from '@nestjs/config'; // Added
import { PriceOhlcv } from './entities/price-ohlcv.entity';
import { Fundamentals } from './entities/fundamentals.entity';
import { AnalystRating } from './entities/analyst-rating.entity';
import { RiskAnalysis } from '../risk-reward/entities/risk-analysis.entity';
import { RiskScenario } from '../risk-reward/entities/risk-scenario.entity';
import { ResearchNote } from '../research/entities/research-note.entity';
import { TickerEntity as Ticker } from '../tickers/entities/ticker.entity';
import { Comment } from '../social/entities/comment.entity';
import { CompanyNews } from './entities/company-news.entity';
import { TickersService } from '../tickers/tickers.service';
import { FinnhubService } from '../finnhub/finnhub.service';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';
import { RISK_ALGO } from '../../config/risk-algorithm.config';
import { GetAnalyzerTickersOptions } from './interfaces/get-analyzer-tickers-options.interface';

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(
    @InjectRepository(PriceOhlcv)
    private readonly ohlcvRepo: Repository<PriceOhlcv>,
    @InjectRepository(Fundamentals)
    private readonly fundamentalsRepo: Repository<Fundamentals>,
    @InjectRepository(AnalystRating)
    private readonly analystRatingRepo: Repository<AnalystRating>,
    @InjectRepository(RiskAnalysis)
    private readonly riskAnalysisRepo: Repository<RiskAnalysis>,
    @InjectRepository(ResearchNote)
    @InjectRepository(ResearchNote)
    private readonly researchNoteRepo: Repository<ResearchNote>,
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
    @InjectRepository(CompanyNews)
    private readonly companyNewsRepo: Repository<CompanyNews>,
    @InjectRepository(Ticker)
    private readonly tickerRepo: Repository<Ticker>,
    @Inject(forwardRef(() => TickersService))
    private readonly tickersService: TickersService,
    private readonly finnhubService: FinnhubService,
    private readonly yahooFinanceService: YahooFinanceService,
    private readonly configService: ConfigService, // Added
  ) {}

  async getQuote(symbol: string) {
    try {
      const finnhubQuote = await this.finnhubService.getQuote(symbol);
      // If Finnhub returns zeros for price (e.g. restricted for free users), try Yahoo
      if (finnhubQuote && finnhubQuote.c !== 0) {
        return finnhubQuote;
      }

      this.logger.log(
        `Finnhub quote missing or zero for ${symbol}, trying Yahoo fallback...`,
      );
      const yahooQuote = await this.yahooFinanceService.getQuote(symbol);
      if (yahooQuote) {
        return {
          c: yahooQuote.regularMarketPrice,
          h: yahooQuote.regularMarketDayHigh,
          l: yahooQuote.regularMarketDayLow,
          o: yahooQuote.regularMarketOpen,
          pc: yahooQuote.regularMarketPreviousClose,
          t: Math.floor(yahooQuote.regularMarketTime.getTime() / 1000),
          v: yahooQuote.regularMarketVolume,
        };
      }
      return null;
    } catch (e) {
      this.logger.warn(
        `Fallback to Yahoo for quote ${symbol} due to error: ${e.message}`,
      );
      try {
        const yahooQuote = await this.yahooFinanceService.getQuote(symbol);
        if (yahooQuote) {
          return {
            c: yahooQuote.regularMarketPrice,
            h: yahooQuote.regularMarketDayHigh,
            l: yahooQuote.regularMarketDayLow,
            o: yahooQuote.regularMarketOpen,
            pc: yahooQuote.regularMarketPreviousClose,
            t: Math.floor(yahooQuote.regularMarketTime.getTime() / 1000),
            v: yahooQuote.regularMarketVolume,
          };
        }
      } catch (yError) {
        this.logger.error(
          `Yahoo quote also failed for ${symbol}: ${yError.message}`,
        );
      }
      return null;
    }
  }

  async getSnapshot(symbol: string) {
    const tickerEntity = await this.tickersService.awaitEnsureTicker(symbol);

    // Configurable stale thresholds
    const MARKET_DATA_STALE_MINUTES = this.configService.get<number>(
      'marketData.stalePriceMinutes',
      15,
    );
    const FUNDAMENTALS_STALE_HOURS = this.configService.get<number>(
      'marketData.staleFundamentalsHours',
      24,
    );

    // Fetch latest candle from DB
    let latestCandle = await this.ohlcvRepo.findOne({
      where: { symbol_id: tickerEntity.id },
      order: { ts: 'DESC' },
    });

    // Fetch fundamentals from DB
    let fundamentals = await this.fundamentalsRepo.findOne({
      where: { symbol_id: tickerEntity.id },
    });

    const isPriceStale =
      !latestCandle ||
      Date.now() - latestCandle.ts.getTime() >
        MARKET_DATA_STALE_MINUTES * 60 * 1000;
    const isFundamentalsStale =
      !fundamentals ||
      Date.now() - fundamentals.updated_at.getTime() >
        FUNDAMENTALS_STALE_HOURS * 60 * 60 * 1000;

    let source = 'database';

    if (isPriceStale || isFundamentalsStale) {
      this.logger.log(
        `Data stale for ${symbol} (Price: ${isPriceStale}, Fundamentals: ${isFundamentalsStale}). Fetching from Finnhub...`,
      );
      try {
        const [quote, profile, financials] = await Promise.all([
          this.finnhubService.getQuote(symbol),
          this.finnhubService.getCompanyProfile(symbol),
          this.finnhubService.getBasicFinancials(symbol),
        ]);

        source = 'finnhub';

        // Check if Finnhub returned actually usable data
        const isFinnhubRestricted = !quote || quote.c === 0;

        if (isFinnhubRestricted) {
          this.logger.warn(
            `Finnhub data restricted for ${symbol}, fetching from Yahoo Finance...`,
          );
          const yahooData = await this.fetchFullSnapshotFromYahoo(symbol);
          if (yahooData) {
            source = 'yahoo';
            if (yahooData.quote) {
              const newCandle = this.saveYahooQuoteAsCandle(
                tickerEntity.id,
                yahooData.quote,
              );
              latestCandle = await this.ohlcvRepo.save(newCandle).catch((e) => {
                this.logger.warn(`Failed to save Yahoo candle: ${e.message}`);
                return latestCandle;
              });
            }
            if (yahooData.summary) {
              fundamentals = await this.applyYahooEnrichment(
                tickerEntity.id,
                fundamentals,
                yahooData.summary,
                yahooData.quote,
              );
            }
          }
        } else {
          // Normal Finnhub path
          if (quote) {
            const newCandle = this.ohlcvRepo.create({
              symbol_id: tickerEntity.id,
              ts: new Date(quote.t * 1000),
              timeframe: '1d',
              open: quote.o,
              high: quote.h,
              low: quote.l,
              close: quote.c,
              prevClose: quote.pc,
              volume: 0,
              source: 'finnhub_quote',
            });
            await this.ohlcvRepo
              .save(newCandle)
              .catch((e) =>
                this.logger.warn(`Failed to save candle: ${e.message}`),
              );
            latestCandle = newCandle;
          }

          if (profile || financials?.metric) {
            const metrics = financials?.metric || {};
            const entity =
              fundamentals ||
              this.fundamentalsRepo.create({ symbol_id: tickerEntity.id });

            if (profile) {
              entity.market_cap = profile.marketCapitalization;
              entity.sector = profile.finnhubIndustry;
            }

            if (metrics) {
              if (metrics.peTTM) entity.pe_ttm = metrics.peTTM;
              if (metrics.epsTTM) entity.eps_ttm = metrics.epsTTM;
              if (metrics.beta) entity.beta = metrics.beta;
              if (metrics.dividendYieldIndicatedAnnual)
                entity.dividend_yield = metrics.dividendYieldIndicatedAnnual;
            }

            // Optional: Enrich with Yahoo even if Finnhub worked, if we want "depth"
            try {
              const yahooSummary =
                await this.yahooFinanceService.getSummary(symbol);
              if (yahooSummary) {
                await this.applyYahooEnrichment(
                  tickerEntity.id,
                  entity,
                  yahooSummary,
                );
              }
            } catch (ye) {
              this.logger.debug(
                `Background Yahoo enrichment skipped for ${symbol}: ${ye.message}`,
              );
            }

            entity.updated_at = new Date();
            await this.fundamentalsRepo.save(entity);
            fundamentals = entity;
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to refresh data for ${symbol} via Finnhub: ${error.message}. Triggering Yahoo fallback...`,
        );
        const yahooData = await this.fetchFullSnapshotFromYahoo(symbol);
        if (yahooData) {
          source = 'yahoo';
          if (yahooData.quote) {
            const newCandle = this.saveYahooQuoteAsCandle(
              tickerEntity.id,
              yahooData.quote,
            );
            latestCandle = await this.ohlcvRepo.save(newCandle).catch((e) => {
              this.logger.warn(
                `Failed to save Yahoo fallback candle: ${e.message}`,
              );
              return latestCandle;
            });
          }
          if (yahooData.summary) {
            fundamentals = await this.applyYahooEnrichment(
              tickerEntity.id,
              fundamentals,
              yahooData.summary,
              yahooData.quote,
            );
          }
        }
      }
    }

    // Fallback: If consensus_rating is missing in fundamentals but we have analyst ratings, derive it.
    if (fundamentals && !fundamentals.consensus_rating) {
      const recentRatings = await this.analystRatingRepo.find({
        where: { symbol_id: tickerEntity.id },
        order: { rating_date: 'DESC' },
        take: 10,
      });

      if (recentRatings.length > 0) {
        const scores = { Buy: 0, Hold: 0, Sell: 0 };
        let totalWeight = 0;
        const now = new Date();

        for (const r of recentRatings) {
          const ratingDate = new Date(r.rating_date);
          const diffTime = Math.abs(now.getTime() - ratingDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          // Weighting: Recent ratings matter much more
          let weight = 1;
          if (diffDays <= 30)
            weight = 3; // Last month: 3x impact
          else if (diffDays <= 90) weight = 2; // Last quarter: 2x impact

          const rating = r.rating?.toLowerCase();
          if (rating?.includes('buy')) scores.Buy += weight;
          else if (rating?.includes('sell')) scores.Sell += weight;
          else scores.Hold += weight; // Default to hold for 'neutral'

          totalWeight += weight;
        }

        if (totalWeight > 0) {
          // Determine winner based on weighted score
          if (scores.Buy > scores.Hold && scores.Buy > scores.Sell)
            fundamentals.consensus_rating = 'Buy';
          else if (scores.Sell > scores.Buy && scores.Sell > scores.Hold)
            fundamentals.consensus_rating = 'Sell';
          else fundamentals.consensus_rating = 'Hold';

          // Strong buy threshold based on weighted percentage
          if (scores.Buy / totalWeight > 0.7)
            fundamentals.consensus_rating = 'Strong Buy';
        }
      }
    }

    // Fetch latest AI Risk Analysis
    const [aiAnalysis, researchCount, analystCount, newsItems, socialCount] =
      await Promise.all([
        this.riskAnalysisRepo.findOne({
          where: { ticker_id: tickerEntity.id },
          order: { created_at: 'DESC' },
          relations: ['scenarios'],
        }),
        this.researchNoteRepo.count({
          where: { tickers: ArrayContains([symbol]) },
        }),
        this.analystRatingRepo.count({
          where: { symbol_id: tickerEntity.id },
        }),
        this.getCompanyNews(symbol).catch((err) => {
          this.logger.warn(
            `Failed to fetch news for ${symbol} in snapshot: ${err.message}`,
          );
          return [];
        }),
        this.commentRepo.count({
          where: { ticker_symbol: symbol },
        }),
      ]);

    return {
      ticker: tickerEntity,
      latestPrice: latestCandle,
      fundamentals,
      aiAnalysis,
      source,
      counts: {
        news: newsItems.length,
        research: researchCount,
        analysts: analystCount,
        social: socialCount,
      },
    };
  }

  async getSnapshots(symbols: string[]) {
    // Limit concurrency to avoid overwhelming Finnhub if we have many misses
    const validSymbols = symbols.filter((s) => s && s.trim().length > 0);
    const uniqueSymbols = [...new Set(validSymbols)];

    // We can run these in parallel since they are internal calls
    // However, if we possess a large list, we might want to chunk them.
    // For now, assuming watchlist size < 50, Promise.all is fine.
    const results = await Promise.all(
      uniqueSymbols.map((symbol) =>
        this.getSnapshot(symbol).catch((e) => {
          this.logger.error(
            `Failed to get snapshot for ${symbol}: ${e.message}`,
          );
          return { symbol, error: e.message }; // Return error object to keep index alignment or just filter later
        }),
      ),
    );

    return results;
  }

  async getHistory(
    symbol: string,
    interval: string,
    fromStr: string,
    toStr: string,
  ) {
    const tickerEntity = await this.tickersService.getTicker(symbol);

    const from = new Date(fromStr);
    const to = new Date(toStr);

    // 1. Try DB first
    const dbData = await this.ohlcvRepo.find({
      where: {
        symbol_id: tickerEntity.id,
        timeframe: interval,
        ts: Between(from, to),
      },
      order: { ts: 'ASC' },
    });

    // If we have some data and it's somewhat recent, return it
    // For MVP, if we have ANY data in the range, we return it.
    // In production, we'd check for gaps.
    if (dbData.length > 50) {
      return dbData;
    }

    // 2. Fetch from Providers
    this.logger.log(`Fetching history for ${symbol} from providers...`);
    let history: any[] = [];
    let source = 'finnhub';

    const fromUnix = Math.floor(from.getTime() / 1000);
    const toUnix = Math.floor(to.getTime() / 1000);

    try {
      // Map interval to Finnhub resolution
      const resolution =
        interval === '1d' ? 'D' : interval === '1wk' ? 'W' : 'M';
      const finnhubHistory = await this.finnhubService.getHistorical(
        symbol,
        resolution,
        fromUnix,
        toUnix,
      );

      if (finnhubHistory && finnhubHistory.s === 'ok') {
        history = finnhubHistory.t.map((t: number, i: number) => ({
          ts: new Date(t * 1000),
          open: finnhubHistory.o[i],
          high: finnhubHistory.h[i],
          low: finnhubHistory.l[i],
          close: finnhubHistory.c[i],
          volume: finnhubHistory.v[i],
        }));
      } else {
        throw new Error('Finnhub returned no history or restricted');
      }
    } catch (e) {
      this.logger.warn(
        `Finnhub history failed for ${symbol}: ${e.message}. Trying Yahoo fallback...`,
      );
      try {
        // Map common intervals
        const yahooInterval: '1d' | '1wk' | '1mo' =
          interval === '1d' ? '1d' : interval === '1wk' ? '1wk' : '1mo';
        const yahooHistory = await this.yahooFinanceService.getHistorical(
          symbol,
          from,
          to,
          yahooInterval,
        );

        if (yahooHistory && yahooHistory.length > 0) {
          source = 'yahoo';
          history = yahooHistory.map((h: any) => ({
            ts: h.date,
            open: h.open,
            high: h.high,
            low: h.low,
            close: h.close,
            volume: h.volume,
          }));
        }
      } catch (ye) {
        this.logger.error(`Yahoo history fallback failed: ${ye.message}`);
      }
    }

    if (history.length > 0) {
      // 3. Save to DB (Async, don't block response)
      void this.saveHistoricalData(tickerEntity.id, interval, history, source);
      return history.map((h) => ({
        ...h,
        symbol_id: tickerEntity.id,
        timeframe: interval,
        source: `${source}_historical`,
      }));
    }

    return dbData;
  }

  private async saveHistoricalData(
    symbolId: string,
    interval: string,
    data: any[],
    source: string,
  ) {
    try {
      const entities = data.map((h) =>
        this.ohlcvRepo.create({
          symbol_id: symbolId,
          ts: h.ts,
          timeframe: interval,
          open: h.open,
          high: h.high,
          low: h.low,
          close: h.close,
          volume: h.volume,
          source: `${source}_historical`,
        }),
      );

      // Use chunking for large inserts if needed, but for 180 days it's fine
      await this.ohlcvRepo.save(entities, { chunk: 100 }).catch((e) => {
        // On conflict do nothing or update?
        // For simplicity with sqlite/postgres mix, we just catch and log
        this.logger.debug(`Batch save history partially failed: ${e.message}`);
      });
    } catch (e) {
      this.logger.error(`Failed to save historical data: ${e.message}`);
    }
  }

  private formatDateOnly(date: Date) {
    return date.toISOString().split('T')[0];
  }

  async getCompanyNews(symbol: string, from?: string, to?: string) {
    const ticker = await this.tickersService.awaitEnsureTicker(symbol);

    // Default range: last 7 days if not specified
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Check DB first
    // Simplified strategy: If count > 0 in range, return DB. Else fetch API and cache.
    const count = await this.companyNewsRepo.count({
      where: {
        symbol_id: ticker.id,
        datetime: Between(fromDate, toDate),
      },
    });

    if (count > 0) {
      return this.companyNewsRepo.find({
        where: {
          symbol_id: ticker.id,
          datetime: Between(fromDate, toDate),
        },
        order: { datetime: 'DESC' },
      });
    }

    // Fetch from API
    let news;
    try {
      news = await this.finnhubService.getCompanyNews(
        symbol,
        fromDate.toISOString().split('T')[0],
        toDate.toISOString().split('T')[0],
      );
    } catch (error) {
      this.logger.warn(
        `Finnhub news fetch failed for ${symbol}: ${error.message}. Trying Yahoo fallback...`,
      );
      try {
        news = await this.fetchNewsFromYahoo(symbol);
      } catch (yError) {
        this.logger.error(`Yahoo news fallback also failed: ${yError.message}`);
        throw error; // Re-throw original error if fallback fails
      }
    }

    // Upsert logic
    if (news && news.length > 0) {
      const entities = news.map((n: any) => ({
        symbol_id: ticker.id,
        external_id: n.id,
        datetime: new Date(n.datetime * 1000),
        headline: n.headline,
        source: n.source,
        url: n.url,
        summary: n.summary,
        image: n.image,
        related: n.related,
      }));

      // Insert ignoring duplicates (on conflict do nothing)
      await this.companyNewsRepo
        .createQueryBuilder()
        .insert()
        .values(entities)
        .orIgnore() // Based on unique constraint (symbol_id, external_id)
        .execute();

      // Return saved entities to ensure correct format
      return this.companyNewsRepo.find({
        where: {
          symbol_id: ticker.id,
          datetime: Between(fromDate, toDate),
        },
        order: { datetime: 'DESC' },
      });
    }

    return [];
  }

  /**
   * Dedicated helper to fetch and map news from Yahoo Finance
   */
  async fetchNewsFromYahoo(symbol: string) {
    const yahooResults = await this.yahooFinanceService.search(symbol);
    return (yahooResults.news || []).map((n: any) => ({
      id: n.uuid,
      datetime: Math.floor(new Date(n.providerPublishTime).getTime() / 1000),
      headline: n.title,
      source: n.publisher,
      url: n.link,
      summary: '', // Yahoo search news doesn't always have summary in this module
      image: n.thumbnail?.resolutions?.[0]?.url || '',
      related: symbol,
    }));
  }

  /**
   * Forces a fresh fetch of news from Yahoo Finance and saves it to the database.
   * This is used for on-demand sync from the UI.
   */
  async syncCompanyNews(symbol: string) {
    const ticker = await this.tickersService.awaitEnsureTicker(symbol);
    this.logger.log(`Syncing news for ${symbol} from Yahoo Finance...`);

    try {
      const news = await this.fetchNewsFromYahoo(symbol);
      if (news && news.length > 0) {
        const entities = news.map((n: any) => ({
          symbol_id: ticker.id,
          external_id: n.id,
          datetime: new Date(n.datetime * 1000),
          headline: n.headline,
          source: n.source,
          url: n.url,
          summary: n.summary,
          image: n.image,
          related: n.related,
        }));

        await this.companyNewsRepo
          .createQueryBuilder()
          .insert()
          .values(entities)
          .orIgnore() // Based on unique constraint (symbol_id, external_id)
          .execute();

        this.logger.log(`Synced ${news.length} news items for ${symbol}`);
        return news.length;
      }
    } catch (e) {
      this.logger.error(`News sync failed for ${symbol}: ${e.message}`);
      throw e;
    }
    return 0;
  }

  async getGeneralNews() {
    // For now, fetch live. We can add caching later if needed.
    // Finnhub '/news?category=general' returns latest market news.
    try {
      const news = await this.finnhubService.getGeneralNews('general');
      return news || [];
    } catch (e) {
      this.logger.error(
        `Failed to fetch general news via Finnhub: ${e.message}. Trying Yahoo fallback...`,
      );
      try {
        const yahooResults =
          await this.yahooFinanceService.search('market news');
        return (yahooResults.news || []).map((n: any) => ({
          id: n.uuid,
          datetime: Math.floor(
            new Date(n.providerPublishTime).getTime() / 1000,
          ),
          headline: n.title,
          source: n.publisher,
          url: n.link,
          summary: '',
          image: n.thumbnail?.resolutions?.[0]?.url || '',
        }));
      } catch (yError) {
        this.logger.error(
          `Yahoo general news fallback failed: ${yError.message}`,
        );
        return [];
      }
    }
  }

  async getNewsStats(symbols: string[], from?: string, to?: string) {
    if (!symbols || symbols.length === 0) {
      return { total: 0, from, to, breakdown: [] };
    }

    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(toDate.getTime() - 24 * 60 * 60 * 1000);

    const toStr = this.formatDateOnly(toDate);
    const fromStr = this.formatDateOnly(fromDate);

    const breakdown = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const items =
            (await this.finnhubService.getCompanyNews(
              symbol,
              fromStr,
              toStr,
            )) || [];
          return { symbol, count: items.length };
        } catch (err) {
          this.logger.warn(
            `Failed to fetch news for ${symbol}: ${err?.message ?? err}`,
          );
          return { symbol, count: 0, error: true };
        }
      }),
    );

    const total = breakdown.reduce((sum, item) => sum + (item.count || 0), 0);

    return { total, from: fromStr, to: toStr, breakdown };
  }

  async upsertFundamentals(
    symbol: string,
    data: Partial<Fundamentals>,
  ): Promise<void> {
    const tickerEntity = await this.tickersService.awaitEnsureTicker(symbol);

    const existing = await this.fundamentalsRepo.findOne({
      where: { symbol_id: tickerEntity.id },
    });

    const entity =
      existing || this.fundamentalsRepo.create({ symbol_id: tickerEntity.id });

    // Merge data
    Object.assign(entity, data);

    // Explicitly set sector if provided
    if (data.sector) {
      entity.sector = data.sector;
    }

    await this.fundamentalsRepo.save(entity);
  }

  async updateTickerDescription(
    symbol: string,
    description: string,
  ): Promise<void> {
    const tickerEntity = await this.tickersService.awaitEnsureTicker(symbol);
    if (!description || description.trim().length === 0) return;

    // Check if description already exists and is longer/better?
    // For now, overwrite if the new one is non-empty.
    // Or maybe only if existing is empty?
    // User requirement: "add it to database if there is no company profile info"

    // Always update to the latest extracted description
    tickerEntity.description = description;
    await this.tickerRepo.save(tickerEntity);
  }

  async upsertAnalystRatings(
    symbol: string,
    ratings: Partial<AnalystRating>[],
  ): Promise<void> {
    const tickerEntity = await this.tickersService.awaitEnsureTicker(symbol);
    const existing = await this.analystRatingRepo.find({
      where: { symbol_id: tickerEntity.id },
    });
    const normalizeFirm = (firm?: string) =>
      (firm || '')
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]/g, '')
        .trim();

    const seen = new Set(
      existing.map(
        (r) => `${normalizeFirm(r.firm)}|${String(r.rating_date).trim()}`,
      ),
    );

    for (const rating of ratings) {
      // Enhanced validation: ensure firm exists and rating_date is a real date (not null, undefined, or the string "null")
      if (!rating.firm) continue;
      if (!rating.rating_date) continue;
      // Also ensure rating itself is present (database constraint)
      if (rating.rating === null || rating.rating === undefined) continue;

      const dateStr = String(rating.rating_date).trim();
      if (dateStr === 'null' || dateStr === '') continue;
      if (isNaN(new Date(dateStr).getTime())) continue; // skip invalid dates

      const dedupeKey = `${normalizeFirm(rating.firm)}|${dateStr}`;
      if (seen.has(dedupeKey)) continue;

      const existing = await this.analystRatingRepo.findOne({
        where: {
          symbol_id: tickerEntity.id,
          firm: rating.firm,
          rating_date: dateStr,
        },
      });

      if (!existing) {
        await this.analystRatingRepo.save({
          ...rating,
          rating_date: dateStr,
          symbol_id: tickerEntity.id,
        });
        seen.add(dedupeKey);
      }
    }
  }

  async dedupeAnalystRatings(symbol: string): Promise<{ removed: number }> {
    const tickerEntity = await this.tickersService.getTicker(symbol);
    if (!tickerEntity) return { removed: 0 };

    const existing = await this.analystRatingRepo.find({
      where: { symbol_id: tickerEntity.id },
      order: { rating_date: 'DESC' },
    });

    const seen = new Set<string>();
    const toRemove: string[] = [];

    for (const r of existing) {
      const key = `${(r.firm || '').toLowerCase().trim()}|${String(
        r.rating_date,
      ).trim()}`;
      if (seen.has(key)) {
        toRemove.push(r.id);
      } else {
        seen.add(key);
      }
    }

    if (toRemove.length > 0) {
      await this.analystRatingRepo.delete(toRemove);
    }

    return { removed: toRemove.length };
  }

  async getAnalystRatings(symbol: string) {
    const tickerEntity = await this.tickersService.getTicker(symbol);
    if (!tickerEntity) return [];

    const ratings = await this.analystRatingRepo.find({
      where: { symbol_id: tickerEntity.id },
      order: { rating_date: 'DESC' },
      take: 20,
    });

    const normalizeFirm = (firm?: string) =>
      (firm || '')
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]/g, '')
        .trim();

    // Deduplicate by normalized firm, keep most recent
    const seen = new Set<string>();
    const unique: AnalystRating[] = [];
    for (const r of ratings) {
      const key = normalizeFirm(r.firm);
      if (key && !seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }

    return unique;
  }

  /**
   * Get count of tickers where both analyst consensus = "Strong Buy" AND AI rating is bullish.
   * Criteria defined in RISK_ALGO config.
   */
  async getStrongBuyCount(): Promise<{ count: number; symbols: string[] }> {
    // AI Only: Tickers where LATEST risk analysis is Strong Buy
    // We use a robust join to ensure we only check the *latest* analysis, not just *any* analysis that happened to match.

    const qb = this.tickerRepo.createQueryBuilder('ticker');

    // Inner Join Latest Risk
    // Using simple subquery join pattern matching getAnalyzerTickers logic
    qb.innerJoin(
      RiskAnalysis,
      'risk',
      'risk.ticker_id = ticker.id AND risk.created_at = (SELECT MAX(created_at) FROM risk_analyses WHERE ticker_id = ticker.id)',
    );

    qb.where('risk.financial_risk <= :maxRisk', {
      maxRisk: RISK_ALGO.STRONG_BUY.MAX_RISK_SCORE,
    });

    qb.andWhere('risk.upside_percent > :minUpside', {
      minUpside: RISK_ALGO.STRONG_BUY.MIN_UPSIDE_PERCENT,
    });

    // Select symbols
    qb.select('ticker.symbol');

    const results = await qb.getMany();
    const symbols = results.map((t) => t.symbol);

    return { count: symbols.length, symbols };
  }

  /**
   * Get count of tickers where both analyst consensus = "Sell" OR AI rating is bearish.
   * Criteria defined in RISK_ALGO config.
   */
  async getSellCount(): Promise<{ count: number; symbols: string[] }> {
    // AI Only: Tickers where LATEST risk analysis is Sell
    const qb = this.tickerRepo.createQueryBuilder('ticker');

    // Inner Join Latest Risk
    qb.innerJoin(
      RiskAnalysis,
      'risk',
      'risk.ticker_id = ticker.id AND risk.created_at = (SELECT MAX(created_at) FROM risk_analyses WHERE ticker_id = ticker.id)',
    );

    // AI Sell Criteria: High Financial Risk OR Low/Negative Upside
    qb.where(
      new Brackets((sub) => {
        sub
          .where('risk.upside_percent < :maxUpside', {
            maxUpside: RISK_ALGO.SELL.MAX_UPSIDE_PERCENT,
          })
          .orWhere('risk.financial_risk >= :minRisk', {
            minRisk: RISK_ALGO.SELL.MIN_RISK_SCORE,
          });
      }),
    );

    // Select symbols
    qb.select('ticker.symbol');

    const results = await qb.getMany();
    const symbols = results.map((t) => t.symbol);

    return { count: symbols.length, symbols };
  }

  /**
   * Get paginated analyzer data
   */
  async getAnalyzerTickers(options: GetAnalyzerTickersOptions) {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const skip = (page - 1) * limit;
    const sortBy = options.sortBy || 'market_cap';
    const sortDir = options.sortDir || 'DESC';
    const search = options.search ? options.search.toUpperCase() : null;
    const symbols = options.symbols;

    const qb = this.tickersService.getRepo().createQueryBuilder('ticker');

    // Join Fundamentals (MapOne to attach to entity properly)
    qb.leftJoinAndMapOne(
      'ticker.fund',
      Fundamentals,
      'fund',
      'fund.symbol_id = CAST(ticker.id AS BIGINT)',
    );

    // Join Latest Price (Subquery)
    qb.leftJoinAndMapOne(
      'ticker.latestPrice',
      PriceOhlcv,
      'price',
      'price.symbol_id = ticker.id AND price.ts = (SELECT MAX(ts) FROM price_ohlcv WHERE symbol_id = ticker.id)',
    );

    // Calculate Price Change %
    // (close - prevClose) / prevClose * 100. Handle division by zero.
    qb.addSelect(
      `CASE 
        WHEN price.prevClose IS NOT NULL AND price.prevClose != 0 
        THEN ((price.close - price.prevClose) / price.prevClose) * 100 
        ELSE 0 
       END`,
      'price_change_pct',
    );

    // Join Latest Risk
    qb.leftJoinAndMapOne(
      'ticker.latestRisk',
      RiskAnalysis,
      'risk',
      'risk.ticker_id = ticker.id AND risk.created_at = (SELECT MAX(created_at) FROM risk_analyses WHERE ticker_id = ticker.id)',
    );

    // Join Base/Bear Scenarios for dynamic calculation
    qb.leftJoin(
      RiskScenario,
      'base_scenario',
      "base_scenario.analysis_id = risk.id AND base_scenario.scenario_type = 'base'",
    );
    qb.leftJoin(
      RiskScenario,
      'bear_scenario',
      "bear_scenario.analysis_id = risk.id AND bear_scenario.scenario_type = 'bear'",
    );

    const upsideExpr = `((base_scenario.price_mid - price.close) / NULLIF(price.close, 0)) * 100`;
    const downsideExpr = `CASE 
      WHEN bear_scenario.price_mid IS NOT NULL AND price.close > 0 
      THEN ((bear_scenario.price_mid - price.close) / price.close) * 100
      WHEN risk.financial_risk >= 8 THEN -100
      ELSE -(risk.financial_risk * 2.5)
    END`;

    qb.addSelect('base_scenario.price_mid', 'base_price');
    qb.addSelect('bear_scenario.price_mid', 'bear_price');
    qb.addSelect(upsideExpr, 'dynamic_upside');
    qb.addSelect(downsideExpr, 'dynamic_downside');

    // Analyst Count Subquery
    qb.addSelect((subQuery) => {
      return subQuery
        .select('COUNT(*)', 'count')
        .from('analyst_ratings', 'ar')
        .where('ar.symbol_id = ticker.id');
    }, 'analyst_count');

    // Research Count Subquery
    qb.addSelect((subQuery) => {
      return subQuery
        .select('COUNT(*)', 'count')
        .from('research_notes', 'rn')
        .where('ticker.symbol = ANY(rn.tickers)');
    }, 'research_count');

    // Social Count Subquery
    qb.addSelect((subQuery) => {
      return subQuery
        .select('COUNT(*)', 'count')
        .from('comments', 'c')
        .where('c.ticker_symbol = ticker.symbol');
    }, 'social_count');

    // News Count Subquery
    qb.addSelect((subQuery) => {
      return subQuery
        .select('COUNT(*)', 'count')
        .from('company_news', 'cn')
        .where('cn.symbol_id = ticker.id');
    }, 'news_count');

    // Filter: Always hide shadowbanned tickers from the main Analyzer/Dashboard list.
    // They should only be visible in the Admin Console (Management) or specific Watchlists.
    qb.andWhere('ticker.is_hidden = :isHidden', { isHidden: false });

    if (search) {
      qb.andWhere(
        '(UPPER(ticker.symbol) LIKE :search OR UPPER(ticker.name) LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (symbols && symbols.length > 0) {
      qb.andWhere('ticker.symbol IN (:...symbols)', { symbols });
    }

    if (options.sector && options.sector.length > 0) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('ticker.sector IN (:...sectors)', {
              sectors: options.sector,
            })
            .orWhere('fund.sector IN (:...sectors)', {
              sectors: options.sector,
            });
        }),
      );
    }

    // --- NEW: Filters ---

    // 1. Risk Filter (Updated to Financial Risk)
    if (options.risk && options.risk.length > 0) {
      // Map string labels to ranges based on RISK_ALGO or general convention
      // Low: 0-3.5, Medium: 3.5-6.5, High: 6.5+
      // (Using a Brackets to OR them together)
      qb.andWhere(
        new Brackets((sub) => {
          options.risk?.forEach((r) => {
            if (r.includes('Low')) sub.orWhere('risk.financial_risk < 3.5');
            else if (r.includes('Medium'))
              sub.orWhere('risk.financial_risk BETWEEN 3.5 AND 6.5');
            else if (r.includes('High'))
              sub.orWhere('risk.financial_risk > 6.5');
          });
        }),
      );
    }

    // 2. Upside Filter (Dynamic Calculation)
    if (options.upside) {
      // Expected format: "> 10%", "> 20%", "> 50%"
      const match = options.upside.match(/(\d+)/);
      if (match) {
        const val = parseInt(match[0], 10);
        // Use the same dynamic expression we defined for selects
        qb.andWhere(
          `((base_scenario.price_mid - price.close) / NULLIF(price.close, 0)) * 100 > :upsideVal`,
          { upsideVal: val },
        );
      }
    }

    // 2.5 Overall Score (Risk/Reward) Filter
    if (options.overallScore) {
      // Expected format: "> 8.5", "> 7.5", "> 5.0"
      const match = options.overallScore.match(/(\d+(\.\d+)?)/);
      if (match) {
        const val = parseFloat(match[0]);
        qb.andWhere('risk.overall_score > :overallScoreVal', {
          overallScoreVal: val,
        });
      }
    }

    // 3. AI Rating Filter (Standardized Weighted Verdict)
    // Synchronized with frontend rating-utils.ts
    // Score Tiers: >= 80 Strong Buy, >= 65 Buy, >= 45 Hold, < 45 Sell
    if (options.aiRating && options.aiRating.length > 0) {
      // Define the Verdict Score Expression
      const upsideCalc = `((base_scenario.price_mid - price.close) / NULLIF(price.close, 0)) * 100`;
      const downsideCalc = `
        CASE 
          WHEN bear_scenario.price_mid IS NOT NULL AND price.close > 0 
          THEN ((bear_scenario.price_mid - price.close) / price.close) * 100
          WHEN risk.financial_risk >= 8 THEN -100
          ELSE -(risk.financial_risk * 5)
        END
      `;

      // SQL equivalent of rating-utils.ts calculateAiRating
      // Note: usage of COALESCE/NULL handling is critical
      const verdictScoreSql = `(
        50
        -- 1. Upside Impact (Max 0+, Capped at 100, * 0.4)
        + (GREATEST(0, LEAST(100, COALESCE(${upsideCalc}, 0))) * 0.4)
        
        -- 2. Downside Impact (Abs, Cap 40, * 0.8) -> Subtract
        - (LEAST(40, ABS(COALESCE(${downsideCalc}, 0)) * 0.8))
        
        -- 3. Risk Penalty / Bonus
        + CASE 
            WHEN risk.financial_risk >= 8 THEN -20 
            WHEN risk.financial_risk >= 6 THEN -10 
            WHEN risk.financial_risk <= 3 THEN 5 
            ELSE 0 
          END
        
        -- 4. Neural Score Bonus
        + CASE 
            WHEN risk.overall_score >= 8 THEN 10 
            WHEN risk.overall_score >= 6 THEN 5 
            WHEN risk.overall_score <= 4 THEN -5 
            ELSE 0 
          END
        
        -- 5. Analyst Consensus
        + CASE 
            WHEN fund.consensus_rating ILIKE '%Strong Buy%' THEN 10 
            WHEN fund.consensus_rating ILIKE '%Buy%' THEN 5 
            WHEN fund.consensus_rating ILIKE '%Sell%' THEN -10 
            ELSE 0 
          END
          
        -- 6. PE Ratio Impact (Value Investing)
        + CASE 
            WHEN fund.pe_ttm IS NULL THEN -10       -- Penalty for missing P/E
            WHEN fund.pe_ttm < 0 THEN -10           -- Unprofitable
            WHEN fund.pe_ttm < 15 THEN 15           -- Great Value
            WHEN fund.pe_ttm < 30 THEN 5            -- Fair Value
            WHEN fund.pe_ttm > 60 THEN -15          -- Extremely Overvalued
            WHEN fund.pe_ttm > 40 THEN -5           -- Overvalued
            ELSE 0 
          END
      )`;

      qb.andWhere(
        new Brackets((sub) => {
          options.aiRating?.forEach((rating) => {
            if (rating === 'Strong Buy') {
              sub.orWhere(`${verdictScoreSql} >= 80`);
            } else if (rating === 'Buy') {
              sub.orWhere(`${verdictScoreSql} >= 65 AND ${verdictScoreSql} < 80`);
            } else if (rating === 'Hold') {
              sub.orWhere(`${verdictScoreSql} >= 45 AND ${verdictScoreSql} < 65`);
            } else if (rating === 'Sell') {
              sub.orWhere(`${verdictScoreSql} < 45`);
            } else if (rating === 'Speculative Buy') {
              // Speculative Buy override logic: High Risk but High Reward
              // Frontend: variant = 'speculativeBuy' if risk >= 8 && (score >= 7.5 || upside >= 100)
              // But 'rating' string is just 'Sell' or 'Hold' usually in that case unless we explicitly label it.
              // For backend filter, let's keep it simple or align strictly if 'Speculative Buy' is a requested filter.
              // Assuming standard tiers for now.
              sub.orWhere(`risk.financial_risk >= 8 AND (risk.overall_score >= 7.5 OR COALESCE(${upsideCalc}, 0) >= 100)`);
            }
          });
        }),
      );
    }

    // Sort Mapping
    let sortField = `fund.${sortBy}`; // Default to fundamentals

    if (sortBy === 'change' || sortBy === 'price_change') {
      sortField = '"price_change_pct"';
    } else if (sortBy === 'ai_rating') {
      sortField = 'risk.financial_risk';
    } else if (['symbol', 'name', 'sector', 'industry'].includes(sortBy)) {
      sortField = `ticker.${sortBy}`;
    } else if (sortBy === 'upside_percent') {
      sortField = '"dynamic_upside"';
    } else if (sortBy === 'downside_percent') {
      sortField = '"dynamic_downside"';
    } else if (
      ['overall_score', 'upside_percent', 'financial_risk'].includes(sortBy)
    ) {
      sortField = `risk.${sortBy}`;
    } else if (['close', 'volume'].includes(sortBy)) {
      sortField = `price.${sortBy}`;
    } else if (sortBy === 'research') {
      sortField = '"research_count"';
    }

    qb.orderBy(sortField, sortDir);

    // Add secondary sort for stability
    qb.addOrderBy('ticker.symbol', 'ASC');

    // Use limit/offset instead of take/skip to avoid TypeORM generating a broken
    // "SELECT DISTINCT" query when sorting by computed columns (like price_change_pct).
    // Since our joins are effectively 1:1 (mapOne with subqueries), this is safe.
    qb.offset(skip).limit(limit);

    // Get Raw Entities ( mapped)
    const { entities, raw } = await qb.getRawAndEntities();
    const total = await qb.getCount();

    return {
      items: entities.map((t: any) => {
        // Fix: raw result matching. raw array corresponds to entities order in TypeORM usually,
        // but strict matching by ID is safer.
        const rawData = raw.find((r) => r.ticker_id === t.id);

        const analystCount = rawData ? parseInt(rawData.analyst_count, 10) : 0;
        const researchCount = rawData
          ? parseInt(rawData.research_count, 10)
          : 0;
        const socialCount = rawData ? parseInt(rawData.social_count, 10) : 0;
        const newsCount = rawData ? parseInt(rawData.news_count, 10) : 0;
        const changePct = rawData ? parseFloat(rawData.price_change_pct) : 0;

        // Inject change into latestPrice
        const latestPriceWithChange = t.latestPrice
          ? { ...t.latestPrice, change: isNaN(changePct) ? 0 : changePct }
          : null;

        return {
          ticker: {
            id: t.id,
            symbol: t.symbol,
            name: t.name,
            exchange: t.exchange,
            logo_url: t.logo_url,
            // Fallback strategy for sector/industry
            sector:
              t.sector || t.fund?.sector || t.finnhub_industry || 'Unknown',
            industry: t.industry || t.finnhub_industry,
          },
          latestPrice: latestPriceWithChange,
          fundamentals: t.fund || {},
          aiAnalysis: t.latestRisk
            ? {
                ...t.latestRisk,
                bear_price: rawData?.bear_price
                  ? parseFloat(rawData.bear_price)
                  : null,
                base_price: rawData?.base_price
                  ? parseFloat(rawData.base_price)
                  : null,
              }
            : null,
          counts: {
            analysts: analystCount,
            research: researchCount,
            social: socialCount,
            news: newsCount,
          },
        };
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
  async getTickerSnapshots(symbols: string[]) {
    if (!symbols || symbols.length === 0) return [];

    // 1. Fetch Tickers
    const tickers = await this.tickerRepo
      .createQueryBuilder('ticker')
      .where('ticker.symbol IN (:...symbols)', { symbols })
      .getMany();

    if (tickers.length === 0) return [];

    const tickerIds = tickers.map((t) => t.id);

    // 2. Fetch Latest Prices (Daily)
    // Using a subquery approach or just fetching latest 2 per ticker if volume is low,
    // but distinct on symbol_id is best for Postgres.
    const latestPrices = await this.ohlcvRepo
      .createQueryBuilder('price')
      .distinctOn(['price.symbol_id'])
      .where('price.symbol_id IN (:...tickerIds)', { tickerIds })
      .andWhere("price.timeframe = '1d'")
      .orderBy('price.symbol_id')
      .addOrderBy('price.ts', 'DESC')
      .getMany();

    // 3. Fetch Latest Risk Analysis
    // Similarly, distinct on ticker_id
    const risks = await this.riskAnalysisRepo
      .createQueryBuilder('risk')
      .distinctOn(['risk.ticker_id'])
      .where('risk.ticker_id IN (:...tickerIds)', { tickerIds })
      .orderBy('risk.ticker_id')
      .addOrderBy('risk.created_at', 'DESC')
      .getMany();

    // 4. Map Data
    const priceMap = new Map(latestPrices.map((p) => [p.symbol_id, p]));
    const riskMap = new Map(risks.map((r) => [r.ticker_id, r]));

    return tickers.map((ticker) => {
      const price = priceMap.get(ticker.id);
      const risk = riskMap.get(ticker.id);

      // Calculate change percent if possible
      let changePercent = 0;
      if (price && price.prevClose && price.prevClose > 0) {
        changePercent =
          ((price.close - price.prevClose) / price.prevClose) * 100;
      }

      return {
        ...ticker,
        latestPrice: price
          ? {
              close: price.close,
              changePercent: changePercent, // Map calculated change
              prevClose: price.prevClose,
            }
          : null,
        riskAnalysis: risk
          ? {
              overall_score: risk.overall_score,
              financial_risk: risk.financial_risk,
            }
          : null,
      };
    });
  }

  private async fetchFullSnapshotFromYahoo(symbol: string) {
    try {
      const [quote, summary] = await Promise.all([
        this.yahooFinanceService.getQuote(symbol),
        this.yahooFinanceService.getSummary(symbol),
      ]);
      return { quote, summary };
    } catch (e) {
      this.logger.error(
        `Failed to fetch Yahoo snapshot for ${symbol}: ${e.message}`,
      );
      return null;
    }
  }

  private saveYahooQuoteAsCandle(symbolId: string, quote: any): PriceOhlcv {
    return this.ohlcvRepo.create({
      symbol_id: symbolId,
      ts: quote.regularMarketTime || new Date(),
      timeframe: '1d',
      open: quote.regularMarketOpen,
      high: quote.regularMarketDayHigh,
      low: quote.regularMarketDayLow,
      close: quote.regularMarketPrice,
      prevClose: quote.regularMarketPreviousClose,
      volume: quote.regularMarketVolume,
      source: 'yahoo_quote',
    });
  }

  private async applyYahooEnrichment(
    symbolId: string,
    fundamentals: Fundamentals | null,
    summary: any,
    quote?: any,
  ): Promise<Fundamentals> {
    const entity =
      fundamentals || this.fundamentalsRepo.create({ symbol_id: symbolId });

    if (summary.defaultKeyStatistics) {
      const stats = summary.defaultKeyStatistics;
      if (stats.forwardPE) entity.pe_ttm = stats.forwardPE;
      if (stats.trailingEps) entity.eps_ttm = stats.trailingEps;
      if (stats.beta) entity.beta = stats.beta;
      if (stats.priceToBook) entity.price_to_book = stats.priceToBook;
      if (stats.bookValue) entity.book_value_per_share = stats.bookValue;
    }

    if (summary.financialData) {
      const fin = summary.financialData;
      if (fin.totalCash) entity.total_cash = fin.totalCash;
      if (fin.totalDebt) entity.total_debt = fin.totalDebt;
      if (fin.debtToEquity) entity.debt_to_equity = fin.debtToEquity / 100; // Normalize to decimal if it's 150 style
      if (fin.totalRevenue) entity.revenue_ttm = fin.totalRevenue;
      if (fin.grossMargins) entity.gross_margin = fin.grossMargins;
      if (fin.profitMargins) entity.net_profit_margin = fin.profitMargins;
      if (fin.operatingMargins) entity.operating_margin = fin.operatingMargins;
      if (fin.returnOnEquity) entity.roe = fin.returnOnEquity;
      if (fin.returnOnAssets) entity.roa = fin.returnOnAssets;
      if (fin.freeCashflow) entity.free_cash_flow_ttm = fin.freeCashflow;
      if (fin.currentRatio) entity.current_ratio = fin.currentRatio;
      if (fin.quickRatio) entity.quick_ratio = fin.quickRatio;
    }

    if (quote) {
      if (quote.marketCap) entity.market_cap = quote.marketCap;
    }

    entity.updated_at = new Date();
    return await this.fundamentalsRepo.save(entity);
  }
}

export interface AnalyzerOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
  search?: string;
  symbols?: string[];
  // Filters
  risk?: string[];
  aiRating?: string[];
  upside?: string;
}

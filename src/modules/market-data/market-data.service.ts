import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, ArrayContains } from 'typeorm';
import { ConfigService } from '@nestjs/config'; // Added
import { PriceOhlcv } from './entities/price-ohlcv.entity';
import { Fundamentals } from './entities/fundamentals.entity';
import { AnalystRating } from './entities/analyst-rating.entity';
import { RiskAnalysis } from '../risk-reward/entities/risk-analysis.entity';
import { ResearchNote } from '../research/entities/research-note.entity';
import { TickersService } from '../tickers/tickers.service';
import { FinnhubService } from '../finnhub/finnhub.service';
import { RISK_ALGO } from '../../config/risk-algorithm.config';

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
    private readonly researchNoteRepo: Repository<ResearchNote>,
    @Inject(forwardRef(() => TickersService))
    private readonly tickersService: TickersService,
    private readonly finnhubService: FinnhubService,
    private readonly configService: ConfigService, // Added
  ) {}

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
        const [quote, profile] = await Promise.all([
          this.finnhubService.getQuote(symbol),
          this.finnhubService.getCompanyProfile(symbol), // Refresh profile too for fundamentals
        ]);

        source = 'finnhub';

        // Function to save quote as OHLCV
        if (quote) {
          const newCandle = this.ohlcvRepo.create({
            symbol_id: tickerEntity.id,
            ts: new Date(quote.t * 1000), // Finnhub sends unix timestamp in seconds
            timeframe: '1d', // Storing daily snapshot as '1d' for simplified history integration? Or 'snapshot'? utilizing '1d' as per common practice for "current day" or "latest" if market open.
            // Important: Finnhub Quote endpoint returns Current Price (c), High (h), Low (l), Open (o), Previous Close (pc).
            // We map these to our OHLCV.
            open: quote.o,
            high: quote.h,
            low: quote.l,
            close: quote.c,
            prevClose: quote.pc,
            volume: 0, // Quote doesn't return volume usually, only candles do.
            source: 'finnhub_quote',
          });
          // Upsert (ignore if exists for this timeframe+ts)
          await this.ohlcvRepo
            .save(newCandle)
            .catch((e) =>
              this.logger.warn(`Failed to save candle: ${e.message}`),
            );
          latestCandle = newCandle;
        }

        // Function to save Fundamentals
        if (profile) {
          // Determine Fundamentals values from profile or other endpoints?
          // The current SymbolEntity stores profile info. Fundamentals entity has specific financial metrics
          // like PE, EPS which Finnhub Company Profile 2 provides?
          // Finnhub "Company Profile 2" (which we use) returns: marketCapitalization, shareOutstanding.
          // It does NOT typically return PE/EPS/DivYield/Beta in that specific endpoint (those are in "Basic Financials").
          // WITHOUT changing FinnhubService to add a new call for "Basic Financials", we can only update what we have.
          // For now, we update what matches our Fundamentals entity from what we have in Profile, or leave null.

          // Existing FinnhubService.getCompanyProfile calls /stock/profile2.
          // Response: country, currency, exchange, name, ticker, ipo, marketCapitalization, shareOutstanding, logo, phone, weburl, finnhubIndustry.

          // Our Fundamentals Entity has: market_cap, pe_ttm, eps_ttm, dividend_yield, beta, debt_to_equity.
          // We can map marketCapitalization. shareOutstanding is on SymbolEntity.

          const newFundamentals = this.fundamentalsRepo.create({
            symbol_id: tickerEntity.id,
            market_cap: profile.marketCapitalization,
            sector: profile.finnhubIndustry,
            // pe_ttm: ??? (Need separate API call)
            // eps_ttm: ???
            // beta: ???
            updated_at: new Date(),
          });
          await this.fundamentalsRepo.save(newFundamentals);
          fundamentals = newFundamentals;
        }
      } catch (error) {
        this.logger.error(
          `Failed to refresh data for ${symbol}: ${error.message}`,
        );
        // Fallback to what we have (even if stale)
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
    const [aiAnalysis, researchCount, analystCount, newsItems] =
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
        this.finnhubService.getCompanyNews(
          symbol,
          // Last 7 days
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          new Date().toISOString().split('T')[0],
        ),
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

    // Basic date parsing, assuming ISO or unix timestamp from QS
    const from = new Date(fromStr);
    const to = new Date(toStr);

    return this.ohlcvRepo.find({
      where: {
        symbol_id: tickerEntity.id,
        timeframe: interval, // Assuming interval matches timeframe enums/strings
        ts: Between(from, to),
      },
      order: { ts: 'ASC' },
    });
  }

  private formatDateOnly(date: Date) {
    return date.toISOString().split('T')[0];
  }

  async getCompanyNews(symbol: string, from?: string, to?: string) {
    // Default window: last 7 days if not provided
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const toStr = this.formatDateOnly(toDate);
    const fromStr = this.formatDateOnly(fromDate);

    return this.finnhubService.getCompanyNews(symbol, fromStr, toStr);
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
    // Query fundamentals with Strong Buy consensus
    const strongBuyFundamentals = await this.fundamentalsRepo.find({
      where: { consensus_rating: 'Strong Buy' },
      select: ['symbol_id'],
    });

    if (strongBuyFundamentals.length === 0) {
      return { count: 0, symbols: [] };
    }

    const symbolIds = strongBuyFundamentals.map((f) => f.symbol_id);

    // Filter by AI Opinion
    const matchingRisk = await this.riskAnalysisRepo
      .createQueryBuilder('risk')
      .select('risk.ticker_id')
      .distinctOn(['risk.ticker_id'])
      .where('risk.ticker_id IN (:...ids)', { ids: symbolIds })
      .andWhere('risk.overall_score <= :maxRisk', {
        maxRisk: RISK_ALGO.STRONG_BUY.MAX_RISK_SCORE,
      })
      .andWhere('risk.upside_percent > :minUpside', {
        minUpside: RISK_ALGO.STRONG_BUY.MIN_UPSIDE_PERCENT,
      })
      .orderBy('risk.ticker_id')
      .addOrderBy('risk.created_at', 'DESC')
      .getMany();

    // Get symbols
    const matchingSymbolIds = matchingRisk.map((r) => r.ticker_id);
    const symbols =
      await this.tickersService.getSymbolsByIds(matchingSymbolIds);

    return { count: symbols.length, symbols };
  }

  /**
   * Get count of tickers where both analyst consensus = "Sell" OR AI rating is bearish.
   * Criteria defined in RISK_ALGO config.
   */
  async getSellCount(): Promise<{ count: number; symbols: string[] }> {
    // For Sell, we can be broader. Any "Sell" consensus OR terrible AI rating.
    const sellFundamentals = await this.fundamentalsRepo.find({
      where: { consensus_rating: 'Sell' },
      select: ['symbol_id'],
    });

    const sellSymbolIds = sellFundamentals.map((f) => f.symbol_id);

    // AI Bearish
    const bearishRisk = await this.riskAnalysisRepo
      .createQueryBuilder('risk')
      .select('risk.ticker_id')
      .distinctOn(['risk.ticker_id'])
      .where('risk.overall_score >= :minRisk', {
        minRisk: RISK_ALGO.SELL.MIN_RISK_SCORE,
      })
      .orWhere('risk.upside_percent < :maxUpside', {
        maxUpside: RISK_ALGO.SELL.MAX_UPSIDE_PERCENT,
      })
      .orderBy('risk.ticker_id')
      .addOrderBy('risk.created_at', 'DESC')
      .getMany();

    // Union of IDs
    const bearishSymbolIds = bearishRisk.map((r) => r.ticker_id);
    const allIds = Array.from(
      new Set([...sellSymbolIds, ...bearishSymbolIds]),
    ).map((id) => Number(id)); // Ensure they are numbers

    if (allIds.length === 0) {
      return { count: 0, symbols: [] };
    }

    const symbols = await this.tickersService.getSymbolsByIds(allIds);
    return { count: symbols.length, symbols };
  }

  /**
   * Get paginated analyzer data
   */
  async getAnalyzerTickers(options: AnalyzerOptions) {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const skip = (page - 1) * limit;
    const sortBy = options.sortBy || 'market_cap';
    const sortDir = options.sortDir || 'DESC';
    const search = options.search ? options.search.toUpperCase() : null;

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

    // Join Latest Risk
    qb.leftJoinAndMapOne(
      'ticker.latestRisk',
      RiskAnalysis,
      'risk',
      'risk.ticker_id = ticker.id AND risk.created_at = (SELECT MAX(created_at) FROM risk_analyses WHERE ticker_id = ticker.id)',
    );

    // Filter
    if (search) {
      qb.where(
        '(UPPER(ticker.symbol) LIKE :search OR UPPER(ticker.name) LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Sort Mapping
    let sortField = `fund.${sortBy}`; // Default to fundamentals
    if (['symbol', 'name', 'sector', 'industry'].includes(sortBy)) {
      sortField = `ticker.${sortBy}`;
    } else if (
      ['overall_score', 'upside_percent', 'financial_risk'].includes(sortBy)
    ) {
      sortField = `risk.${sortBy}`;
    } else if (['close', 'volume', 'change'].includes(sortBy)) {
      sortField = `price.${sortBy}`;
    }

    qb.orderBy(sortField, sortDir);

    // Add secondary sort for stability
    qb.addOrderBy('ticker.symbol', 'ASC');

    qb.skip(skip).take(limit);

    // Get Raw Entities (mapped)
    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((t: any) => ({
        ticker: {
          id: t.id,
          symbol: t.symbol,
          name: t.name,
          exchange: t.exchange,
          sector: t.sector,
          industry: t.industry,
          logo_url: t.logo_url,
        },
        fundamentals: t.fund || {},
        latestPrice: t.latestPrice || null,
        aiAnalysis: t.latestRisk || null,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export interface AnalyzerOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
  search?: string;
}

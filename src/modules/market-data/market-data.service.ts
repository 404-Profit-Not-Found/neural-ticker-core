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
    private readonly configService: ConfigService, // Added
  ) {}

  async getQuote(symbol: string) {
    try {
      return await this.finnhubService.getQuote(symbol);
    } catch (e) {
      this.logger.error(`Failed to get quote for ${symbol}: ${e.message}`);
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

        // Function to save quote as OHLCV
        if (quote) {
          const newCandle = this.ohlcvRepo.create({
            symbol_id: tickerEntity.id,
            ts: new Date(quote.t * 1000), // Finnhub sends unix timestamp in seconds
            timeframe: '1d', // Storing daily snapshot as '1d'
            open: quote.o,
            high: quote.h,
            low: quote.l,
            close: quote.c,
            prevClose: quote.pc,
            volume: 0,
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
        if (profile || financials?.metric) {
          const metrics = financials?.metric || {};

          // Use existing fundamentals or create new wrapped in merge logic
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
            // debt_to_equity is not always clean in basic metrics, skipping for now
          }

          entity.updated_at = new Date();

          await this.fundamentalsRepo.save(entity);
          fundamentals = entity;
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
        this.finnhubService.getCompanyNews(
          symbol,
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          new Date().toISOString().split('T')[0],
        ),
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
    const news = await this.finnhubService.getCompanyNews(
      symbol,
      fromDate.toISOString().split('T')[0],
      toDate.toISOString().split('T')[0],
    );

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

  async getGeneralNews() {
    // For now, fetch live. We can add caching later if needed.
    // Finnhub '/news?category=general' returns latest market news.
    try {
      const news = await this.finnhubService.getGeneralNews('general');
      return news || [];
    } catch (e) {
      this.logger.error(`Failed to fetch general news: ${e.message}`);
      return [];
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

    // Bear Case Price Subquery (for downside calculation in carousel)
    qb.addSelect((subQuery) => {
      return subQuery
        .select('rs.price_mid', 'bear_price')
        .from(RiskScenario, 'rs')
        .where('rs.analysis_id = risk.id')
        .andWhere("rs.scenario_type = 'bear'");
    }, 'bear_price');

    // Base Case Price Subquery (for standardized upside calculation)
    qb.addSelect((subQuery) => {
      return subQuery
        .select('rs.price_mid', 'base_price')
        .from(RiskScenario, 'rs')
        .where('rs.analysis_id = risk.id')
        .andWhere("rs.scenario_type = 'base'");
    }, 'base_price');

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

    // 2. Upside Filter
    if (options.upside) {
      // Expected format: "> 10%", "> 20%", "> 50%"
      const match = options.upside.match(/(\d+)/);
      if (match) {
        const val = parseInt(match[0], 10);
        qb.andWhere('risk.upside_percent > :upsideVal', { upsideVal: val });
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

    // 3. AI Rating Filter (Updated to Financial Risk)
    // Logic matching RISK_ALGO config
    // Strong Buy: Upside > MIN_UPSIDE and Score <= MAX_RISK
    if (options.aiRating && options.aiRating.length > 0) {
      qb.andWhere(
        new Brackets((sub) => {
          options.aiRating?.forEach((rating) => {
            if (rating === 'Strong Buy') {
              sub.orWhere(
                `(risk.upside_percent > ${RISK_ALGO.STRONG_BUY.MIN_UPSIDE_PERCENT} AND risk.financial_risk <= ${RISK_ALGO.STRONG_BUY.MAX_RISK_SCORE})`,
              );
            } else if (rating === 'Buy') {
              // Buy is generally strictly better than Hold but less than Strong Buy
              // Let's assume Upside > 10% and Score <= 7 (Align with frontend strict logic)
              sub.orWhere(
                '(risk.upside_percent > 10 AND risk.financial_risk <= 7)',
              );
            } else if (rating === 'Sell') {
              // Sell: Low Upside OR High Risk (> 7 or 8)
              sub.orWhere(
                `(risk.upside_percent < ${RISK_ALGO.SELL.MAX_UPSIDE_PERCENT} OR risk.financial_risk >= ${RISK_ALGO.SELL.MIN_RISK_SCORE})`,
              );
            } else if (rating === 'Hold') {
              // Hold = Everything else
              // NOT (Strong Buy OR Buy OR Sell)
              sub.orWhere(
                `NOT (
                    (risk.upside_percent > ${RISK_ALGO.STRONG_BUY.MIN_UPSIDE_PERCENT} AND risk.financial_risk <= ${RISK_ALGO.STRONG_BUY.MAX_RISK_SCORE}) OR 
                    (risk.upside_percent > 10 AND risk.financial_risk <= 7) OR 
                    (risk.upside_percent < ${RISK_ALGO.SELL.MAX_UPSIDE_PERCENT} OR risk.financial_risk >= ${RISK_ALGO.SELL.MIN_RISK_SCORE})
                 )`,
              );
            }
          });
        }),
      );
    }

    // Sort Mapping
    let sortField = `fund.${sortBy}`; // Default to fundamentals

    if (sortBy === 'change' || sortBy === 'price_change') {
      // Sort by computed column expression or alias (alias often works in Postgres if selected)
      // We use the alias 'price_change_pct' which we defined above.
      // Note: Postgres allows ordering by alias in ORDER BY clause.
      sortField = '"price_change_pct"';
    } else if (sortBy === 'ai_rating') {
      // Map AI Rating sort to Financial Risk (Proxy for rating quality)
      sortField = 'risk.financial_risk';
    } else if (['symbol', 'name', 'sector', 'industry'].includes(sortBy)) {
      sortField = `ticker.${sortBy}`;
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

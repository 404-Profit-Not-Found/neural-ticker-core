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

    for (const rating of ratings) {
      // Enhanced validation: ensure firm exists and rating_date is a real date (not null, undefined, or the string "null")
      if (!rating.firm) continue;
      if (!rating.rating_date) continue;
      const dateStr = String(rating.rating_date).trim();
      if (dateStr === 'null' || dateStr === '') continue;
      if (isNaN(new Date(dateStr).getTime())) continue; // skip invalid dates
      // const parsedDate = new Date(dateStr); // No longer needed
      // if (isNaN(parsedDate.getTime())) continue; // No longer needed

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
      }
    }
  }

  async getAnalystRatings(symbol: string) {
    const tickerEntity = await this.tickersService.getTicker(symbol);
    if (!tickerEntity) return [];

    return this.analystRatingRepo.find({
      where: { symbol_id: tickerEntity.id },
      order: { rating_date: 'DESC' },
      take: 20,
    });
  }
}

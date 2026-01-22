import { PortfolioService } from '../portfolio/portfolio.service';

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
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => PortfolioService))
    private readonly portfolioService: PortfolioService,
  ) {}

  private snapshotRequests = new Map<string, Promise<any>>();
  private historyRequests = new Map<string, Promise<any>>();

  // Cron Job: Refresh active portfolio symbols every 30 seconds
  @Cron('*/30 * * * * *')
  async updateActivePortfolios() {
    this.logger.log('Cron: Refreshing active portfolio symbols...');
    try {
      const symbols = await this.portfolioService.getAllDistinctPortfolioSymbols();
      if (symbols.length === 0) return;

      this.logger.debug(`Found ${symbols.length} distinct symbols to refresh: ${symbols.join(', ')}`);

      // Process sequentially or with limited concurrency to respect rate limits
      for (const symbol of symbols) {
        try {
          // Force refresh if data is older than 30 seconds
          await this.performGetSnapshot(symbol, { 
            updateIfStale: true,
            staleThresholdSeconds: 30 
          });
        } catch (e) {
          this.logger.error(`Failed to refresh ${symbol} in cron: ${e.message}`);
        }
      }
    } catch (e) {
      this.logger.error(`Error in updateActivePortfolios cron: ${e.message}`);
    }
  }

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
        `Fallback to Yahoo for quote ${symbol} due to error: ${getErrorMessage(e)}`,
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
          `Yahoo quote also failed for ${symbol}: ${getErrorMessage(yError)}`,
        );
      }
      return null;
    }
  }

  async getSnapshot(symbol: string) {
    const key = symbol.toUpperCase();
    const existing = this.snapshotRequests.get(key);
    if (existing) {
      this.logger.debug(`Coalescing snapshot request for ${key}`);
      return existing;
    }

    const promise = this.performGetSnapshot(key).finally(() => {
      this.snapshotRequests.delete(key);
    });

    this.snapshotRequests.set(key, promise);
    return promise;
  }

  async refreshMarketData(symbol: string) {
    return this.performGetSnapshot(symbol.toUpperCase(), {
      force: true,
    } as any);
  }

  private async performGetSnapshot(
    symbol: string,
    options: { updateIfStale?: boolean; staleThresholdSeconds?: number } = { updateIfStale: true },
  ) {
    const tickerEntity = await this.tickersService.awaitEnsureTicker(symbol);

    // Configurable stale thresholds
    // Priority: options.staleThresholdSeconds -> config -> default
    const priceStaleSeconds = options.staleThresholdSeconds || 
      (this.configService.get<number>('marketData.stalePriceMinutes', 15) * 60);
      
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

    // Store detailed quote (d, dp) if fetched from API, to pass to frontend
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let detailedQuote: any = null;

    const isPriceStale =
      !latestCandle ||
      Date.now() - latestCandle.ts.getTime() >
        priceStaleSeconds * 1000;
    const isFundamentalsStale =
      !fundamentals ||
      Date.now() - fundamentals.updated_at.getTime() >
        FUNDAMENTALS_STALE_HOURS * 60 * 60 * 1000;

    let source = 'database';

    if (
      (isPriceStale || isFundamentalsStale || (options as any).force) &&
      options.updateIfStale !== false
    ) {
      // Check if this is a non-US stock (has exchange suffix like .DE, .L, .PA)
      // Finnhub free tier doesn't support non-US stocks, skip directly to Yahoo
      const isNonUSStock = symbol.includes('.');

      if (isNonUSStock) {
        this.logger.log(
          `Non-US stock ${symbol} detected, skipping Finnhub (not supported on free tier). Using Yahoo Finance...`,
        );
        try {
          const yahooData = await this.fetchFullSnapshotFromYahoo(symbol);
          if (yahooData) {
            source = 'yahoo';
            if (yahooData.quote) {
              detailedQuote = {
                c: yahooData.quote.close,
                d: yahooData.quote.regularMarketChange,
                dp: yahooData.quote.regularMarketChangePercent,
                o: yahooData.quote.open,
                h: yahooData.quote.high,
                l: yahooData.quote.low,
              };
              const newCandle = this.saveYahooQuoteAsCandle(
                tickerEntity.id,
                yahooData.quote,
              );
              latestCandle = await this.ohlcvRepo.save(newCandle).catch((e) => {
                this.logger.warn(
                  `Failed to save Yahoo candle: ${getErrorMessage(e)}`,
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
        } catch (yahooErr) {
          this.logger.warn(
            `Yahoo Finance failed for ${symbol}: ${getErrorMessage(yahooErr)}`,
          );
        }
      } else {
        // US stock path - try Finnhub first
        this.logger.log(
          `Data stale for ${symbol} (Price: ${isPriceStale}, Fundamentals: ${isFundamentalsStale}). Fetching from Finnhub...`,
        );
        try {
          // Fetch in parallel but handle failures individually to avoid "all or nothing"
          const [quoteResult, profileResult, financialsResult] =
            await Promise.allSettled([
              this.finnhubService.getQuote(symbol),
              this.finnhubService.getCompanyProfile(symbol),
              this.finnhubService.getBasicFinancials(symbol),
            ]);

          const quote =
            quoteResult.status === 'fulfilled' ? quoteResult.value : null;
          const profile =
            profileResult.status === 'fulfilled' ? profileResult.value : null;
          const financials =
            financialsResult.status === 'fulfilled'
              ? financialsResult.value
              : null;

          // Log warnings for specific failures
          if (quoteResult.status === 'rejected')
            this.logger.warn(
              `Finnhub quote failed: ${getErrorMessage(quoteResult.reason)}`,
            );
          if (profileResult.status === 'rejected')
            this.logger.warn(
              `Finnhub profile failed: ${getErrorMessage(profileResult.reason)}`,
            );
          if (financialsResult.status === 'rejected')
            this.logger.warn(
              `Finnhub financials failed: ${getErrorMessage(financialsResult.reason)}`,
            );

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
                detailedQuote = {
                  c: yahooData.quote.close,
                  d: yahooData.quote.regularMarketChange,
                  dp: yahooData.quote.regularMarketChangePercent,
                  o: yahooData.quote.open,
                  h: yahooData.quote.high,
                  l: yahooData.quote.low,
                };
                const newCandle = this.saveYahooQuoteAsCandle(
                  tickerEntity.id,
                  yahooData.quote,
                );
                latestCandle = await this.ohlcvRepo
                  .save(newCandle)
                  .catch((e) => {
                    this.logger.warn(
                      `Failed to save Yahoo candle: ${getErrorMessage(e)}`,
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
          } else {
            // Normal Finnhub path
            if (quote) {
              detailedQuote = quote; // Finnhub quote has d and dp directly
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
                  this.logger.warn(
                    `Failed to save candle: ${getErrorMessage(e)}`,
                  ),
                );
              latestCandle = newCandle;
            }

            if (profile || financials?.metric) {
              const metrics = financials?.metric || {};
              const entity =
                fundamentals ||
                this.fundamentalsRepo.create({ symbol_id: tickerEntity.id });

              if (profile) {
                // Finnhub marketCapitalization is in Millions. Normalize to full Dollars using robust parser.
                entity.market_cap = NumberUtil.parseMarketCap(
                  profile.marketCapitalization
                    ? profile.marketCapitalization * 1000000
                    : null,
                );
                entity.sector = profile.finnhubIndustry;
              }

              if (metrics) {
                if (metrics.peTTM) entity.pe_ttm = metrics.peTTM;
                if (metrics.epsTTM) entity.eps_ttm = metrics.epsTTM;
                if (metrics.beta) entity.beta = metrics.beta;
                if (metrics.dividendYieldIndicatedAnnual)
                  entity.dividend_yield = metrics.dividendYieldIndicatedAnnual;

                if (metrics.sharesOutstanding)
                  entity.shares_outstanding =
                    metrics.sharesOutstanding * 1000000; // Finnhub shares are also in Millions usually

                // Map 52-Week Range (Finnhub) - Verify currency consistency
                // If the 52-week low is significantly higher than current price, or high is lower, it's likely a currency mismatch (e.g. DKK vs USD for NVO)
                const fhHigh = metrics['52WeekHigh'];
                const fhLow = metrics['52WeekLow'];
                const currentPrice = quote.c;

                if (fhHigh && fhLow && currentPrice) {
                  // Allow 20% buffer for volatility/timing differences
                  const isLowValid = fhLow <= currentPrice * 1.2;
                  const isHighValid = fhHigh >= currentPrice * 0.8;

                  if (isLowValid && isHighValid) {
                    entity.fifty_two_week_high = fhHigh;
                    entity.fifty_two_week_low = fhLow;
                  } else {
                    this.logger.warn(
                      `Ignored Finnhub 52-week range for ${symbol} due to plausible currency mismatch. Current: ${currentPrice}, Range: ${fhLow}-${fhHigh}`,
                    );
                  }
                }
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
                  `Background Yahoo enrichment skipped for ${symbol}: ${getErrorMessage(ye)}`,
                );
              }

              entity.updated_at = new Date();
              await this.fundamentalsRepo.save(entity);
              fundamentals = entity;
            }
          }
        } catch (error) {
          this.logger.warn(
            `Failed to refresh data for ${symbol} via Finnhub: ${getErrorMessage(error)}. Triggering Yahoo fallback...`,
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
                  `Failed to save Yahoo fallback candle: ${getErrorMessage(e)}`,
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
            `Failed to fetch news for ${symbol} in snapshot: ${getErrorMessage(err)}`,
          );
          return [];
        }),
        this.commentRepo.count({
          where: { ticker_symbol: symbol },
        }),
      ]);

    // Fetch linked research note if available
    let researchNoteTitle = aiAnalysis?.metadata?.summary;
    if (aiAnalysis?.research_note_id && !researchNoteTitle) {
      const note = await this.researchNoteRepo.findOne({
        where: { id: aiAnalysis.research_note_id },
        select: ['id', 'title'],
      });
      if (note) researchNoteTitle = note.title;
    }

    // Fetch last 14 days of prices for sparkline
    const sparklinePrices = await this.ohlcvRepo.find({
      where: { symbol_id: tickerEntity.id, timeframe: '1d' },
      order: { ts: 'DESC' },
      take: 14,
      select: ['close', 'ts'],
    });

    return {
      ticker: tickerEntity,
      latestPrice: latestCandle,
      quote: detailedQuote, // Exposed for frontend (d, dp)
      fundamentals,
      aiAnalysis,
      source,
      news: aiAnalysis
        ? {
            sentiment: aiAnalysis.sentiment,
            score: aiAnalysis.overall_score,
            summary: researchNoteTitle || 'AI Risk Analysis Update',
            updated_at: aiAnalysis.created_at,
          }
        : null,
      counts: {
        news: newsItems.length,
        research: researchCount,
        analysts: analystCount,
        social: socialCount,
      },
      sparkline: (sparklinePrices || []).reverse().map((p) => p.close),
    };
  }

  async getSnapshots(symbols: string[]) {
    // Limit concurrency to avoid overwhelming external APIs if we have many misses
    const validSymbols = symbols.filter((s) => s && s.trim().length > 0);
    const uniqueSymbols = [...new Set(validSymbols)];

    // Fetch in chunks of 5 to respect API rate limits and avoid connection spikes
    // Each getSnapshot can trigger up to 3 API calls (quote, profile, financials)
    const chunkSize = 5;
    const results: any[] = [];

    for (let i = 0; i < uniqueSymbols.length; i += chunkSize) {
      const chunk = uniqueSymbols.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map((symbol) =>
          this.performGetSnapshot(symbol, { updateIfStale: false }).catch(
            (e) => {
              // Disable auto-update for bulk
              this.logger.error(
                `Failed to get snapshot for ${symbol}: ${getErrorMessage(e)}`,
              );
              return { symbol, error: getErrorMessage(e) };
            },
          ),
        ),
      );
      results.push(...chunkResults);
    }

    return results;
  }

  async getHistory(
    symbol: string,
    interval: string,
    fromStr: string,
    toStr: string,
  ) {
    const key = `${symbol.toUpperCase()}-${interval}-${fromStr}-${toStr}`;
    const existing = this.historyRequests.get(key);
    if (existing) {
      this.logger.debug(`Coalescing history request for ${key}`);
      return existing;
    }

    const promise = this.performGetHistory(
      symbol,
      interval,
      fromStr,
      toStr,
    ).finally(() => {
      this.historyRequests.delete(key);
    });

    this.historyRequests.set(key, promise);
    return promise;
  }

  /**
   * Robustly syncs ticker history for a given number of years.
   * Checks DB coverage first to avoid unnecessary API calls.
   * Uses Yahoo Finance as the primary source for deep history.
   * Performs bulk upsert to prevent duplicates.
   */
  async syncTickerHistory(symbol: string, years: number = 5): Promise<void> {
    const ticker = await this.tickersService.getTicker(symbol);
    if (!ticker) {
      this.logger.warn(`Cannot sync history: Ticker ${symbol} not found`);
      return;
    }

    const to = new Date();
    const from = new Date();
    from.setFullYear(from.getFullYear() - years);

    // 1. Check DB Coverage
    // Count expected trading days (rough approx: 252 days per year * 5/7 adjustment is overkill, just ~250/yr)
    // 5 years = ~1250 trading days.
    const expectedDays = years * 250;

    const dbCount = await this.ohlcvRepo.count({
      where: {
        symbol_id: ticker.id,
        timeframe: '1d',
        ts: Between(from, to),
      },
    });

    const coverageRatio = dbCount / expectedDays;
    this.logger.debug(
      `History coverage for ${symbol} (${years}y): ${dbCount}/${expectedDays} (${(coverageRatio * 100).toFixed(1)}%)`,
    );

    // If we have > 95% of data, we consider it "synced enough" to not trigger a full re-download.
    if (coverageRatio > 0.95) {
      this.logger.debug(
        `Skipping full history sync for ${symbol} (Excellent coverage: ${(coverageRatio * 100).toFixed(1)}%)`,
      );
      return;
    }

    this.logger.log(
      `Syncing full history for ${symbol} (${years}y) from Yahoo...`,
    );

    // 2. Fetch from Yahoo
    try {
      // Fetch specifically using Yahoo Service directly or via helper
      const candles = await this.yahooFinanceService.getHistorical(
        symbol,
        from,
        to,
        '1d',
      );
      if (!candles || candles.length === 0) {
        this.logger.warn(`No history returned from Yahoo for ${symbol}`);
        return;
      }

      // 3. Transform and Upsert
      const entities = candles.map((c: any) => {
        // Yahoo format: { date, open, high, low, close, adjClose, volume }
        return this.ohlcvRepo.create({
          symbol_id: ticker.id,
          timeframe: '1d',
          ts: c.date,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          source: 'yahoo_history_sync',
          inserted_at: new Date(),
        });
      });

      // Filter out invalid records (e.g. null prices)
      const validEntities = entities.filter(
        (e: any) => e.close !== null && e.close !== undefined,
      );

      if (validEntities.length === 0) return;

      // Bulk Upsert using TypeORM
      // Conflict on [symbol_id, timeframe, ts]
      await this.ohlcvRepo.upsert(validEntities, [
        'symbol_id',
        'timeframe',
        'ts',
      ]);

      this.logger.log(`Upserted ${validEntities.length} candles for ${symbol}`);
    } catch (e) {
      this.logger.error(
        `Failed to sync history for ${symbol}: ${e.message}`,
        e,
      );
    }
  }

  private async performGetHistory(
    symbol: string,
    interval: string,
    fromStr: string,
    toStr: string,
  ) {
    const tickerEntity = await this.tickersService.getTicker(symbol);

    // Normalize interval for DB and providers
    const normalizedInterval =
      interval === 'D' || interval === '1d' ? '1d' : interval;

    // Use absolute UTC dates to avoid timezone shifts
    const from = new Date(
      fromStr + (fromStr.includes('T') ? '' : 'T00:00:00Z'),
    );
    const to = new Date(toStr + (toStr.includes('T') ? '' : 'T23:59:59Z'));

    // 1. Try DB first
    const dbData = await this.ohlcvRepo.find({
      where: {
        symbol_id: tickerEntity.id,
        timeframe: normalizedInterval,
        ts: Between(from, to),
      },
      order: { ts: 'ASC' },
    });

    // Smart Coverage Check (Trading days are ~5/7 of calendar days)
    const msPerDay = 1000 * 60 * 60 * 24;
    const calendarDaysRequested = (to.getTime() - from.getTime()) / msPerDay;
    const expectedTradingDays = Math.max(
      1,
      Math.floor(calendarDaysRequested * (5 / 7)),
    );
    const coverageRatio = dbData.length / expectedTradingDays;

    // If we have > 95% of expected trading days, return DB.
    if (coverageRatio > 0.95) {
      this.logger.debug(
        `Using DB history (Excellent Coverage: ${(coverageRatio * 100).toFixed(1)}%)`,
      );
      return dbData;
    }

    // 2. Fetch from Providers (Sync if coverage is low/gaps exist)
    this.logger.log(
      `Gap detected in DB history for ${symbol} (Coverage: ${(coverageRatio * 100).toFixed(1)}%). Syncing synchronously...`,
    );

    // Await sync to ensure user gets full data even if it takes a moment
    await this.syncTickerHistory(symbol, 5);

    // Re-query DB after sync
    const syncedData = await this.ohlcvRepo.find({
      where: {
        symbol_id: tickerEntity.id,
        timeframe: normalizedInterval,
        ts: Between(from, to),
      },
      order: { ts: 'ASC' },
    });

    if (syncedData.length > 0) return syncedData;

    // 3. Fallback Providers (Final attempt if sync failed)
    let history: any[] = [];
    let source = 'finnhub';

    const fromUnix = Math.floor(from.getTime() / 1000);
    const toUnix = Math.floor(to.getTime() / 1000);

    try {
      const resolution =
        normalizedInterval === '1d'
          ? 'D'
          : normalizedInterval === '1wk'
            ? 'W'
            : 'M';

      this.logger.debug(
        `Finnhub Request: ${symbol} Res: ${resolution} From: ${fromUnix} To: ${toUnix}`,
      );

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
        `Finnhub history failed for ${symbol}: ${getErrorMessage(e)}. Trying Yahoo fallback...`,
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
        this.logger.error(
          `Yahoo history fallback failed: ${getErrorMessage(ye)}`,
        );
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
        this.logger.debug(
          `Batch save history partially failed: ${getErrorMessage(e)}`,
        );
      });
    } catch (e) {
      this.logger.error(
        `Failed to save historical data: ${getErrorMessage(e)}`,
      );
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
    const isNonUSStock = symbol.includes('.');

    if (isNonUSStock) {
      this.logger.log(
        `Non-US stock ${symbol} detected, skipping Finnhub news (often maps incorrectly). Using Yahoo Finance...`,
      );
      try {
        news = await this.fetchNewsFromYahoo(symbol);
      } catch (yError) {
        this.logger.error(
          `Yahoo news fallback for ${symbol} failed: ${getErrorMessage(yError)}`,
        );
        // Don't throw, just return empty so we don't break the snapshot
        return [];
      }
    } else {
      try {
        news = await this.finnhubService.getCompanyNews(
          symbol,
          fromDate.toISOString().split('T')[0],
          toDate.toISOString().split('T')[0],
        );
      } catch (error) {
        this.logger.warn(
          `Finnhub news fetch failed for ${symbol}: ${getErrorMessage(error)}. Trying Yahoo fallback...`,
        );
        try {
          news = await this.fetchNewsFromYahoo(symbol);
        } catch (yError) {
          this.logger.error(
            `Yahoo news fallback also failed: ${getErrorMessage(yError)}`,
          );
          throw error; // Re-throw original error if fallback fails
        }
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
      this.logger.error(
        `News sync failed for ${symbol}: ${getErrorMessage(e)}`,
      );
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
      this.logger.warn(
        `Failed to fetch general news via Finnhub: ${getErrorMessage(e)}. Trying Yahoo fallback...`,
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
          `Yahoo general news fallback failed: ${getErrorMessage(yError)}`,
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
            `Failed to fetch news for ${symbol}: ${getErrorMessage(err)}`,
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
   * Get count of tickers where the weighted verdict algorithm returns "Strong Buy".
   * Uses the same logic as the frontend VerdictBadge.
   */
  async getStrongBuyCount(): Promise<{ count: number; symbols: string[] }> {
    const tickers = await this.getTickersWithRiskData();
    // Include Strong Buy, No Brainer (Legendary), and Speculative Buy
    const strongBuys = tickers.filter((t) =>
      ['strongBuy', 'legendary', 'speculativeBuy'].includes(t.verdict.variant),
    );
    return {
      count: strongBuys.length,
      symbols: strongBuys.map((t) => t.symbol),
    };
  }

  /**
   * Get count of tickers where the weighted verdict algorithm returns "Sell".
   * Uses the same logic as the frontend VerdictBadge.
   */
  async getSellCount(): Promise<{ count: number; symbols: string[] }> {
    const tickers = await this.getTickersWithRiskData();
    const sells = tickers.filter((t) => t.verdict.variant === 'sell');
    return { count: sells.length, symbols: sells.map((t) => t.symbol) };
  }

  /**
   * Internal helper: Fetch all tickers with risk data and compute their verdict using live calculations.
   * Uses the same dynamic price calculation as the Analyzer filter.
   */
  private async getTickersWithRiskData() {
    const qb = this.tickerRepo.createQueryBuilder('ticker');

    // Join Latest Risk
    qb.leftJoin(
      RiskAnalysis,
      'risk',
      'risk.ticker_id = ticker.id AND risk.created_at = (SELECT MAX(created_at) FROM risk_analyses WHERE ticker_id = ticker.id)',
    );

    // Join Fundamentals
    qb.leftJoin(Fundamentals, 'fund', 'fund.symbol_id = ticker.id');

    // Join Latest Price
    qb.leftJoin(
      PriceOhlcv,
      'price',
      'price.symbol_id = ticker.id AND price.ts = (SELECT MAX(ts) FROM price_ohlcv WHERE symbol_id = ticker.id)',
    );

    // Join Base and Bear Scenarios
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

    qb.where('ticker.is_hidden = :hidden', { hidden: false });

    // Select fields with dynamic calculations
    qb.select([
      'ticker.symbol',
      'risk.financial_risk',
      'risk.overall_score',
      'fund.consensus_rating',
      'fund.pe_ttm',
      'price.close',
      'base_scenario.price_mid',
      'bear_scenario.price_mid',
    ]);

    const rawResults = await qb.getRawMany();

    return rawResults.map((row) => {
      const currentPrice = parseFloat(row.price_close) || 0;
      const baseTarget = parseFloat(row.base_scenario_price_mid) || null;
      const bearTarget = parseFloat(row.bear_scenario_price_mid) || null;
      const financialRisk = parseFloat(row.risk_financial_risk) || 5;

      // Dynamic upside calculation
      let upside = 0;
      if (currentPrice > 0 && baseTarget && baseTarget > 0) {
        upside = ((baseTarget - currentPrice) / currentPrice) * 100;
      }

      // Dynamic downside calculation
      let downside = 0;
      if (currentPrice > 0 && bearTarget && bearTarget > 0) {
        downside = ((bearTarget - currentPrice) / currentPrice) * 100;
      } else if (financialRisk >= 8) {
        downside = -100;
      } else {
        downside = -(financialRisk * 5);
      }

      const input: VerdictInput = {
        risk: financialRisk,
        upside: upside,
        downside: downside,
        consensus: row.fund_consensus_rating || undefined,
        overallScore: parseFloat(row.risk_overall_score) || null,
        peRatio: parseFloat(row.fund_pe_ttm) || null,
      };
      return {
        symbol: row.ticker_symbol,
        verdict: calculateAiRating(input),
      };
    });
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
      ELSE -(risk.financial_risk * 5)
    END`;

    // -------------------------------------------------------------------------
    // VERDICT SCORING SQL (Backend Mirror of verdict.util.ts)
    // -------------------------------------------------------------------------
    const verdictScoreSql = `(
        50
        -- 1. Upside Impact (Max 0+, Capped at 100, * 0.4)
        + (GREATEST(0, LEAST(100, COALESCE(${upsideExpr}, 0))) * 0.4)
        
        -- 2. Downside Impact (Abs, Cap 40, * 0.8) -> Subtract
        - (LEAST(40, ABS(COALESCE(${downsideExpr}, 0)) * 0.8))
        
        -- 3. Risk Penalty / Bonus
        + CASE 
            WHEN risk.financial_risk >= 8 THEN -20 
            WHEN risk.financial_risk >= 6 THEN -10 
            WHEN risk.financial_risk <= 3 THEN 5 
            ELSE 0 
          END
        
      -- 3.5 ATH Penalty (Progressive)
      + CASE
          WHEN fund.fifty_two_week_high > 0 AND price.close >= (fund.fifty_two_week_high * 0.98) THEN -20
          WHEN fund.fifty_two_week_high > 0 AND price.close >= (fund.fifty_two_week_high * 0.90) THEN -10
          WHEN fund.fifty_two_week_high > 0 AND price.close >= (fund.fifty_two_week_high * 0.80) THEN -5
          ELSE 0
        END

      -- 3.6 Low Reward (Buy the Dip) - With Falling Knife Check
      + CASE
          WHEN fund.fifty_two_week_low > 0 AND price.close <= (fund.fifty_two_week_low * 1.25) THEN
            CASE
               -- Falling Knife Exception: Sell Consensus AND Downside ~ -100%
               WHEN (fund.consensus_rating ILIKE '%Sell%') AND (${downsideExpr} <= -99) THEN 0
               -- Tiers
               WHEN price.close <= (fund.fifty_two_week_low * 1.05) THEN 10
               WHEN price.close <= (fund.fifty_two_week_low * 1.25) THEN 5
               ELSE 0
            END
          ELSE 0
        END

      -- 3.7 No Revenue Penalty
      + CASE
          WHEN fund.revenue_ttm IS NULL OR fund.revenue_ttm <= 0 THEN -5
          ELSE 0
        END

        -- 4. Neural Score Bonus (Weight Increased)
        + CASE 
            WHEN "risk"."overall_score" >= 8 THEN 20
            WHEN "risk"."overall_score" >= 6 THEN 10
            WHEN "risk"."overall_score" <= 4 THEN -10
            ELSE 0 
          END
        
        -- 5. Analyst Consensus
        + CASE 
            WHEN fund.consensus_rating ILIKE '%Strong Buy%' THEN 10 
            WHEN fund.consensus_rating ILIKE '%Buy%' THEN 5 
            WHEN fund.consensus_rating ILIKE '%Sell%' THEN -10 
            ELSE 0 
          END
          
        -- 6. PE Ratio Impact - Only reward value, don't punish growth/pre-revenue
        + CASE 
            WHEN fund.pe_ttm IS NULL OR fund.pe_ttm <= 0 THEN 0
            WHEN fund.pe_ttm <= 10 THEN 20           -- Exceptional Value
            WHEN fund.pe_ttm <= 15 THEN 15           -- Great Value
            WHEN fund.pe_ttm <= 25 THEN 5            -- Fair Value
            ELSE 0 
          END

        -- 7. Smart News Integration (High Impact Only)
        + CASE
            WHEN ticker.news_impact_score >= 8 AND UPPER(ticker.news_sentiment) = 'BULLISH' THEN 15
            WHEN ticker.news_impact_score >= 8 AND UPPER(ticker.news_sentiment) = 'BEARISH' THEN -15
            WHEN ticker.news_impact_score >= 5 AND UPPER(ticker.news_sentiment) = 'BULLISH' THEN 5
            WHEN ticker.news_impact_score >= 5 AND UPPER(ticker.news_sentiment) = 'BEARISH' THEN -5
            ELSE 0
          END
      )`;

    qb.addSelect('base_scenario.price_mid', 'base_price');
    qb.addSelect('bear_scenario.price_mid', 'bear_price');
    qb.addSelect(upsideExpr, 'dynamic_upside');
    qb.addSelect(downsideExpr, 'dynamic_downside');
    qb.addSelect(verdictScoreSql, 'ai_verdict_score');

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

    // 2.6 Min Market Cap Filter
    if (options.minMarketCap) {
      qb.andWhere('fund.market_cap >= :minMarketCap', {
        minMarketCap: options.minMarketCap,
      });
    }

    // 2.7 Profitable Only Filter (PE TTM > 0 OR Net Income > 0)
    // Using PE > 0 as a strict profitability check for now as requested
    if (options.profitableOnly) {
      qb.andWhere('fund.pe_ttm > 0');
    }

    // 3. AI Rating Filter (Standardized Weighted Verdict)
    // Synchronized with frontend rating-utils.ts
    // Score Tiers: >= 80 Strong Buy, >= 65 Buy, >= 45 Hold, < 45 Sell
    if (options.aiRating && options.aiRating.length > 0) {
      qb.andWhere(
        new Brackets((sub) => {
          options.aiRating?.forEach((rating) => {
            if (rating === 'Legendary' || rating === 'No Brainer') {
              sub.orWhere(`${verdictScoreSql} > 105`);
            } else if (rating === 'Strong Buy') {
              sub.orWhere(`${verdictScoreSql} >= 80`);
            } else if (rating === 'Buy') {
              sub.orWhere(
                `${verdictScoreSql} >= 65 AND ${verdictScoreSql} < 80`,
              );
            } else if (rating === 'Hold') {
              sub.orWhere(
                `${verdictScoreSql} >= 45 AND ${verdictScoreSql} < 65`,
              );
            } else if (rating === 'Sell') {
              sub.orWhere(`${verdictScoreSql} < 45`);
            } else if (rating === 'Speculative Buy') {
              // Speculative Buy override logic
              sub.orWhere(
                `risk.financial_risk >= 8 AND (risk.overall_score >= 7.5 OR ${upsideExpr} >= 100)`,
              );
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
      sortField = '"ai_verdict_score"';
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
    } else if (sortBy === 'consensus') {
      sortField = 'fund.consensus_rating';
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
      items: await Promise.all(
        entities.map(async (t: any) => {
          const rawData = raw.find((r) => r.ticker_id === t.id);

          const analystCount = rawData
            ? parseInt(rawData.analyst_count, 10)
            : 0;
          const researchCount = rawData
            ? parseInt(rawData.research_count, 10)
            : 0;
          const socialCount = rawData ? parseInt(rawData.social_count, 10) : 0;
          const newsCount = rawData ? parseInt(rawData.news_count, 10) : 0;
          const changePct = rawData ? parseFloat(rawData.price_change_pct) : 0;

          // Fetch last 14 days of prices for sparkline
          const prices = await this.ohlcvRepo.find({
            where: { symbol_id: t.id, timeframe: '1d' },
            order: { ts: 'DESC' },
            take: 14,
            select: ['close', 'ts'],
          });

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
              news_sentiment: t.news_sentiment,
              news_impact_score: t.news_impact_score,
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
            sparkline: (prices || []).reverse().map((p) => p.close),
          };
        }),
      ),
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
              change: price.prevClose ? price.close - price.prevClose : 0,
              changePercent: changePercent, // Map calculated change
              prevClose: price.prevClose, // Keep for reference
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

  async updateTickerNews(
    symbol: string,
    data: { sentiment: string; score: number; summary: string },
  ) {
    const ticker = await this.tickerRepo.findOne({
      where: { symbol: symbol.trim().toUpperCase() },
    });
    if (!ticker) {
      this.logger.debug(`Could not find ticker during news update: ${symbol}`);
      return;
    }

    ticker.news_sentiment = data.sentiment;
    ticker.news_impact_score = Math.round(data.score); // Ensure integer column compatibility
    ticker.news_summary = data.summary;
    ticker.last_news_update = new Date();

    await this.tickerRepo.save(ticker);
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
        `Failed to fetch Yahoo snapshot for ${symbol}: ${getErrorMessage(e)}`,
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
      if (stats.forwardPE) entity.forward_pe = stats.forwardPE;
      if (stats.trailingPE) entity.trailing_pe = stats.trailingPE;
      // Map to standard pe_ttm if missing
      if (!entity.pe_ttm && stats.trailingPE) entity.pe_ttm = stats.trailingPE;

      if (stats.sharesOutstanding)
        entity.shares_outstanding = stats.sharesOutstanding;

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

    // Map 52-Week High/Low (usually in summaryDetail)
    if (summary.summaryDetail) {
      const detail = summary.summaryDetail;
      if (detail.fiftyTwoWeekHigh)
        entity.fifty_two_week_high = detail.fiftyTwoWeekHigh;
      if (detail.fiftyTwoWeekLow)
        entity.fifty_two_week_low = detail.fiftyTwoWeekLow;
    }

    if (quote) {
      if (quote.marketCap) {
        entity.market_cap = NumberUtil.parseMarketCap(quote.marketCap);
      }
      // Fallback if not in summary
      if (!entity.fifty_two_week_high && quote.fiftyTwoWeekHigh)
        entity.fifty_two_week_high = quote.fiftyTwoWeekHigh;
      if (!entity.fifty_two_week_low && quote.fiftyTwoWeekLow)
        entity.fifty_two_week_low = quote.fiftyTwoWeekLow;
    }

    // Store full raw metadata
    entity.yahoo_metadata = {
      summary,
      quote,
      updated_at: new Date(),
    };

    entity.updated_at = new Date();
    return await this.fundamentalsRepo.save(entity);
  }
  private marketStatusCache: { data: any; expiry: number } | null = null;
  private static readonly MARKET_STATUS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getMarketStatus(exchange: string): Promise<any> {
    // Check cache first
    if (this.marketStatusCache && this.marketStatusCache.expiry > Date.now()) {
      return this.marketStatusCache.data;
    }

    const result = await this.finnhubService.getMarketStatus(exchange);

    // Cache the result (even if null, to prevent repeated failed calls)
    this.marketStatusCache = {
      data: result,
      expiry: Date.now() + MarketDataService.MARKET_STATUS_CACHE_TTL,
    };

    return result;
  }

  /**
   * Background CRON Job: Refresh Top Picks every 5 minutes
   * Ensures the "Dashboard Picks" are not stale.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async refreshTopPicks() {
    this.logger.log('CRON: Refreshing Top Picks (YOLO & Conservative)...');

    try {
      // 1. Find potential top picks (High potential upside OR High Score)
      const candidates = await this.getAnalyzerTickers({
        limit: 50,
        sortBy: 'upside_percent',
        sortDir: 'DESC',
      });

      // 2. Identify stale ones
      const staleSymbols: string[] = [];
      const now = Date.now();
      const STALE_THRESHOLD = 5 * 60 * 1000; // 5 mins

      candidates.items.forEach((item) => {
        const lastUpdate = item.latestPrice?.ts
          ? new Date(item.latestPrice.ts).getTime()
          : 0;
        if (now - lastUpdate > STALE_THRESHOLD) {
          staleSymbols.push(item.ticker.symbol);
        }
      });

      if (staleSymbols.length === 0) {
        this.logger.log('CRON: No stale top picks found.');
        return;
      }

      this.logger.log(
        `CRON: Found ${staleSymbols.length} stale top picks. Refreshing...`,
      );

      // 3. Refresh in batches
      // We use getSnapshots which handles batching internally
      await this.getSnapshots(staleSymbols);

      this.logger.log('CRON: Top Picks refresh complete.');
    } catch (e) {
      this.logger.error(
        `CRON: Top Picks refresh failed: ${e.message}`,
        e.stack,
      );
    }
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

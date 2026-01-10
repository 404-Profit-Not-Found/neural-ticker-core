import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { TickersService } from '../tickers/tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { ResearchService } from '../research/research.service';
import {
  RequestQueue,
  RequestStatus,
  RequestType,
} from './entities/request-queue.entity'; // Added
import { InjectRepository } from '@nestjs/typeorm'; // Added
import { Repository, LessThanOrEqual } from 'typeorm'; // Added

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly riskRewardService: RiskRewardService, // Added back
    @Inject(forwardRef(() => TickersService))
    private readonly tickersService: TickersService,
    private readonly marketDataService: MarketDataService,
    private readonly researchService: ResearchService,
    @InjectRepository(RequestQueue)
    private readonly requestQueueRepo: Repository<RequestQueue>,
  ) {}

  async cleanupStuckResearch() {
    this.logger.log('Running Zombie Ticket Cleanup...');
    try {
      const count = await this.researchService.failStuckTickets(20); // 20 mins
      this.logger.log(`Cleanup complete. Fixed ${count} tickets.`);
      return { count };
    } catch (e) {
      this.logger.error('Zombie Ticket Cleanup failed', e);
      throw e;
    }
  }

  /**
   * Performs an exhaustive initial sync for a new ticker:
   * 1. Snapshot (Price + Fundamentals)
   * 2. History (180 days for charts)
   * 3. Initial AI Research (Risk/Reward)
   */
  async initializeTicker(symbol: string) {
    this.logger.log(`Initializing new ticker: ${symbol}`);
    try {
      // 1. Snapshot
      await this.marketDataService.getSnapshot(symbol);

      // 2. History
      // 2. History (5 years)
      await this.marketDataService.syncTickerHistory(symbol, 5);

      // 3. Queue Research
      this.logger.log(`Queueing initial research for ${symbol}...`);
      const note = await this.researchService.createResearchTicket(
        null, // System
        [symbol.toUpperCase()],
        `Perform initial analysis for ${symbol}. Provide company profile, financials, and risk/reward assessment.`,
        'gemini',
        'low',
      );
      // Process if not too busy, or let a separate worker handle it.
      // Here we process immediately since it's a "fresh add" event.
      await this.researchService.processTicket(note.id);

      this.logger.log(`Initialization complete for ${symbol}`);
    } catch (err: any) {
      this.logger.error(
        `Failed to initialize ticker ${symbol}: ${err.message}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async syncDailyCandles() {
    this.logger.log('Starting daily candle sync...');
    try {
      const tickers = await this.tickersService.getAllTickers();
      this.logger.log(`Found ${tickers.length} tickers to sync.`);

      for (const ticker of tickers) {
        if (!ticker.symbol) continue;
        try {
          // 1. Sync Snapshot (Latest Price + News)
          await this.marketDataService.getSnapshot(ticker.symbol);

          // 2. Sync History (180 days for charts)
          // 2. Sync History (5 years)
          await this.marketDataService.syncTickerHistory(ticker.symbol, 5);

          this.logger.debug(`Synced snapshot and history for ${ticker.symbol}`);
        } catch (err: any) {
          this.logger.error(`Failed to sync ${ticker.symbol}: ${err.message}`);
        }
        // Small delay to be respectful to API rate limits (1.5s per ticker)
        await new Promise((r) => setTimeout(r, 1500));
      }
      this.logger.log('Daily candle sync completed.');
    } catch (e) {
      this.logger.error('Daily candle sync failed globally', e);
    }
  }

  @Cron(CronExpression.EVERY_WEEK)
  async runRiskRewardScanner() {
    this.logger.log('Starting Periodic Risk/Reward Scanner (Low Tier)...');
    try {
      const tickers = await this.tickersService.getAllTickers();
      this.logger.log(`Found ${tickers.length} tickers to scan.`);

      let processed = 0;
      let skipped = 0;
      const interval14Days = 14 * 24 * 60 * 60 * 1000;

      for (const ticker of tickers) {
        if (!ticker.symbol) continue;
        const symbol = ticker.symbol;

        try {
          // Check if we have recent analysis
          // We need Ticker ID for this. getAllTickers returns existing entities with IDs.
          // TickersService.getAllTickers returns Partial<TickerEntity> but typically includes ID if selected or full object.
          // Let's verify getAllTickers implementation. It selects specific fields. We might need ID.
          // Adjusting logic to fetch ticker detail if id is missing or assume getAllTickers returns enough.
          // If getAllTickers selects are restrictive, we might need to fetch full ticker or use symbol to find ID.
          // RiskRewardService.getLatestAnalysis takes tickerId.
          // Let's assume we can fetch the ticker by symbol to get ID efficiently if needed, or update getAllTickers.
          // Better: TickersService.getTicker(symbol) is cached/fast-ish? No.
          // Let's rely on TickersService.getAllTickers() returning what we need or fetch fresh.

          // Optimization: Check existing analysis via RiskRewardService which might need to look up ticker ID internally or we provide it.
          // RiskRewardService.getLatestScore(symbol) encapsulates this!
          // It calls marketDataService.getSnapshot(symbol) which gets Ticker ID.
          // Then calls getLatestAnalysis(tickerId).

          const existingAnalysis =
            await this.riskRewardService.getLatestScore(symbol);

          const isStale =
            !existingAnalysis ||
            Date.now() - existingAnalysis.created_at.getTime() > interval14Days;

          if (!isStale) {
            skipped++;
            continue;
          }

          this.logger.log(`Queueing Low-Tier Scan for ${symbol}...`);

          // Create System Research Ticket (User ID = null)
          const note = await this.researchService.createResearchTicket(
            null, // System
            [symbol],
            `Analyze the risk/reward profile for ${symbol} based on recent price action (OHLCV) and key fundamentals.
      
      CRITICAL INSTRUCTION:
      You MUST act as a data gatherer. 
      Check for and explicitly mention the following in your analysis if available or estimate/search for them:
      - Company Description (2-3 sentences, about the business model and key products)
      - Revenue Growth (YoY)
      - Profit Margins (Gross, Operating, Net)
      - ROE / ROA
      - Debt/Equity Ratio
      - Current Ratio
      - Recent Analyst Ratings (Buy/Sell, Targets)

      Then provide a Risk/Reward Score (0-10) and a succinct summary.
      `,
            'gemini',
            'low', // Low tier = gemini-1.5-flash-002 (Cheap)
          );

          // Process immediately (or could just leave it if there was a separate worker, but here we process)
          await this.researchService.processTicket(note.id);

          processed++;

          // Slight delay to be nice to API rate limits
          await new Promise((r) => setTimeout(r, 2000));
        } catch (err) {
          this.logger.error(`Scanner failed for ${symbol}: ${err.message}`);
        }
      }

      this.logger.log(
        `Scanner Complete. Processed: ${processed}, Skipped: ${skipped}`,
      );
    } catch (e) {
      this.logger.error('Risk/Reward Scanner failed globally', e);
    }
  }

  async syncResearchAndRatings(symbol: string) {
    this.logger.log(`Syncing research + dedupe ratings for ${symbol}...`);
    try {
      // Reprocess research to refresh bull/base/bear and financials
      await this.researchService.reprocessFinancials(symbol);
      // Dedupe analyst ratings for the ticker
      const { removed } =
        await this.marketDataService.dedupeAnalystRatings(symbol);
      this.logger.log(
        `Sync complete for ${symbol}. Removed ${removed} duplicate ratings.`,
      );
      return { removed };
    } catch (e) {
      this.logger.error(`Sync failed for ${symbol}: ${e.message}`);
      throw e;
    }
  }

  // --- DAILY DIGEST CRON ---
  // Runs every day at 6:00 AM UTC (Pre-market)
  // @Cron('0 6 * * *') or uses NestJS CronExpression if available, checking imports.
  // We need to import Cron logic. But @nestjs/schedule might need @Cron decorator.
  // Since I cannot change imports easily with replace_file (I need to see top of file),
  // I will check if @Cron is imported.
  // File view showed no Cron imports. I need to add imports to the top first?
  // Limitation: I can only replace blocks.
  // Strategy: Add imports in one tool call, then add method in another?
  // Or just replace the whole file content? It is small enough (159 lines).
  // No, `replace_file_content` is better.
  // I will use `replace_file_content` to add imports at top, then method at bottom.

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runDailyDigest() {
    this.logger.log('Starting News Digest Generation (5-min cycle)...');
    // For cron, we might want to generate for ALL users? Or just a system global one?
    // The current requirement was "personalized per user".
    // If this cron is meant to pre-warm cache, it can't pre-warm for everyone easily.
    // Maybe it pre-warms the "Market Opportunities" fallback (userId=system)?
    await this.researchService.getOrGenerateDailyDigest('system-cron');
    await this.researchService.getOrGenerateDailyDigest('system-cron');
  }

  // --- ASYNC REQUEST QUEUE ---

  async queueRequest(type: RequestType, payload: any) {
    const request = this.requestQueueRepo.create({
      type,
      payload,
      status: RequestStatus.PENDING,
      attempts: 0,
    });
    return this.requestQueueRepo.save(request);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingRequests() {
    this.logger.debug('Checking for pending async requests...');

    // Fetch pending jobs that are ready to run
    const pending = await this.requestQueueRepo.find({
      where: {
        status: RequestStatus.PENDING,
        next_attempt: LessThanOrEqual(new Date()),
      },
      take: 10, // Batch size
    });

    if (pending.length === 0) return;
    this.logger.log(`Found ${pending.length} pending requests to process.`);

    for (const req of pending) {
      // Lock it (simple optimistic locking via status)
      req.status = RequestStatus.PROCESSING;
      await this.requestQueueRepo.save(req);

      try {
        if (req.type === RequestType.ADD_TICKER) {
          const { symbol } = req.payload;
          this.logger.log(`Processing queued ticker addition: ${symbol}`);
          // Force ensure ticker (will fail again if 429, but that's handled locally here)
          await this.tickersService.ensureTicker(symbol);
        }

        // deeply update status
        await this.requestQueueRepo.update(req.id, {
          status: RequestStatus.COMPLETED,
          updated_at: new Date(),
        });
        this.logger.log(
          `Request ${req.id} (${req.type}) completed successfully.`,
        );
      } catch (err: any) {
        this.logger.warn(`Request ${req.id} failed: ${err.message}`);

        const attempts = req.attempts + 1;

        let newStatus = RequestStatus.PENDING;
        // Max 10 attempts
        if (attempts >= 10) {
          newStatus = RequestStatus.FAILED;
          this.logger.error(
            `Request ${req.id} failed permanently after ${attempts} attempts.`,
          );
        }

        // Exponential backoff: 30s, 1m, 2m, 4m...
        const backoffSeconds = 30 * Math.pow(2, attempts - 1);
        const nextAttempt = new Date(Date.now() + backoffSeconds * 1000);

        await this.requestQueueRepo.update(req.id, {
          status: newStatus,
          attempts: attempts,
          next_attempt: nextAttempt,
          updated_at: new Date(),
        });
      }
    }
  }
}

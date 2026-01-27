import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { TickersService } from '../tickers/tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { MarketStatusService } from '../market-data/market-status.service';
import { ResearchService } from '../research/research.service';
import { StockTwitsService } from '../stocktwits/stocktwits.service';
import { PortfolioService } from '../portfolio/portfolio.service';
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
  // In-app crons only run in development - GitHub Actions handles production crons
  private readonly isDevMode = process.env.NODE_ENV !== 'production';

  constructor(
    private readonly riskRewardService: RiskRewardService, // Added back
    @Inject(forwardRef(() => TickersService))
    private readonly tickersService: TickersService,
    private readonly marketDataService: MarketDataService,
    private readonly marketStatusService: MarketStatusService,
    private readonly researchService: ResearchService,
    private readonly stocktwitsService: StockTwitsService,
    @InjectRepository(RequestQueue)
    private readonly requestQueueRepo: Repository<RequestQueue>,
    @Inject(forwardRef(() => PortfolioService))
    private readonly portfolioService: PortfolioService,
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

  @Cron(CronExpression.EVERY_HOUR)
  private async syncStockTwitsPostsCron() {
    if (!this.isDevMode) return;
    await this.stocktwitsService.handleHourlyPostsSync();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  private async syncStockTwitsWatchersCron() {
    if (!this.isDevMode) return;
    await this.stocktwitsService.handleDailyWatchersSync();
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
  private async syncDailyCandlesCron() {
    if (!this.isDevMode) return; // Production uses GitHub Actions
    await this.syncDailyCandles();
  }

  async syncDailyCandles() {
    this.logger.log('Starting sequential batch candle sync...');
    try {
      const tickers = await this.tickersService.getAllTickers();
      const BATCH_SIZE = 25;
      const MAX_BATCHES = 5; // Process 5 batches per run (125 tickers max)

      const totalBatches = Math.min(
        Math.ceil(tickers.length / BATCH_SIZE),
        MAX_BATCHES,
      );

      this.logger.log(
        `Processing ${totalBatches} batches of ${BATCH_SIZE} tickers (${totalBatches * BATCH_SIZE} total)`,
      );

      let totalProcessed = 0;
      let totalFailed = 0;

      for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
        const startIdx = batchNum * BATCH_SIZE;
        const batch = tickers.slice(startIdx, startIdx + BATCH_SIZE);

        this.logger.log(
          `Processing batch ${batchNum + 1}/${totalBatches} (tickers ${startIdx}-${startIdx + batch.length - 1})`,
        );

        let batchProcessed = 0;
        let batchFailed = 0;

        for (const ticker of batch) {
          if (!ticker.symbol) continue;
          try {
            await this.marketDataService.getSnapshot(ticker.symbol);
            await this.marketDataService.syncTickerHistory(ticker.symbol, 5);
            batchProcessed++;
          } catch (err: any) {
            batchFailed++;
            this.logger.error(`Failed ${ticker.symbol}: ${err.message}`);
          }
        }

        totalProcessed += batchProcessed;
        totalFailed += batchFailed;

        this.logger.log(
          `Batch ${batchNum + 1} complete. Processed: ${batchProcessed}, Failed: ${batchFailed}`,
        );
      }

      this.logger.log(
        `All batches complete. Total Processed: ${totalProcessed}, Total Failed: ${totalFailed}`,
      );
      return {
        processed: totalProcessed,
        failed: totalFailed,
        batches: totalBatches,
      };
    } catch (e) {
      this.logger.error('Daily candle sync failed globally', e);
      throw e;
    }
  }

  // --- LIGHT SNAPSHOT SYNC (Prices only, no history) ---
  @Cron(CronExpression.EVERY_30_MINUTES)
  private async syncSnapshotsCron() {
    if (!this.isDevMode) return; // Production uses GitHub Actions
    await this.syncSnapshots();
  }

  /**
   * Light sync - only fetches current price snapshots for all tickers.
   * Much faster than syncDailyCandles since it skips history.
   * Syncs tickers only when their respective market is open.
   */
  async syncSnapshots(force = false) {
    // Check if any market is open (unless forced via HTTP call)
    if (!force) {
      const status = await this.marketStatusService.getAllMarketsStatus();
      const isAnyOpen = status.us.isOpen || status.eu.isOpen;

      if (!isAnyOpen) {
        this.logger.log('All markets are closed. Skipping snapshot sync.');
        return {
          success: 0,
          failed: 0,
          skipped: true,
          reason: 'All markets closed',
        };
      }
    }

    this.logger.log('Starting light snapshot sync (prices only)...');
    try {
      const tickers = await this.tickersService.getAllTickers();
      this.logger.log(`Found ${tickers.length} tickers total.`);

      let success = 0;
      let failed = 0;
      let skippedMarketClosed = 0;

      for (const ticker of tickers) {
        if (!ticker.symbol) continue;

        // Check if this ticker's market is open
        const exchange = (ticker as any).exchange || 'US';
        const status = await this.marketStatusService.getMarketStatus(
          ticker.symbol,
          exchange,
        );

        if (!force && !status.isOpen) {
          skippedMarketClosed++;
          continue;
        }

        try {
          // getSnapshot already uses Finnhub with Yahoo fallback internally
          await this.marketDataService.getSnapshot(ticker.symbol);
          success++;
        } catch (err: any) {
          failed++;
          this.logger.warn(
            `Snapshot failed for ${ticker.symbol}: ${err.message}`,
          );
        }
        // Shorter delay since it's just snapshots (500ms)
        await new Promise((r) => setTimeout(r, 500));
      }

      this.logger.log(
        `Snapshot sync complete. Success: ${success}, Failed: ${failed}, Skipped (market closed): ${skippedMarketClosed}`,
      );
      return { success, failed, skipped: false };
    } catch (e) {
      this.logger.error('Snapshot sync failed globally', e);
      throw e;
    }
  }
  @Cron(CronExpression.EVERY_WEEK)
  private async runRiskRewardScannerCron() {
    if (!this.isDevMode) return; // Production uses GitHub Actions
    await this.runRiskRewardScanner();
  }

  async runRiskRewardScanner() {
    this.logger.log('Starting sequential batch risk/reward scanner...');
    try {
      const tickers = await this.tickersService.getAllTickers();
      const BATCH_SIZE = 15;
      const MAX_BATCHES = 3; // Process 3 batches per run (45 tickers max)

      const totalBatches = Math.min(
        Math.ceil(tickers.length / BATCH_SIZE),
        MAX_BATCHES,
      );

      this.logger.log(
        `Processing ${totalBatches} batches of ${BATCH_SIZE} tickers (${totalBatches * BATCH_SIZE} max)`,
      );

      let totalProcessed = 0;
      let totalSkipped = 0;
      const interval14Days = 14 * 24 * 60 * 60 * 1000;

      for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
        const startIdx = batchNum * BATCH_SIZE;
        const batch = tickers.slice(startIdx, startIdx + BATCH_SIZE);

        this.logger.log(
          `Processing batch ${batchNum + 1}/${totalBatches} (tickers ${startIdx}-${startIdx + batch.length - 1})`,
        );

        let batchProcessed = 0;
        let batchSkipped = 0;

        for (const ticker of batch) {
          if (!ticker.symbol) continue;
          const symbol = ticker.symbol;

          try {
            const existingAnalysis =
              await this.riskRewardService.getLatestScore(symbol);

            const isStale =
              !existingAnalysis ||
              Date.now() - existingAnalysis.created_at.getTime() >
                interval14Days;

            if (!isStale) {
              batchSkipped++;
              continue;
            }

            this.logger.log(`Queueing Low-Tier Scan for ${symbol}...`);

            const note = await this.researchService.createResearchTicket(
              null,
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
              'low',
            );

            await this.researchService.processTicket(note.id);
            batchProcessed++;
          } catch (err) {
            this.logger.error(`Scanner failed for ${symbol}: ${err.message}`);
          }
        }

        totalProcessed += batchProcessed;
        totalSkipped += batchSkipped;

        this.logger.log(
          `Batch ${batchNum + 1} complete. Processed: ${batchProcessed}, Skipped: ${batchSkipped}`,
        );
      }

      this.logger.log(
        `All batches complete. Total Processed: ${totalProcessed}, Total Skipped: ${totalSkipped}`,
      );
      return {
        processed: totalProcessed,
        skipped: totalSkipped,
        batches: totalBatches,
      };
    } catch (e) {
      this.logger.error('Risk/Reward Scanner failed globally', e);
      throw e;
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
  private async runDailyDigestCron() {
    if (!this.isDevMode) return; // Production uses GitHub Actions
    await this.runDailyDigest();
  }

  async runDailyDigest() {
    this.logger.log('Starting News Digest Generation...');
    // For cron, we might want to generate for ALL users? Or just a system global one?
    // The current requirement was "personalized per user".
    // If this cron is meant to pre-warm cache, it can't pre-warm for everyone easily.
    // Maybe it pre-warms the "Market Opportunities" fallback (userId=system)?
    const status = await this.marketStatusService.getAllMarketsStatus();
    if (!status.us.isOpen && !status.eu.isOpen) {
      this.logger.log('Markets closed. Skipping Daily Digest generation.');
      return;
    }

    // Using NIL UUID to prevent database "invalid input syntax for type uuid" error
    const SYSTEM_UUID = '00000000-0000-0000-0000-000000000000';
    await this.researchService.getOrGenerateDailyDigest(SYSTEM_UUID);
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
  private async processPendingRequestsCron() {
    if (!this.isDevMode) return; // Production uses GitHub Actions
    await this.processPendingRequests();
  }

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

  /**
   * Daily job to backfill currency on portfolio positions from their ticker's native currency.
   * This auto-heals positions that were created before currency tracking was added.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  private async backfillPositionCurrenciesCron() {
    if (!this.isDevMode) return;
    await this.backfillPositionCurrencies();
  }

  async backfillPositionCurrencies() {
    this.logger.log('Starting portfolio position currency backfill...');
    try {
      const result = await this.portfolioService.backfillPositionCurrencies();
      this.logger.log(
        `Currency backfill complete. Updated: ${result.updated}, Skipped: ${result.skipped}`,
      );
      return result;
    } catch (e) {
      this.logger.error('Currency backfill failed', e);
      throw e;
    }
  }
}

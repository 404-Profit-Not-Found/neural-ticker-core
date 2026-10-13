import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RiskRewardService } from '../risk-reward/risk-reward.service';
import {
  TickerCreationCapException,
  TickersService,
} from '../tickers/tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { MarketStatusService } from '../market-data/market-status.service';
import { ResearchService } from '../research/research.service';
import { StockTwitsService } from '../stocktwits/stocktwits.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { LlmBudgetService } from '../llm/llm-budget.service';
import {
  RequestQueue,
  RequestStatus,
  RequestType,
} from './entities/request-queue.entity'; // Added
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, LessThanOrEqual } from 'typeorm';
import { runWithActor } from '../../common/request-actor/request-actor';
import { inProcessJobsEnabled } from '../../common/background-jobs';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  // In-app crons only run in development - GitHub Actions handles production crons
  // (and not at all with BACKGROUND_JOBS=off — see inProcessJobsEnabled).
  private get isDevMode(): boolean {
    return inProcessJobsEnabled();
  }

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
    private readonly configService: ConfigService,
    private readonly llmBudgetService: LlmBudgetService,
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

  /** Symbols whose initialisation is running in this process. */
  private readonly initializing = new Set<string>();

  /**
   * Performs an exhaustive initial sync for a new ticker:
   * 1. Snapshot (Price + Fundamentals)
   * 2. History (180 days for charts)
   * 3. Initial AI Research (Risk/Reward)
   *
   * Runs at most once per ticker: a second call for a symbol that is already
   * being initialised here returns immediately, and the research step claims
   * the ticker in the database (see runInitialResearch).
   */
  async initializeTicker(symbol: string) {
    const sym = symbol.toUpperCase();
    if (this.initializing.has(sym)) {
      this.logger.log(`Ticker ${sym} is already being initialized; skipping.`);
      return;
    }
    this.initializing.add(sym);

    this.logger.log(`Initializing new ticker: ${sym}`);
    try {
      // 1. Snapshot
      await this.marketDataService.getSnapshot(sym);

      // 2. History
      // 2. History (5 years)
      await this.marketDataService.syncTickerHistory(sym, 5);

      // 3. Initial research (budget-gated, free-only, once per ticker)
      await this.runInitialResearch(sym);

      this.logger.log(`Initialization complete for ${sym}`);
    } catch (err: any) {
      this.logger.error(`Failed to initialize ticker ${sym}: ${err.message}`);
    } finally {
      this.initializing.delete(sym);
    }
  }

  /**
   * The automatic research for a newly created ticker. It is background work
   * nobody paid for, so it obeys the same rules as the scanner:
   *
   *  - it needs free LLM budget; with none left it is skipped cleanly (no
   *    ticket is created) and the scanner — which takes never-researched
   *    tickers first — does it once the budget is back;
   *  - it is free-only: neither the research call nor the enrichment calls
   *    after it may fall through to the billed secondary key;
   *  - it runs once: the ticket is claimed under the scanner's advisory lock,
   *    so a second instance, a retry, or a scanner run that picked the same
   *    new ticker sees the first claim and does nothing.
   */
  private async runInitialResearch(symbol: string): Promise<void> {
    const perTicket = JobsService.RISK_SCANNER_CALLS_PER_TICKET;
    if (!(await this.llmBudgetService.hasBudget(perTicket))) {
      this.logger.warn(
        `Daily free LLM budget exhausted. Skipping initial research for ${symbol}; the scanner will pick it up.`,
      );
      return;
    }

    const noteId = await this.requestQueueRepo.manager.transaction(
      async (mgr) => {
        await mgr.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [JobsService.RISK_SCANNER_LOCK],
        );
        const researched =
          await this.researchService.getLastResearchedAtBySymbol([symbol]);
        if (researched.has(symbol)) return null;

        const note = await this.researchService.createResearchTicket(
          null, // System
          [symbol],
          `Perform initial analysis for ${symbol}. Provide company profile, financials, and risk/reward assessment.`,
          'gemini',
          'low',
        );
        return note.id;
      },
    );
    if (!noteId) {
      this.logger.log(
        `Ticker ${symbol} already has system research; skipping the initial run.`,
      );
      return;
    }

    this.logger.log(`Running initial research for ${symbol}...`);
    await this.researchService.processTicket(noteId, { freeOnly: true });
  }

  @Cron(CronExpression.EVERY_HOUR)
  private async syncDailyCandlesCron() {
    if (!this.isDevMode) return; // Production uses GitHub Actions (hourly)
    await this.syncDailyCandles();
  }

  /**
   * Batch size for the hourly candle sync. Sized so a single run finishes well
   * inside the Cloud Run 5-min request timeout. The hourly cron rotates through
   * all tickers across multiple runs via DB-driven staleness (oldest 1d candle
   * first), so full universe coverage is reached over the course of the day.
   */
  static readonly DAILY_CANDLES_BATCH_SIZE = 20;

  /**
   * Syncs daily (1d) candles for a small, stale-first batch of tickers.
   *
   * Runs hourly: each run picks the N tickers whose latest 1d candle is oldest
   * (or missing), refreshes their snapshot and backfills history. Keeping the
   * batch small means a single run stays far under the Cloud Run request budget
   * (the previous full-universe sync exceeded the 5-min timeout → 504), while
   * stale-first ordering rotates coverage across the whole universe over a day.
   */
  async syncDailyCandles() {
    this.logger.log('Starting hourly stale-first candle sync...');
    try {
      const allTickers = await this.tickersService.getAllTickers();
      const candidates = allTickers.filter(
        (t): t is typeof t & { symbol: string } => !!t.symbol,
      );

      const batchSize = JobsService.DAILY_CANDLES_BATCH_SIZE;
      const staleSymbols =
        await this.marketDataService.pickStaleSnapshotTickers(
          candidates.map((t) => t.symbol),
          batchSize,
        );

      this.logger.log(
        `Candle sync batch (${staleSymbols.length}/${candidates.length}, stale-first): ${staleSymbols.join(', ')}`,
      );

      let processed = 0;
      let failed = 0;

      for (const symbol of staleSymbols) {
        try {
          await this.marketDataService.getSnapshot(symbol);
          await this.marketDataService.syncTickerHistory(symbol, 5);
          processed++;
        } catch (err: any) {
          failed++;
          this.logger.error(`Failed ${symbol}: ${err.message}`);
        }
      }

      this.logger.log(
        `Candle sync complete. Processed: ${processed}, Failed: ${failed}, Batch: ${staleSymbols.length}`,
      );
      return { processed, failed, batchSize: staleSymbols.length };
    } catch (e) {
      this.logger.error('Candle sync failed globally', e);
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
   * Batch size for the snapshot sync — sized so a single cron run finishes
   * well inside the Cloud Run 5-min request timeout. The every-5-min cron
   * rotates through all tickers across multiple runs via DB-driven staleness.
   */
  static readonly SNAPSHOTS_BATCH_SIZE = 25;

  /**
   * Light sync - fetches a batch of the most-stale price snapshots.
   * Much faster than syncDailyCandles since it skips history.
   * Syncs tickers only when their respective market is open.
   */
  async syncSnapshots(force = false) {
    // Check if any market is active (pre/regular/post) unless forced via HTTP call.
    // Allow pre-market and post-market sessions to capture opening/closing prices.
    if (!force) {
      const status = await this.marketStatusService.getAllMarketsStatus();
      const allClosed =
        status.us.session === 'closed' && status.eu.session === 'closed';

      if (allClosed) {
        this.logger.log('All markets are closed. Skipping snapshot sync.');
        return {
          success: 0,
          failed: 0,
          skipped: true,
          reason: 'All markets closed',
        };
      }
    }

    this.logger.log('Starting light snapshot sync batch (prices only)...');
    try {
      const allTickers = await this.tickersService.getAllTickers();
      const candidates = allTickers.filter(
        (t): t is typeof t & { symbol: string } => !!t.symbol,
      );
      this.logger.log(`Found ${candidates.length} candidate tickers.`);

      // Pick the N most-stale tickers (oldest MAX(ohlcv.ts) first, NULLs first).
      const batchSize = JobsService.SNAPSHOTS_BATCH_SIZE;
      const staleSymbols =
        await this.marketDataService.pickStaleSnapshotTickers(
          candidates.map((t) => t.symbol),
          batchSize,
        );
      const exchangeBySymbol = new Map(
        candidates.map((t) => [t.symbol, (t as any).exchange || 'US']),
      );

      this.logger.log(
        `Batch tickers (${staleSymbols.length}/${candidates.length}): ${staleSymbols.join(', ')}`,
      );

      let success = 0;
      let failed = 0;
      let skippedMarketClosed = 0;

      for (const symbol of staleSymbols) {
        // Check if this ticker's market is open
        const exchange = exchangeBySymbol.get(symbol) || 'US';
        const status = await this.marketStatusService.getMarketStatus(
          symbol,
          exchange,
        );

        if (!force && status.session === 'closed') {
          skippedMarketClosed++;
          continue;
        }

        try {
          // getSnapshot already uses Finnhub with Yahoo fallback internally
          await this.marketDataService.getSnapshot(symbol);
          success++;
        } catch (err: any) {
          failed++;
          this.logger.warn(`Snapshot failed for ${symbol}: ${err.message}`);
        }
        // Shorter delay since it's just snapshots (500ms)
        await new Promise((r) => setTimeout(r, 500));
      }

      this.logger.log(
        `Snapshot batch complete. Success: ${success}, Failed: ${failed}, Skipped (market closed): ${skippedMarketClosed}, Batch size: ${staleSymbols.length}`,
      );
      return {
        success,
        failed,
        skipped: false,
        batchSize: staleSymbols.length,
        skippedMarketClosed,
      };
    } catch (e) {
      this.logger.error('Snapshot sync failed globally', e);
      throw e;
    }
  }
  @Cron(CronExpression.EVERY_HOUR)
  private async runRiskRewardScannerCron() {
    if (!this.isDevMode) return; // Production uses GitHub Actions
    await this.runRiskRewardScanner();
  }

  /**
   * Max tickers queued per scanner run. Deliberately tiny so each hourly run
   * stays light and gentle on the LLM rate limits — no big batch all at once.
   * The stale-first rotation spreads coverage over time (≈3/run × 24 runs/day
   * comfortably rotates the universe within the staleness window), and the
   * daily LLM budget is the hard ceiling on total work.
   */
  static readonly RISK_SCANNER_BATCH_SIZE = 3;

  /**
   * Approx. free-tier flash-lite calls one research ticket consumes (the main
   * cron-tier research call + the financial-extraction call). Used to size the
   * batch against the remaining daily budget so a run never starts work it
   * can't finish on the free key.
   */
  static readonly RISK_SCANNER_CALLS_PER_TICKET = 2;

  /**
   * Advisory-lock key under which system research for a ticker is claimed —
   * by the scanner for its batch and by the initial research of a new ticker,
   * so the two can never research the same ticker at the same time.
   */
  static readonly RISK_SCANNER_LOCK = 'risk-reward-scanner';

  /**
   * The scan runs inside the HTTP request that triggers it (see the controller
   * for why), so it must finish within the Cloud Run request timeout (300s).
   * No new ticket is started once a run has used this much of it; a ticket
   * takes roughly a minute, which leaves the last one room to finish.
   */
  static readonly RISK_SCANNER_TIME_BUDGET_MS = 200_000;

  /**
   * How long the scanner waits before re-researching a ticker whose last
   * research did NOT leave it with a fresh risk analysis (none at all, or only
   * a stale one). Much shorter than the staleness window so a failed extraction
   * self-heals within a day instead of hiding behind the weekly throttle, yet
   * long enough that a ticker whose extraction keeps failing costs at most one
   * retry per day — never the ~10x/day loop the note-based throttle was added
   * to stop.
   */
  static readonly RISK_SCANNER_RETRY_HOURS = 24;

  /**
   * Pure selection for the universe scanner: from `candidates`, return up to
   * `limit` tickers that are "due" for (re)research — never-researched first,
   * then oldest first. A ticker is due when it has no recorded research/analysis
   * at all, or its most recent one is older than `maxAgeMs`.
   *
   * Keyed entirely on the internal ticker `id`, so a ticker that was researched
   * within the window is never re-queued, regardless of how its symbol is
   * spelled. This is the gate that stops the same company being researched
   * ~10x/day instead of once per staleness window.
   *
   * `selfHeal` (audit H4) adds one exception to "researched within the window
   * is not due": a research note only proves we TRIED. If the ticker still has
   * no risk analysis newer than `maxAgeMs` — the enrichment that writes it is
   * best-effort and swallows its errors — the attempt did not produce what the
   * overview shows, so the ticker becomes due again once that attempt is older
   * than `retryAfterMs`. Ordering is unchanged (oldest attempt first), so
   * retries only fill capacity left over by tickers that are plainly stale and
   * can never starve them.
   */
  static selectDueTickers(
    candidates: { id: string; symbol: string }[],
    lastResearchedAtById: Map<string, number>,
    now: number,
    maxAgeMs: number,
    limit: number,
    selfHeal?: {
      lastAnalysisAtById: Map<string, number>;
      retryAfterMs: number;
    },
  ): { id: string; symbol: string }[] {
    if (candidates.length === 0 || limit <= 0) return [];

    const due = candidates.filter((c) => {
      const ts = lastResearchedAtById.get(c.id);
      if (ts === undefined || now - ts > maxAgeMs) return true; // never researched or stale
      if (!selfHeal) return false;

      const analysisTs = selfHeal.lastAnalysisAtById.get(c.id);
      const hasFreshAnalysis =
        analysisTs !== undefined && now - analysisTs <= maxAgeMs;
      return !hasFreshAnalysis && now - ts > selfHeal.retryAfterMs;
    });

    return due
      .sort((a, b) => {
        const aTs = lastResearchedAtById.get(a.id);
        const bTs = lastResearchedAtById.get(b.id);
        if (aTs === undefined && bTs === undefined)
          return a.symbol.localeCompare(b.symbol);
        if (aTs === undefined) return -1; // never researched → highest priority
        if (bTs === undefined) return 1;
        return aTs - bTs; // oldest first
      })
      .slice(0, limit);
  }

  /** The cron-tier research question the scanner asks for one ticker. */
  private static scannerQuestion(symbol: string): string {
    return `Analyze the risk/reward profile for ${symbol} based on recent price action (OHLCV) and key fundamentals.

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
      `;
  }

  async runRiskRewardScanner() {
    const maxAgeHours =
      this.configService.get<number>('riskReward.maxAgeHours') || 168;
    const stalenessMs = maxAgeHours * 60 * 60 * 1000;
    const perTicket = JobsService.RISK_SCANNER_CALLS_PER_TICKET;
    const startedAt = Date.now();

    this.logger.log(
      `Starting risk/reward scanner (cron tier, staleness: ${maxAgeHours}h)...`,
    );
    try {
      // Hard daily budget gate: protect the free flash-lite quota and never
      // let cron research escalate to the billed key.
      const remaining = await this.llmBudgetService.getRemaining();
      if (remaining < perTicket) {
        this.logger.warn(
          `Daily free LLM budget exhausted (remaining: ${remaining}). Skipping scan.`,
        );
        return { processed: 0, errors: 0, due: 0, budgetExhausted: true };
      }

      const allTickers = await this.tickersService.getAllTickers();
      // Carry the internal ticker id alongside the symbol: the staleness gate
      // matches on id, never on the symbol string (symbols drift for
      // suffixed/foreign tickers like FRVIA.PA and silently broke the old gate).
      const candidates = allTickers
        .filter((t) => !!t.symbol && t.id != null)
        .map((t) => ({ id: String(t.id), symbol: t.symbol as string }));

      // Size this run to the smaller of the fixed batch and what the remaining
      // budget can afford.
      const budgetCap = Math.floor(remaining / perTicket);
      const limit = Math.min(JobsService.RISK_SCANNER_BATCH_SIZE, budgetCap);

      const DELAY_MS = 4500; // ~13 RPM, safely under the 15 RPM free limit
      let processed = 0;
      let errors = 0;

      // Claim this run's batch under a transaction-scoped advisory lock (audit
      // H9). Overlapping runs — a manual dispatch landing on the hourly
      // schedule, or two instances — used to read the throttle before either
      // had written a note, pick the same tickers and research them twice.
      // Selection and the PENDING ticket inserts now happen while the lock is
      // held: a second run blocks here, then sees the first run's tickets as
      // fresh attempts and skips them. The lock covers only these reads and
      // inserts (milliseconds) and is released at commit, so the slow LLM work
      // below runs unlocked.
      const { dueSymbols, claimed } =
        await this.requestQueueRepo.manager.transaction(async (mgr) => {
          await mgr.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [JobsService.RISK_SCANNER_LOCK],
          );

          // Build one id-keyed "last researched" signal from two sources, taking the
          // most recent of each:
          //   - research_notes: the authoritative throttle. A note row exists for
          //     every scan from the moment it starts, so it reliably reflects "we
          //     researched this ticker" even when the downstream risk-analysis write
          //     (a best-effort, error-swallowing enrichment) never lands.
          //   - risk_analyses: keeps a ticker that already has a fresh score from
          //     being re-scanned.
          // Gating on risk_analyses alone is what let the same ticker be queued on
          // every run (its analysis row was never written) and researched ~10x/day
          // instead of once per staleness window.
          const tickerIds = candidates.map((c) => c.id);
          const symbols = candidates.map((c) => c.symbol);
          const [lastAnalysisById, lastResearchBySymbol] = await Promise.all([
            this.riskRewardService.getLastAnalysisAtByTickerId(tickerIds),
            this.researchService.getLastResearchedAtBySymbol(symbols),
          ]);

          const lastResearchedAtById = new Map<string, number>();
          for (const c of candidates) {
            const latest = Math.max(
              lastAnalysisById.get(c.id) ?? 0,
              lastResearchBySymbol.get(c.symbol) ?? 0,
            );
            if (latest > 0) lastResearchedAtById.set(c.id, latest);
          }

          // Stale-first rotation (never-researched first, then oldest). Coverage
          // advances every run; a freshly-researched ticker is excluded until its
          // research is older than the staleness window — unless that research left
          // it without a fresh analysis, in which case it is retried after the
          // (much shorter) retry window so the gap self-heals.
          const retryAfterMs = Math.min(
            JobsService.RISK_SCANNER_RETRY_HOURS * 60 * 60 * 1000,
            stalenessMs,
          );
          const due = JobsService.selectDueTickers(
            candidates,
            lastResearchedAtById,
            Date.now(),
            stalenessMs,
            limit,
            { lastAnalysisAtById: lastAnalysisById, retryAfterMs },
          ).map((c) => c.symbol);

          this.logger.log(
            `Scanner batch (${due.length} due / ${candidates.length} total, budget remaining: ${remaining}): ${due.join(', ')}`,
          );

          const tickets: { symbol: string; noteId: string }[] = [];
          for (const symbol of due) {
            try {
              const note = await this.researchService.createResearchTicket(
                null,
                [symbol],
                JobsService.scannerQuestion(symbol),
                'gemini',
                'cron',
              );
              tickets.push({ symbol, noteId: note.id });
            } catch (err) {
              errors++;
              this.logger.error(
                `Scanner failed to queue ${symbol}: ${err.message}`,
              );
            }
          }
          return { dueSymbols: due, claimed: tickets };
        });

      for (let i = 0; i < claimed.length; i++) {
        const { symbol, noteId } = claimed[i];

        // Stop before starting a ticket this run can't afford: either the free
        // LLM pool drained (it is shared with other jobs and interactive users)
        // or the run is close to the HTTP request timeout it must finish inside.
        const stopReason = !(await this.llmBudgetService.hasBudget(perTicket))
          ? 'Daily free LLM budget reached before this scan could run.'
          : Date.now() - startedAt > JobsService.RISK_SCANNER_TIME_BUDGET_MS
            ? 'Scanner run reached its time budget before this scan could run.'
            : null;
        if (stopReason) {
          this.logger.warn(`Stopping scan early: ${stopReason}`);
          // Release the tickets this run claimed but will not process, so they
          // don't sit PENDING. As failed attempts they are retried after the
          // retry window.
          for (const leftover of claimed.slice(i)) {
            await this.researchService
              .failPendingTicket(leftover.noteId, stopReason)
              .catch((err) =>
                this.logger.error(
                  `Failed to release scanner ticket for ${leftover.symbol}: ${err.message}`,
                ),
              );
          }
          break;
        }

        try {
          this.logger.log(`Running Cron-Tier Scan for ${symbol}...`);
          await this.researchService.processTicket(noteId);
          processed++;

          // Rate limit: 15 RPM on free tier = ~4.5s between calls
          await new Promise((r) => setTimeout(r, DELAY_MS));
        } catch (err) {
          errors++;
          this.logger.error(`Scanner failed for ${symbol}: ${err.message}`);
        }
      }

      this.logger.log(
        `Scan complete. Processed: ${processed}, Errors: ${errors}, Due this run: ${dueSymbols.length}`,
      );
      return { processed, errors, due: dueSymbols.length };
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
  // Runs once per day at 06:00 (pre-market). Dev only — production uses GitHub Actions.
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
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

  /** A PROCESSING row older than this is a crashed worker, not a live one. */
  static readonly REQUEST_PROCESSING_STALE_MS = 30 * 60 * 1000;

  /**
   * Queues a background request. ADD_TICKER is idempotent per symbol: while a
   * request for the symbol is open (PENDING, or PROCESSING and not stale) the
   * existing row is returned instead of a second one — every caller that hits
   * the same provider rate limit used to add its own row, each retried up to
   * ten times. The check and the insert share an advisory lock keyed by the
   * symbol, so two instances cannot both insert.
   */
  async queueRequest(type: RequestType, payload: any) {
    if (type !== RequestType.ADD_TICKER || !payload?.symbol) {
      const request = this.requestQueueRepo.create({
        type,
        payload,
        status: RequestStatus.PENDING,
        attempts: 0,
      });
      return this.requestQueueRepo.save(request);
    }

    const symbol = String(payload.symbol).toUpperCase();
    return this.requestQueueRepo.manager.transaction(async (mgr) => {
      await mgr.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `add-ticker:${symbol}`,
      ]);

      const open = await mgr
        .createQueryBuilder(RequestQueue, 'q')
        .where('q.type = :type', { type })
        .andWhere(`q.payload ->> 'symbol' = :symbol`, { symbol })
        .andWhere(
          '(q.status = :pending OR (q.status = :processing AND q.updated_at > :fresh))',
          {
            pending: RequestStatus.PENDING,
            processing: RequestStatus.PROCESSING,
            fresh: new Date(
              Date.now() - JobsService.REQUEST_PROCESSING_STALE_MS,
            ),
          },
        )
        .orderBy('q.created_at', 'ASC')
        .getOne();
      if (open) return open;

      return mgr.save(
        mgr.create(RequestQueue, {
          type,
          payload: { ...payload, symbol },
          status: RequestStatus.PENDING,
          attempts: 0,
        }),
      );
    });
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
      // Claim it: PENDING -> PROCESSING in one statement, so a second worker
      // (overlapping cron run, another instance) that read the same row does
      // not process it too.
      const claim = await this.requestQueueRepo.update(
        { id: req.id, status: RequestStatus.PENDING },
        { status: RequestStatus.PROCESSING },
      );
      if (!claim.affected) continue;

      try {
        if (req.type === RequestType.ADD_TICKER) {
          const { symbol, requested_by: requestedBy } = req.payload;
          this.logger.log(`Processing queued ticker addition: ${symbol}`);
          // Force ensure ticker (will fail again if 429, but that's handled locally here)
          // A request queued for a (non-admin) user is created on their
          // behalf, so it still counts against their daily cap.
          await runWithActor(
            requestedBy ? { userId: String(requestedBy), role: 'user' } : null,
            () => this.tickersService.ensureTicker(symbol),
          );
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
        // The requester's daily cap on new tickers is not a transient error:
        // retrying only repeats the refusal.
        const capReached = err instanceof TickerCreationCapException;
        // Max 10 attempts
        if (capReached || attempts >= 10) {
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

  // --- PENDING PORTFOLIO ORDERS (market-hours trading) ---

  @Cron(CronExpression.EVERY_MINUTE)
  private async fillPendingOrdersCron() {
    if (!this.isDevMode) return; // Production uses GitHub Actions
    await this.fillPendingOrders();
  }

  /**
   * Fill due pending buy/sell orders (orders placed while the market was closed).
   * Runs every minute in dev; in production the market-hours scheduler hits the
   * HTTP endpoint. PortfolioService.fillDuePendingOrders is concurrency-safe, so
   * overlapping triggers can't double-fill.
   */
  async fillPendingOrders() {
    this.logger.debug('Filling due pending portfolio orders...');
    try {
      const result = await this.portfolioService.fillDuePendingOrders();
      if (result.filled || result.failed) {
        this.logger.log(
          `Pending orders processed. Filled: ${result.filled}, Failed: ${result.failed}, Skipped: ${result.skipped}`,
        );
      }
      return result;
    } catch (e) {
      this.logger.error('Pending order fill failed', e);
      throw e;
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

  // --- RESEARCH RETENTION CLEANUP (90 days) ---

  /** Research notes older than this are purged. */
  static readonly RESEARCH_RETENTION_DAYS = 90;

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  private async cleanupOldResearchCron() {
    if (!this.isDevMode) return;
    await this.cleanupOldResearch();
  }

  async cleanupOldResearch() {
    const retentionDays = JobsService.RESEARCH_RETENTION_DAYS;
    this.logger.log(
      `Starting old research cleanup (>${retentionDays} days)...`,
    );
    try {
      const deleted =
        await this.researchService.deleteOldResearch(retentionDays);
      // Purging notes can leave risk analyses pointing at deleted notes —
      // sweep those orphans after the notes are gone.
      const orphansDeleted =
        await this.riskRewardService.deleteOrphanedAnalyses();
      this.logger.log(
        `Research cleanup complete. Notes deleted: ${deleted}, orphaned analyses deleted: ${orphansDeleted}`,
      );
      return { deleted, orphansDeleted };
    } catch (e) {
      this.logger.error('Research cleanup failed', e);
      throw e;
    }
  }
}

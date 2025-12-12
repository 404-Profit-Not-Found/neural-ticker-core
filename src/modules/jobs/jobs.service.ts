import { Injectable, Logger } from '@nestjs/common';

import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { TickersService } from '../tickers/tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { ResearchService } from '../research/research.service'; // Added

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly riskRewardService: RiskRewardService,
    private readonly tickersService: TickersService,
    private readonly marketDataService: MarketDataService,
    private readonly researchService: ResearchService,
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

  async syncDailyCandles() {
    this.logger.log('Starting daily candle sync...');
    try {
      const tickers = await this.tickersService.getAllTickers();
      this.logger.log(`Found ${tickers.length} tickers to sync.`);

      for (const ticker of tickers) {
        if (!ticker.symbol) continue;
        try {
          // write-through cache: fetches from Finnhub if stale/missing and saves to DB
          await this.marketDataService.getSnapshot(ticker.symbol);
          this.logger.debug(`Synced ${ticker.symbol}`);
        } catch (err) {
          this.logger.error(`Failed to sync ${ticker.symbol}: ${err.message}`);
        }
        // Optional: rate limit sleep here if needed
      }
      this.logger.log('Daily candle sync completed.');
    } catch (e) {
      this.logger.error('Daily candle sync failed globally', e);
    }
  }

  async runRiskRewardScanner() {
    this.logger.log('Starting Periodic Risk/Reward Scanner (Low Tier)...');
    try {
      const tickers = await this.tickersService.getAllTickers();
      this.logger.log(`Found ${tickers.length} tickers to scan.`);

      let processed = 0;
      let skipped = 0;
      const hours48 = 48 * 60 * 60 * 1000;

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
          
          const existingAnalysis = await this.riskRewardService.getLatestScore(symbol);
          
          const isStale =
            !existingAnalysis ||
            Date.now() - existingAnalysis.created_at.getTime() > hours48;

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
}

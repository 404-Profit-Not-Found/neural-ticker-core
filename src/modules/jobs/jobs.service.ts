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

  runRiskRewardScanner() {
    this.logger.log(
      'Risk/Reward Scanner is disabled per configuration (Deep Research only).',
    );
    // Logic removed to prevent low-tier score generation.
  }
}

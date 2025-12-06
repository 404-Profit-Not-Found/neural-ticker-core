import { Injectable, Logger } from '@nestjs/common';

import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { TickersService } from '../tickers/tickers.service';
import { MarketDataService } from '../market-data/market-data.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly riskRewardService: RiskRewardService,
    private readonly tickersService: TickersService,
    private readonly marketDataService: MarketDataService,
  ) {}


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
    this.logger.log('Starting Risk/Reward Scanner...');
    try {
      const tickers = await this.tickersService.getAllTickers();
      this.logger.log(`Found ${tickers.length} tickers to scan.`);

      for (const ticker of tickers) {
        if (!ticker.symbol) continue;
        try {
          // Generate new score using AI
          await this.riskRewardService.evaluateSymbol(ticker.symbol);
          this.logger.debug(`Scanned ${ticker.symbol}`);
        } catch (err) {
          this.logger.error(`Failed to scan ${ticker.symbol}: ${err.message}`);
        }
      }
      this.logger.log('Risk/Reward Scanner completed.');
    } catch (e) {
      this.logger.error('Risk/Reward Scanner failed globally', e);
    }
  }
}

import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { TickersModule } from '../tickers/tickers.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { RiskRewardModule } from '../risk-reward/risk-reward.module';
import { ResearchModule } from '../research/research.module';

@Module({
  imports: [
    FinnhubModule,
    TickersModule,
    MarketDataModule,
    RiskRewardModule,
    ResearchModule,
  ],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}

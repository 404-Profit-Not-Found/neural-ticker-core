import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsService } from './jobs.service';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { SymbolsModule } from '../symbols/symbols.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { RiskRewardModule } from '../risk-reward/risk-reward.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    FinnhubModule,
    SymbolsModule,
    MarketDataModule,
    RiskRewardModule,
  ],
  providers: [JobsService],
})
export class JobsModule {}

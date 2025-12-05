import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskRewardController } from './risk-reward.controller';
import { RiskRewardService } from './risk-reward.service';
import { RiskRewardScore } from './entities/risk-reward-score.entity';
import { ResearchModule } from '../research/research.module';
// MarketData and Symbols needed? Service uses them logic:
// evaluateSymbol logic needs them.
import { MarketDataModule } from '../market-data/market-data.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RiskRewardScore]),
    ResearchModule,
    MarketDataModule,
    LlmModule,
  ],
  controllers: [RiskRewardController],
  providers: [RiskRewardService],
  exports: [RiskRewardService],
})
export class RiskRewardModule {}

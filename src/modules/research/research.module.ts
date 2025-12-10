import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { ResearchNote } from './entities/research-note.entity';
import { LlmModule } from '../llm/llm.module';
import { TickersModule } from '../tickers/tickers.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { UsersModule } from '../users/users.module';
import { RiskRewardModule } from '../risk-reward/risk-reward.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResearchNote]),
    LlmModule,
    forwardRef(() => TickersModule),
    MarketDataModule,
    UsersModule,
    forwardRef(() => RiskRewardModule),
  ],
  controllers: [ResearchController],
  providers: [ResearchService],
  exports: [ResearchService],
})
export class ResearchModule {}

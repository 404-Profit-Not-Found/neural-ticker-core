import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { ResearchNote } from './entities/research-note.entity';
import { LlmModule } from '../llm/llm.module';
import { TickersModule } from '../tickers/tickers.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { UsersModule } from '../users/users.module';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { RiskRewardModule } from '../risk-reward/risk-reward.module';

import { NotificationsModule } from '../notifications/notifications.module';

import { QualityScoringService } from './quality-scoring.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResearchNote]),
    LlmModule,
    forwardRef(() => TickersModule),
    forwardRef(() => MarketDataModule),
    UsersModule,
    forwardRef(() => RiskRewardModule),
    forwardRef(() => WatchlistModule),
    NotificationsModule,
  ],
  controllers: [ResearchController],
  providers: [ResearchService, QualityScoringService],
  exports: [ResearchService, QualityScoringService],
})
export class ResearchModule {}

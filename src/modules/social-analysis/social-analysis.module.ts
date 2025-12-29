import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialAnalysisService } from './social-analysis.service';
import { SocialAnalysisController } from './social-analysis.controller';
import { StockTwitsAnalysis } from '../stocktwits/entities/stocktwits-analysis.entity';
import { StockTwitsModule } from '../stocktwits/stocktwits.module';
import { LlmModule } from '../llm/llm.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { EventsModule } from '../events/events.module';
import { TickersModule } from '../tickers/tickers.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockTwitsAnalysis]),
    StockTwitsModule,
    LlmModule,
    MarketDataModule,
    EventsModule,
    forwardRef(() => TickersModule),
    UsersModule,
  ],
  controllers: [SocialAnalysisController],
  providers: [SocialAnalysisService],
  exports: [SocialAnalysisService],
})
export class SocialAnalysisModule {}

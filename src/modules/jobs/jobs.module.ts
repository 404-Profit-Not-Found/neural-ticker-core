import { Module, forwardRef } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestQueue } from './entities/request-queue.entity';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { TickersModule } from '../tickers/tickers.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { RiskRewardModule } from '../risk-reward/risk-reward.module';
import { ResearchModule } from '../research/research.module';
import { StockTwitsModule } from '../stocktwits/stocktwits.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    FinnhubModule,
    MarketDataModule,
    RiskRewardModule,
    ResearchModule,
    StockTwitsModule,
    LlmModule,
    TypeOrmModule.forFeature([RequestQueue]),
    forwardRef(() => TickersModule),
    forwardRef(() => PortfolioModule),
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}

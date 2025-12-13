import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketDataController } from './market-data.controller';
import { MarketDataBulkController } from './market-data-bulk.controller';
import { StatsController } from './stats.controller';
import { MarketDataService } from './market-data.service';
import { PriceOhlcv } from './entities/price-ohlcv.entity';
import { Fundamentals } from './entities/fundamentals.entity';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { TickersModule } from '../tickers/tickers.module';

import { AnalystRating } from './entities/analyst-rating.entity';

import { RiskAnalysis } from '../risk-reward/entities/risk-analysis.entity';
import { ResearchNote } from '../research/entities/research-note.entity';
import { Comment } from '../social/entities/comment.entity';
import { NewsController } from './news.controller';
import { CompanyNews } from './entities/company-news.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PriceOhlcv,
      Fundamentals,
      AnalystRating,
      RiskAnalysis,
      RiskAnalysis,
      ResearchNote,
      Comment,
      CompanyNews,
    ]),
    FinnhubModule,
    forwardRef(() => TickersModule),
  ],
  controllers: [
    MarketDataController,
    MarketDataBulkController,
    NewsController,
    StatsController,
  ],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}

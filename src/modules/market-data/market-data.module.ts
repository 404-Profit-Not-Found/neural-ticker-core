import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketDataController } from './market-data.controller';
import { MarketStatusController } from './market-status.controller';
import { MarketDataBulkController } from './market-data-bulk.controller';
import { StatsController } from './stats.controller';
import { MarketDataService } from './market-data.service';
import { MarketStatusService } from './market-status.service';
import { PriceOhlcv } from './entities/price-ohlcv.entity';
import { Fundamentals } from './entities/fundamentals.entity';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { TickersModule } from '../tickers/tickers.module';
import { YahooFinanceModule } from '../yahoo-finance/yahoo-finance.module';
import { PortfolioModule } from '../portfolio/portfolio.module';

import { AnalystRating } from './entities/analyst-rating.entity';

import { RiskAnalysis } from '../risk-reward/entities/risk-analysis.entity';
import { ResearchNote } from '../research/entities/research-note.entity';
import { Comment } from '../social/entities/comment.entity';
import { NewsController } from './news.controller';
import { CompanyNews } from './entities/company-news.entity';
import { TickerEntity } from '../tickers/entities/ticker.entity';

import { ResearchModule } from '../research/research.module';

@Module({
  imports: [
    forwardRef(() => ResearchModule),
    TypeOrmModule.forFeature([
      PriceOhlcv,
      Fundamentals,
      AnalystRating,
      RiskAnalysis,
      RiskAnalysis,
      ResearchNote,
      Comment,
      CompanyNews,
      TickerEntity,
    ]),
    FinnhubModule,
    forwardRef(() => TickersModule),
    YahooFinanceModule,
    forwardRef(() => PortfolioModule),
  ],
  controllers: [
    MarketDataController,
    MarketStatusController,
    MarketDataBulkController,
    NewsController,
    StatsController,
  ],
  providers: [MarketDataService, MarketStatusService],
  exports: [MarketDataService, MarketStatusService],
})
export class MarketDataModule {}

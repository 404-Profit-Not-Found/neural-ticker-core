import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TickersService } from './tickers.service';
import { TickersController } from './tickers.controller';
import { TickerDetailController } from './ticker-detail.controller';
import { TickerEntity } from './entities/ticker.entity';
import { TickerLogoEntity } from './entities/ticker-logo.entity';
import { TickerRequestEntity } from '../ticker-requests/entities/ticker-request.entity'; // Added
import { PriceOhlcv } from '../market-data/entities/price-ohlcv.entity';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { HttpModule } from '@nestjs/axios';
import { MarketDataModule } from '../market-data/market-data.module';
import { RiskRewardModule } from '../risk-reward/risk-reward.module';
import { ResearchModule } from '../research/research.module';
import { YahooFinanceModule } from '../yahoo-finance/yahoo-finance.module';
import { JobsModule } from '../jobs/jobs.module'; // Added

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TickerEntity,
      TickerLogoEntity,
      PriceOhlcv,
      TickerRequestEntity, // Added
    ]),
    FinnhubModule,
    HttpModule,
    forwardRef(() => MarketDataModule),
    forwardRef(() => RiskRewardModule),
    forwardRef(() => ResearchModule),
    YahooFinanceModule,
    forwardRef(() => JobsModule), // Added
  ],
  controllers: [TickersController, TickerDetailController],
  providers: [TickersService],
  exports: [TickersService],
})
export class TickersModule {}

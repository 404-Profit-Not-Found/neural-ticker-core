import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketDataController } from './market-data.controller';
import { MarketDataBulkController } from './market-data-bulk.controller';
import { MarketDataService } from './market-data.service';
import { PriceOhlcv } from './entities/price-ohlcv.entity';
import { Fundamentals } from './entities/fundamentals.entity';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { TickersModule } from '../tickers/tickers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PriceOhlcv, Fundamentals]),
    FinnhubModule,
    forwardRef(() => TickersModule),
  ],
  controllers: [MarketDataController, MarketDataBulkController],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}

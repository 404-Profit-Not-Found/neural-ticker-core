import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { PriceOhlcv } from './entities/price-ohlcv.entity';
import { Fundamentals } from './entities/fundamentals.entity';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { TickersModule } from '../tickers/tickers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PriceOhlcv, Fundamentals]),
    FinnhubModule,
    TickersModule,
  ],
  controllers: [MarketDataController],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}

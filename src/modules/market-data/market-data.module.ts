import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { PriceOhlcv } from './entities/price-ohlcv.entity';
import { Fundamentals } from './entities/fundamentals.entity';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { SymbolsModule } from '../symbols/symbols.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PriceOhlcv, Fundamentals]),
    FinnhubModule,
    SymbolsModule,
  ],
  controllers: [MarketDataController],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}

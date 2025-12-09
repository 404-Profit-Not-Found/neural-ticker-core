import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TickersService } from './tickers.service';
import { TickersController } from './tickers.controller';
import { TickerEntity } from './entities/ticker.entity';
import { TickerLogoEntity } from './entities/ticker-logo.entity';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    TypeOrmModule.forFeature([TickerEntity, TickerLogoEntity]),
    FinnhubModule,
    HttpModule,
  ],
  controllers: [TickersController],
  providers: [TickersService],
  exports: [TickersService],
})
export class TickersModule {}

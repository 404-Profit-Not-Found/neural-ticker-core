import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TickersService } from './tickers.service';
import { TickersController } from './tickers.controller';
import { TickerEntity } from './entities/ticker.entity';
import { FinnhubModule } from '../finnhub/finnhub.module';

@Module({
  imports: [TypeOrmModule.forFeature([TickerEntity]), FinnhubModule],
  controllers: [TickersController],
  providers: [TickersService],
  exports: [TickersService],
})
export class TickersModule {}

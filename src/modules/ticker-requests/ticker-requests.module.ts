import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TickerRequestEntity } from './entities/ticker-request.entity';
import { TickerRequestsService } from './ticker-requests.service';
import { TickerRequestsController } from './ticker-requests.controller';
import { TickersModule } from '../tickers/tickers.module';

@Module({
  imports: [TypeOrmModule.forFeature([TickerRequestEntity]), TickersModule],
  controllers: [TickerRequestsController],
  providers: [TickerRequestsService],
  exports: [TickerRequestsService],
})
export class TickerRequestsModule {}

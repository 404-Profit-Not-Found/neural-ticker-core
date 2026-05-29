import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TickerRequestEntity } from './entities/ticker-request.entity';
import { TickerRequestsService } from './ticker-requests.service';
import { TickerRequestsController } from './ticker-requests.controller';
import { TickersModule } from '../tickers/tickers.module';
import { WebPushModule } from '../web-push/web-push.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TickerRequestEntity]),
    TickersModule,
    WebPushModule,
  ],
  controllers: [TickerRequestsController],
  providers: [TickerRequestsService],
  exports: [TickerRequestsService],
})
export class TickerRequestsModule {}

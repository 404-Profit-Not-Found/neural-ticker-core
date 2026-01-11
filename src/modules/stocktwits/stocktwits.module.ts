import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockTwitsService } from './stocktwits.service';
import { StockTwitsController } from './stocktwits.controller';
import { StockTwitsPost } from './entities/stocktwits-post.entity';
import { StockTwitsWatcher } from './entities/stocktwits-watcher.entity';
import { TickersModule } from '../tickers/tickers.module';
import { JobsModule } from '../jobs/jobs.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([StockTwitsPost, StockTwitsWatcher]),
    TickersModule,
    forwardRef(() => JobsModule),
  ],
  controllers: [StockTwitsController],
  providers: [StockTwitsService],
  exports: [StockTwitsService],
})
export class StockTwitsModule {}

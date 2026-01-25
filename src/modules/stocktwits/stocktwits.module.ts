import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockTwitsService } from './stocktwits.service';
import { StockTwitsController } from './stocktwits.controller';
import { StockTwitsPost } from './entities/stocktwits-post.entity';
import { StockTwitsWatcher } from './entities/stocktwits-watcher.entity';
import { StocktwitsAnalysis } from './entities/stocktwits-analysis.entity';
import { EventCalendar } from './entities/event-calendar.entity';
import { TickersModule } from '../tickers/tickers.module';
import { LlmModule } from '../llm/llm.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      StockTwitsPost,
      StockTwitsWatcher,
      StocktwitsAnalysis,
      EventCalendar,
    ]),
    forwardRef(() => TickersModule),
    LlmModule,
    UsersModule,
  ],
  controllers: [StockTwitsController],
  providers: [StockTwitsService],
  exports: [StockTwitsService],
})
export class StockTwitsModule {}

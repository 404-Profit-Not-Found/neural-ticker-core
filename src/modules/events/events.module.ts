import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventCalendar } from './entities/event-calendar.entity';
import { EventCalendarService } from './event-calendar.service';
import { TickersModule } from '../tickers/tickers.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventCalendar]),
    forwardRef(() => TickersModule),
    LlmModule,
  ],
  providers: [EventCalendarService],
  exports: [EventCalendarService],
})
export class EventsModule {}

import { Module } from '@nestjs/common';
import { YahooFinanceService } from './yahoo-finance.service';

@Module({
  providers: [YahooFinanceService],
  exports: [YahooFinanceService],
})
export class YahooFinanceModule {}

import { Module, forwardRef } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { CurrencyController } from './currency.controller';
import { TickersModule } from '../tickers/tickers.module';

@Module({
  imports: [forwardRef(() => TickersModule)],
  controllers: [CurrencyController],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}

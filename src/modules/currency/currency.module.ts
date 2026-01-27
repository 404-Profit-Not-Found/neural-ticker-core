import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyService } from './currency.service';
import { CurrencyController } from './currency.controller';
import { TickersModule } from '../tickers/tickers.module';
import { ExchangeRateEntity } from './entities/exchange-rate.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExchangeRateEntity]),
    forwardRef(() => TickersModule)
  ],
  controllers: [CurrencyController],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}

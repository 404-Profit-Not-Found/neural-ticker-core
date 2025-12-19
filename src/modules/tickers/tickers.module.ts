import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TickersService } from './tickers.service';
import { TickersController } from './tickers.controller';
import { TickerDetailController } from './ticker-detail.controller';
import { TickerEntity } from './entities/ticker.entity';
import { TickerLogoEntity } from './entities/ticker-logo.entity';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { HttpModule } from '@nestjs/axios';
import { MarketDataModule } from '../market-data/market-data.module';
import { RiskRewardModule } from '../risk-reward/risk-reward.module';
import { ResearchModule } from '../research/research.module';
import { YahooFinanceModule } from '../yahoo-finance/yahoo-finance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TickerEntity, TickerLogoEntity]),
    FinnhubModule,
    HttpModule,
    forwardRef(() => MarketDataModule),
    forwardRef(() => RiskRewardModule),
    forwardRef(() => ResearchModule),
    YahooFinanceModule,
  ],
  controllers: [TickersController, TickerDetailController],
  providers: [TickersService],
  exports: [TickersService],
})
export class TickersModule {}

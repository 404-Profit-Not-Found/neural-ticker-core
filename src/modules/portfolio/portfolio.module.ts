import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioService } from './portfolio.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioPosition } from './entities/portfolio-position.entity';
import { PortfolioAnalysis } from './entities/portfolio-analysis.entity';
import { MarketDataModule } from '../market-data/market-data.module';
import { LlmModule } from '../llm/llm.module';
import { TickersModule } from '../tickers/tickers.module';
import { UsersModule } from '../users/users.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PortfolioPosition, PortfolioAnalysis]),
    forwardRef(() => MarketDataModule),
    LlmModule,
    forwardRef(() => TickersModule),
    forwardRef(() => UsersModule),
    CurrencyModule,
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}


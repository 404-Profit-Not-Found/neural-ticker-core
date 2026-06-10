import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WatchlistService } from './watchlist.service';
import { WatchlistController } from './watchlist.controller';
import { Watchlist } from './entities/watchlist.entity';
import { WatchlistItem } from './entities/watchlist-item.entity';
import { TickersModule } from '../tickers/tickers.module';
import { QuotaModule } from '../../common/quota/quota.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Watchlist, WatchlistItem]),
    forwardRef(() => TickersModule),
    QuotaModule,
  ],
  controllers: [WatchlistController],
  providers: [WatchlistService],
  exports: [WatchlistService],
})
export class WatchlistModule {}

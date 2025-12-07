import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Watchlist } from './entities/watchlist.entity';
import { WatchlistItem } from './entities/watchlist-item.entity';
import { TickersService } from '../tickers/tickers.service';

@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(Watchlist)
    private readonly watchlistRepo: Repository<Watchlist>,
    @InjectRepository(WatchlistItem)
    private readonly itemRepo: Repository<WatchlistItem>,
    private readonly tickersService: TickersService,
  ) {}

  async createWatchlist(userId: string, name: string): Promise<Watchlist> {
    const list = this.watchlistRepo.create({
      user_id: userId,
      name,
    });
    return this.watchlistRepo.save(list);
  }

  async getUserWatchlists(userId: string): Promise<Watchlist[]> {
    return this.watchlistRepo.find({
      where: { user_id: userId },
      relations: ['items', 'items.ticker'],
      order: { created_at: 'DESC' },
    });
  }

  async addTickerToWatchlist(
    userId: string,
    watchlistId: string,
    symbol: string,
  ): Promise<WatchlistItem> {
    // 1. Verify owner
    const watchlist = await this.watchlistRepo.findOne({
      where: { id: watchlistId, user_id: userId },
    });
    if (!watchlist) {
      throw new NotFoundException('Watchlist not found or access denied');
    }

    // 2. Ensure Ticker exists
    const ticker = await this.tickersService.awaitEnsureTicker(symbol);

    // 3. Create Item (Check duplicate?)
    // Allowing duplicates for now, or could use upsert logic
    const item = this.itemRepo.create({
      watchlist_id: watchlistId,
      ticker_id: ticker.id,
    });

    return this.itemRepo.save(item);
  }

  async removeItemFromWatchlist(
    userId: string,
    watchlistId: string,
    tickerId: string, // Pass item ID or Ticker ID? Let's assume Ticker ID for ease, or Item ID. 
    // Usually easier to delete by Item ID if the UI has it. 
    // But UI might just say "Delete AAPL".
    // Let's implement delete by TickerID within Watchlist context.
  ): Promise<void> {
     // 1. Verify owner
     const watchlist = await this.watchlistRepo.findOne({
      where: { id: watchlistId, user_id: userId },
    });
    if (!watchlist) {
      throw new NotFoundException('Watchlist not found or access denied');
    }

    // 2. Delete
    await this.itemRepo.delete({
      watchlist_id: watchlistId,
      ticker_id: tickerId,
    });
  }

  // Helper delete by ItemId if needed
  async removeHighLevelItem(userId: string, itemId: string): Promise<void> {
    // Complex check: item -> watchlist -> user_id == userId
    const item = await this.itemRepo.findOne({
      where: { id: itemId },
      relations: ['watchlist'],
    });

    if (!item || item.watchlist.user_id !== userId) {
        throw new NotFoundException('Item not found or access denied');
    }
    
    await this.itemRepo.remove(item);
  }
}

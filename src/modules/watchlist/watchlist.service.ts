import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
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
    @Inject(forwardRef(() => TickersService))
    private readonly tickersService: TickersService,
  ) {}

  async createWatchlist(userId: string, name: string): Promise<Watchlist> {
    // Check if exists (Idempotency) - allow same name? Or strict unique names per user?
    // Let's bring back idempotency for same name, but allow multiple if name differs.
    const existing = await this.watchlistRepo.findOne({
      where: { user_id: userId, name },
    });
    if (existing) {
      // If name matches, return it to prevent duplicates of same name.
      // User can create new lists with DIFFERENT names.
      return existing;
    }

    const list = this.watchlistRepo.create({
      user_id: userId,
      name,
    });
    return this.watchlistRepo.save(list);
  }

  async getUserWatchlists(
    userId: string,
    isAdmin = false,
  ): Promise<Watchlist[]> {
    const watchlists = await this.watchlistRepo.find({
      where: { user_id: userId },
      relations: ['items', 'items.ticker'],
      order: { created_at: 'ASC' }, // ASC so oldest (Default) is first
    });

    if (!isAdmin) {
      // Filter out items where the ticker is hidden
      watchlists.forEach((list) => {
        list.items = list.items.filter((item) => !item.ticker.is_hidden);
      });
    }

    return watchlists;
  }

  async updateWatchlist(
    userId: string,
    watchlistId: string,
    name: string,
  ): Promise<Watchlist> {
    const watchlist = await this.watchlistRepo.findOne({
      where: { id: watchlistId, user_id: userId },
    });
    if (!watchlist) {
      throw new NotFoundException('Watchlist not found or access denied');
    }
    watchlist.name = name;
    return this.watchlistRepo.save(watchlist);
  }

  async addTickerToWatchlist(
    userId: string,
    watchlistId: string,
    symbol: string,
    isAdmin = false,
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

    // 2.5 Block hidden tickers for non-admins
    if (!isAdmin && ticker.is_hidden) {
      throw new NotFoundException(`Ticker ${symbol} not found`);
    }

    // 3. Check if ticker already in watchlist
    const existing = await this.itemRepo.findOne({
      where: { watchlist_id: watchlistId, ticker_id: ticker.id },
    });
    if (existing) {
      throw new ConflictException(`${symbol} is already in this watchlist`);
    }

    // 4. Create Item
    const item = this.itemRepo.create({
      watchlist_id: watchlistId,
      ticker_id: ticker.id,
    });

    return this.itemRepo.save(item);
  }

  async removeItemFromWatchlist(
    userId: string,
    watchlistId: string,
    itemId: string,
  ): Promise<void> {
    // 1. Verify owner
    const watchlist = await this.watchlistRepo.findOne({
      where: { id: watchlistId, user_id: userId },
    });
    if (!watchlist) {
      throw new NotFoundException('Watchlist not found or access denied');
    }

    // 2. Delete by Primary Key (id) and ensure it belongs to this watchlist
    const result = await this.itemRepo.delete({
      id: itemId,
      watchlist_id: watchlistId,
    });

    // Optional: Check if affected > 0? Not strictly necessary for void return but good for debugging.
    if (result.affected === 0) {
      // It implies item didn't exist or mismatch, but idempotent delete is often fine.
      // Check if we want to throw NotFound if ID provided but not found?
      // For now, silent success is standard for delete.
    }
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

  async deleteWatchlist(userId: string, watchlistId: string): Promise<void> {
    const watchlist = await this.watchlistRepo.findOne({
      where: { id: watchlistId, user_id: userId },
    });

    if (!watchlist) {
      throw new NotFoundException('Watchlist not found or access denied');
    }

    // Remove associated items first to avoid orphans in soft-delete scenarios
    await this.itemRepo.delete({ watchlist_id: watchlistId });
    await this.watchlistRepo.softRemove(watchlist);
  }

  async getAllWatchedTickers(limit: number = 20): Promise<string[]> {
    const result = await this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.ticker', 'ticker')
      .select('ticker.symbol', 'symbol')
      .addSelect('COUNT(item.id)', 'count')
      .groupBy('ticker.id')
      .addGroupBy('ticker.symbol')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany();

    return result.map((r) => r.symbol);
  }

  async toggleFavorite(
    userId: string,
    symbol: string,
    isAdmin = false,
  ): Promise<{ added: boolean; message: string }> {
    const FAV_NAME = 'Favourites';

    // 1. Ensure "Favourites" list exists
    let watchlist = await this.watchlistRepo.findOne({
      where: { user_id: userId, name: FAV_NAME },
    });

    if (!watchlist) {
      watchlist = await this.createWatchlist(userId, FAV_NAME);
    }

    // 2. Ensure Ticker Exists
    const ticker = await this.tickersService.awaitEnsureTicker(symbol);

    // 2.5 Block if hidden and not admin
    if (!isAdmin && ticker.is_hidden) {
      throw new NotFoundException(`Ticker ${symbol} not found`);
    }

    // 3. Check if exists in list
    const existingItem = await this.itemRepo.findOne({
      where: { watchlist_id: watchlist.id, ticker_id: ticker.id },
    });

    if (existingItem) {
      // Remove
      await this.itemRepo.remove(existingItem);
      return { added: false, message: `${symbol} removed from Favourites` };
    } else {
      // Add
      const newItem = this.itemRepo.create({
        watchlist_id: watchlist.id,
        ticker_id: ticker.id,
      });
      await this.itemRepo.save(newItem);
      return { added: true, message: `${symbol} added to Favourites` };
    }
  }
}

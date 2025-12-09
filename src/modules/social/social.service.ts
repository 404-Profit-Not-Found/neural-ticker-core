import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { WatchlistItem } from '../watchlist/entities/watchlist-item.entity';
import { TickerEntity } from '../tickers/entities/ticker.entity';

@Injectable()
export class SocialService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
    @InjectRepository(WatchlistItem)
    private readonly watchlistItemRepo: Repository<WatchlistItem>,
    @InjectRepository(TickerEntity)
    private readonly tickerRepo: Repository<TickerEntity>,
  ) {}

  async getComments(symbol: string, limit: number = 50) {
    return this.commentRepo.find({
      where: { ticker_symbol: symbol },
      order: { created_at: 'DESC' },
      take: limit,
      relations: ['user'], // To show who commented
    });
  }

  async postComment(userId: string, symbol: string, content: string) {
    const comment = this.commentRepo.create({
      user_id: userId,
      ticker_symbol: symbol,
      content,
    });
    return this.commentRepo.save(comment);
  }

  async getWatcherCount(symbol: string): Promise<number> {
      // Find ticker id first
      const ticker = await this.tickerRepo.findOne({ where: { symbol } });
      if (!ticker) return 0;

      return this.watchlistItemRepo.count({
          where: { ticker_id: ticker.id }
      });
  }
}

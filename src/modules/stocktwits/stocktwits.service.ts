import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StockTwitsPost } from './entities/stocktwits-post.entity';
import { StockTwitsWatcher } from './entities/stocktwits-watcher.entity';
import { TickersService } from '../tickers/tickers.service';

@Injectable()
export class StockTwitsService {
  private readonly logger = new Logger(StockTwitsService.name);
  private readonly BASE_URL = 'https://api.stocktwits.com/api/2/streams/symbol';

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(StockTwitsPost)
    private readonly postsRepository: Repository<StockTwitsPost>,
    @InjectRepository(StockTwitsWatcher)
    private readonly watchersRepository: Repository<StockTwitsWatcher>,
    private readonly tickersService: TickersService,
  ) {}

  /**
   * Fetch posts for a symbol and store them.
   * Skips existing posts to prevent overwrite.
   */
  async fetchAndStorePosts(symbol: string) {
    try {
      this.logger.log(`Fetching StockTwits posts for ${symbol}...`);
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.BASE_URL}/${symbol}.json`),
      );

      if (!data || !data.messages) {
        this.logger.warn(`No messages found for ${symbol}`);
        return;
      }

      const messages = data.messages;
      let newPostsCount = 0;

      for (const msg of messages) {
        const exists = await this.postsRepository.findOne({
          where: { id: msg.id },
        });
        if (!exists) {
          const post = this.postsRepository.create({
            id: msg.id,
            symbol: symbol,
            username: msg.user?.username || 'unknown',
            user_followers_count: msg.user?.followers || 0,
            body: msg.body,
            likes_count: msg.likes?.total || 0,
            created_at: new Date(msg.created_at),
          });
          await this.postsRepository.save(post);
          newPostsCount++;
        }
      }
      this.logger.log(`Stored ${newPostsCount} new posts for ${symbol}`);
    } catch (error) {
      this.logger.error(
        `Failed to fetch posts for ${symbol}: ${error.message}`,
      );
    }
  }

  /**
   * key metric: Watcher Count.
   * Stores a timestamped record of the current watcher count.
   */
  async trackWatchers(symbol: string) {
    try {
      this.logger.log(`Tracking watchers for ${symbol}...`);
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.BASE_URL}/${symbol}.json`),
      );

      if (data && data.symbol && data.symbol.watchlist_count !== undefined) {
        await this.watchersRepository.save({
          symbol: symbol,
          count: data.symbol.watchlist_count,
          timestamp: new Date(),
        });
        this.logger.log(
          `Recorded ${data.symbol.watchlist_count} watchers for ${symbol}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to track watchers for ${symbol}: ${error.message}`,
      );
    }
  }

  // --- Scanners / Cron Jobs ---

  /**
   * Hourly: Sync posts for all tickers
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyPostsSync() {
    this.logger.log('Starting Hourly StockTwits Post Sync...');
    const tickers = await this.tickersService.getAllTickers();
    for (const ticker of tickers) {
      if (ticker.symbol) {
        await this.fetchAndStorePosts(ticker.symbol);
      }
    }
    this.logger.log('Hourly Post Sync Complete.');
  }

  /**
   * Daily: Sync watcher counts for all tickers
   * Runs at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyWatchersSync() {
    this.logger.log('Starting Daily StockTwits Watcher Sync...');
    const tickers = await this.tickersService.getAllTickers();
    for (const ticker of tickers) {
      if (ticker.symbol) {
        await this.trackWatchers(ticker.symbol);
      }
    }
    this.logger.log('Daily Watcher Sync Complete.');
  }

  async getPosts(symbol: string) {
    return this.postsRepository.find({
      where: { symbol },
      order: { created_at: 'DESC' },
      take: 50,
    });
  }

  async getWatchersHistory(symbol: string) {
    return this.watchersRepository.find({
      where: { symbol },
      order: { timestamp: 'ASC' },
    });
  }
}

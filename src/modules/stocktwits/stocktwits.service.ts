import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { firstValueFrom } from 'rxjs';

import { StockTwitsPost } from './entities/stocktwits-post.entity';
import { StockTwitsWatcher } from './entities/stocktwits-watcher.entity';
import { StocktwitsAnalysis } from './entities/stocktwits-analysis.entity';
import { EventCalendar, EventCalendarEventType, EventCalendarSource } from './entities/event-calendar.entity';
import { TickersService } from '../tickers/tickers.service';
import { LlmService } from '../llm/llm.service';

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
    @InjectRepository(StocktwitsAnalysis)
    private readonly analysisRepository: Repository<StocktwitsAnalysis>,
    @InjectRepository(EventCalendar)
    private readonly calendarRepository: Repository<EventCalendar>,
    private readonly tickersService: TickersService,
    private readonly llmService: LlmService,
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

  async getPosts(symbol: string, page = 1, limit = 50) {
    const take = limit;
    const skip = (page - 1) * take;

    const [data, total] = await this.postsRepository.findAndCount({
      where: { symbol },
      order: { created_at: 'DESC' },
      take,
      skip,
    });

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async getWatchersHistory(symbol: string) {
    return this.watchersRepository.find({
      where: { symbol },
      order: { timestamp: 'ASC' },
    });
  }

  // --- AI Analysis ---

  async analyzeComments(symbol: string) {
    this.logger.log(`Starting AI analysis for ${symbol}...`);

    // 0. Sync latest posts first
    await this.fetchAndStorePosts(symbol);
    
    // 1. Fetch recent posts (last 7 days, max 50 to save context)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const posts = await this.postsRepository.find({
      where: { symbol, created_at: MoreThan(since) },
      order: { likes_count: 'DESC', created_at: 'DESC' },
      take: 50,
    });

    if (posts.length < 1) {
      this.logger.warn(`Not enough posts to analyze for ${symbol}`);
      return null;
    }

    const postsText = posts
      .map((p) => `[${p.username}, ${p.likes_count} likes]: ${p.body}`)
      .join('\n');

    // 2. Prompt LLM
    const prompt = `
    Analyze the following StockTwits comments for ticker $${symbol}.
    Focus on extracting:
    1. Main "Topics Discussed" (e.g. Earnings Hype, Buyout Rumors, Insider Selling, Technical Breakout).
    2. Sentiment Score (0-1, where 1 is Super Bullish).
    3. Events/Catalysts mentioned (with dates if available).
    
    Return JSON format:
    {
      "sentiment_score": 0.XX,
      "sentiment_label": "Bullish" | "Bearish" | "Neutral",
      "summary": "2-sentence summary of the conversation...",
      "highlights": {
        "topics": ["Topic 1", "Topic 2"],
        "bullish_points": ["..."],
        "bearish_points": ["..."]
      },
      "extracted_events": [
        {
          "title": "...",
          "date": "YYYY-MM-DD" (or null),
          "type": "earnings" | "product_launch" | "other",
          "confidence": 0.XX
        }
      ]
    }

    Comments:
    ${postsText}
    `;

    try {
      const result = await this.llmService.generateResearch({
        question: prompt,
        tickers: [symbol],
        numericContext: {},
        style: 'concise',
        provider: 'gemini',
        quality: 'medium',
      });
      
      const response = result.answerMarkdown;
      const totalTokens = (result.tokensIn || 0) + (result.tokensOut || 0);
      const modelName = result.models ? result.models.join(', ') : 'gemini';
      
      // Parse JSON (resiliently)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in LLM response');
      const data = JSON.parse(jsonMatch[0]);

      // 3. Save Analysis
      const ticker = await this.tickersService.findOneBySymbol(symbol);
      if (!ticker) throw new Error(`Ticker ${symbol} not found`);

      const analysis = this.analysisRepository.create({
        ticker_id: ticker.id,
        symbol: symbol,
        sentiment_score: data.sentiment_score,
        sentiment_label: data.sentiment_label,
        posts_analyzed: posts.length,
        weighted_sentiment_score: data.sentiment_score,
        summary: data.summary,
        model_used: modelName,
        tokens_used: totalTokens,
        analysis_start: posts[posts.length - 1].created_at,
        analysis_end: posts[0].created_at,
        highlights: data.highlights,
        extracted_events: data.extracted_events || [],
        created_at: new Date(),
      });

      await this.analysisRepository.save(analysis);

      // 4. Save Events
      if (data.extracted_events && Array.isArray(data.extracted_events)) {
        for (const event of data.extracted_events) {
          if (event.title && event.date) {
             const newEvent = this.calendarRepository.create({
               ticker_id: ticker.id,
               symbol: symbol,
               title: event.title,
               event_date: event.date,
               event_type: (event.type as EventCalendarEventType) || EventCalendarEventType.OTHER,
               source: EventCalendarSource.STOCKTWITS,
               confidence: event.confidence || 0.8,
               created_at: new Date(),
             });
             await this.calendarRepository.save(newEvent);
          }
        }
      }

      this.logger.log(`AI analysis completed for ${symbol}`);
      return analysis;

    } catch (e) {
      this.logger.error(`AI Analysis process failed for ${symbol}: ${e.message}`);
      throw e;
    }
  }

  async getLatestAnalysis(symbol: string) {
    return this.analysisRepository.findOne({
      where: { symbol },
      order: { created_at: 'DESC' },
    });
  }

  async getVolumeStats(symbol: string) {
    // Aggregate posts by day for the last 30 days
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // SQLite syntax for date grouping
    // For Postgres it would be TO_CHAR(created_at, 'YYYY-MM-DD')
    // We'll use a generic approach or raw query depending on DB
    // Assuming SQLite for MVP based on context, but let's try generic query builder first which might be safer
    
    const stats = await this.postsRepository
      .createQueryBuilder('post')
      .select("strftime('%Y-%m-%d', post.created_at)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('post.symbol = :symbol', { symbol })
      .andWhere('post.created_at > :since', { since })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    // Map to cleaner format
    return stats.map(s => ({
        date: s.date,
        count: Number(s.count) // ensure number
    }));
  }
}

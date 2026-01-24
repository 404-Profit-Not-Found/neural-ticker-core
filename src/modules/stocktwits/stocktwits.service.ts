import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { jsonToToon } from 'toon-parser';
import { execSync } from 'child_process';

import { StockTwitsPost } from './entities/stocktwits-post.entity';
import { StockTwitsWatcher } from './entities/stocktwits-watcher.entity';
import { StocktwitsAnalysis } from './entities/stocktwits-analysis.entity';
import { EventCalendar, EventCalendarEventType, EventCalendarSource } from './entities/event-calendar.entity';
import { TickersService } from '../tickers/tickers.service';
import { LlmService } from '../llm/llm.service';
import { StockTwitsToonDto } from './dto/stocktwits-toon.dto';
import { CreditService } from '../users/credit.service';

@Injectable()
export class StockTwitsService {
  private readonly logger = new Logger(StockTwitsService.name);
  private readonly BASE_URL = 'https://api.stocktwits.com/api/2/streams/symbol';
  
  // Lock to prevent concurrent syncs for the same symbol
  private syncLocks = new Map<string, Promise<void>>();

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
    @Inject(forwardRef(() => TickersService))
    private readonly tickersService: TickersService,
    private readonly llmService: LlmService,
    private readonly creditService: CreditService,
  ) {}

  /**
   * Fetch posts for a symbol and store them.
   * Skips existing posts to prevent overwrite.
   */
  async fetchAndStorePosts(symbol: string) {
    // If a sync is already running for this symbol, await it and return
    if (this.syncLocks.has(symbol)) {
      this.logger.log(`Sync already in progress for ${symbol}, awaiting...`);
      return this.syncLocks.get(symbol);
    }

    const syncPromise = (async () => {
      try {
        this.logger.log(`Fetching StockTwits posts for ${symbol}...`);
      
      let maxId: number | null = null;
      let pages = 0;
      const MAX_PAGES = 500; // Increased to ensure we get all posts for 30 days even for high-volume tickers
      const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let oldestDateFetched = new Date();

      while (pages < MAX_PAGES && oldestDateFetched > THIRTY_DAYS_AGO) {
        const url: string = `${this.BASE_URL}/${symbol}.json${maxId ? `?max=${maxId}` : ''}`;
        
        // Use curl for resilience against 403 blocks in specialized node environments
        let data: any;
        const curlCmd = `curl -s -i -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36" -H "Accept: application/json" "${url}"`;
        try {
          const output = execSync(curlCmd, { encoding: 'utf8' });
          
          // Check for 403 in headers
          if (output.includes('HTTP/1.1 403') || output.includes('HTTP/2 403')) {
            this.logger.error(`StockTwits returned 403 Forbidden for ${symbol} using curl. Command: ${curlCmd}`);
            this.logger.debug(`Response Header Snippet: ${output.substring(0, 200)}`);
            break;
          }

          // Strip headers to get JSON body
          const bodyStart = output.indexOf('\r\n\r\n');
          const body = bodyStart !== -1 ? output.substring(bodyStart + 4) : output;
          data = JSON.parse(body);
        } catch (e) {
          this.logger.error(`Curl fetch failed for ${symbol} page ${pages}: ${e.message}. Command: ${curlCmd}`);
          break;
        }

        if (!data || !data.messages || data.messages.length === 0) {
            this.logger.warn(`No messages found for ${symbol} (page ${pages})`);
            break;
        }

        const messages: any[] = data.messages;
        let newPostsCount = 0;

        for (const msg of messages) {
            const exists = await this.postsRepository.findOne({
            where: { id: msg.id },
            });
            if (!exists) {
              try {
                const post = this.postsRepository.create({
                    id: msg.id,
                    symbol: symbol,
                    username: msg.user?.username || 'unknown',
                    user_followers_count: msg.user?.followers || 0,
                    body: msg.body, // Logic: we save raw, cleaning happens in DTO for TOON
                    likes_count: msg.likes?.total || 0,
                    created_at: new Date(msg.created_at),
                });
                await this.postsRepository.save(post);
                newPostsCount++;
              } catch (saveError) {
                // Gracefully handle rare race conditions (e.g. unique constraint)
                // without crashing the whole sync loop.
                if (saveError.message.includes('unique constraint') || saveError.message.includes('duplicate key')) {
                    this.logger.warn(`Post ${msg.id} already inserted by another process. Skipping...`);
                } else {
                    throw saveError;
                }
              }
            }
        }
        
        // Prepare for next page
        const lastMsg: any = messages[messages.length - 1];
        maxId = lastMsg.id;
        oldestDateFetched = new Date(lastMsg.created_at);
        pages++;
        
        this.logger.log(`Page ${pages}: Stored ${newPostsCount} posts. Oldest: ${oldestDateFetched.toISOString()}`);
        
        // If we found many existing posts, we might be overlapping history.
        // We continue to ensures we fill gaps back to the target date (14 days ago).
        this.logger.log(`Page ${pages} processed.`);
      }
      
    } catch (error) {
      this.logger.error(
        `Failed to fetch posts for ${symbol}: ${error.message}`,
      );
    } finally {
        this.syncLocks.delete(symbol);
    }
    })();

    this.syncLocks.set(symbol, syncPromise);
    return syncPromise;
  }

  /**
   * key metric: Watcher Count.
   * Stores a timestamped record of the current watcher count.
   */
  async trackWatchers(symbol: string) {
    const curlCmd = `curl -s -i -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36" -H "Accept: application/json" "${this.BASE_URL}/${symbol}.json"`;
    try {
      this.logger.log(`Tracking watchers for ${symbol}...`);
      const output = execSync(curlCmd, { encoding: 'utf8' });
      
      if (output.includes('403 Forbidden')) {
          this.logger.error(`Watcher track hit 403 for ${symbol}. Cmd: ${curlCmd}`);
          return;
      }

      const bodyStart = output.indexOf('\r\n\r\n');
      const body = bodyStart !== -1 ? output.substring(bodyStart + 4) : output;
      const data = JSON.parse(body);

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
        `Failed to track watchers for ${symbol}: ${error.message}. Cmd: ${curlCmd}`,
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

  async analyzeComments(symbol: string, userId?: string, options: { model?: string, quality?: 'low' | 'medium' | 'high' | 'deep' } = {}) {
    this.logger.log(`Starting AI analysis for ${symbol}... (User: ${userId || 'System'}, Model: ${options.model || 'default'})`);

    // 0. Sync latest posts first
    await this.fetchAndStorePosts(symbol);
    
    // 1. Determine Window (Bridging the gap)
    const latestAnalysis = await this.getLatestAnalysis(symbol);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    let since = thirtyDaysAgo;
    let isIncremental = false;
    let previousContext = '';

    if (latestAnalysis && latestAnalysis.created_at > thirtyDaysAgo) {
      since = latestAnalysis.created_at;
      isIncremental = true;
      previousContext = latestAnalysis.summary;
      this.logger.log(`Performing incremental analysis for ${symbol} since ${since.toISOString()}`);
    } else {
      this.logger.log(`Performing full 30-day analysis for ${symbol}`);
    }

    const posts = await this.postsRepository.find({
      where: { symbol, created_at: MoreThan(since) },
      order: { likes_count: 'DESC', created_at: 'DESC' },
      take: 1000,
    });

    if (posts.length < 1 && isIncremental) {
      this.logger.log(`No new posts since last analysis for ${symbol}. Returning latest.`);
      return latestAnalysis;
    }

    if (posts.length < 1) {
      this.logger.warn(`Not enough posts to analyze for ${symbol}`);
      return null;
    }

    // --- Credit Deduction ---
    if (userId) {
        const cost = this.creditService.getModelCost(options.model || 'gemini-3-flash-preview');
        await this.creditService.deductCredits(userId, cost, 'social_analysis_spend', { symbol, model: options.model });
    }


    const postsData = posts.map((p) => new StockTwitsToonDto(p).toPlain());

    const postsToon = jsonToToon(postsData);
    this.logger.log(`TOON conversion (30d): ${postsToon.length} chars. Context depth: ${posts.length} posts.`);

    // 2. Prompt LLM
    const prompt = `
    Analyze the following StockTwits comments for ticker $${symbol}.
    ${isIncremental ? `CONVERSATION CONTEXT (from last analysis): "${previousContext}"` : ''}
    
    ${isIncremental 
      ? `INSTRUCTION: Incorporate the NEW comments below into the existing pulse. Update the sentiment, topics, and summary to reflect the current state (last 30 days total), but focus on what has changed or evolved since the previous summary.` 
      : 'Focus on extracting a comprehensive social pulse for the last 30 days.'
    }

    Focus on extracting:
    1. Main "Topics Discussed" (e.g. Earnings Hype, Buyout Rumors, Insider Selling, Technical Breakout).
    2. Sentiment Score (0-1, where 1 is Super Bullish).
    3. Events/Catalysts mentioned (with dates if available).
    
    Return JSON format:
    {
      "sentiment_score": 0.XX,
      "sentiment_label": "Bullish" | "Bearish" | "Neutral",
      "summary": "2-sentence summary of the CURRENT pulse (incorporating new info)...",
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

    ${isIncremental ? 'NEW Comments (since last analysis)' : 'Comments (last 30d)'} (TOON format):
    ${postsToon}
    `;

    try {
      const result = await this.llmService.generateResearch({
        question: prompt,
        tickers: [symbol],
        numericContext: {},
        style: 'concise',
        provider: (options.model?.includes('gpt') ? 'openai' : 'gemini') as 'gemini' | 'openai' | 'ensemble',
        quality: options.quality || 'medium',
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

      const analysis_start = posts.length > 0 ? posts[posts.length - 1].created_at : new Date();
      const analysis_end = posts.length > 0 ? posts[0].created_at : new Date();

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
        analysis_start,
        analysis_end,
        highlights: data.highlights,
        extracted_events: data.extracted_events || [],
        created_at: new Date(),
      });

      await this.analysisRepository.save(analysis);

      // 4. Save Events
      if (data.extracted_events && Array.isArray(data.extracted_events)) {
        const eventsToSave = [];
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
             eventsToSave.push(newEvent);
          }
        }
        if (eventsToSave.length > 0) {
            await this.calendarRepository.save(eventsToSave);
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

  async getAnalysisHistory(symbol: string) {
    return this.analysisRepository.find({
      where: { symbol },
      order: { created_at: 'DESC' },
      take: 20, // Keep it reasonable for now
    });
  }

  async getVolumeStats(symbol: string) {
    // Aggregate posts by day for the last 30 days
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Postgres syntax
    const stats = await this.postsRepository
      .createQueryBuilder('post')
      .select("TO_CHAR(post.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('post.symbol = :symbol', { symbol })
      .andWhere('post.created_at > :since', { since })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    // Calculate actual range from data found
    const startDateRaw = stats.length > 0 ? stats[0].date : since.toISOString().split('T')[0];
    const endDateRaw = stats.length > 0 ? stats[stats.length - 1].date : new Date().toISOString().split('T')[0];

    // Format to MM/DD/YYYY for UI
    const formatDate = (dStr: string) => {
        const [y, m, d] = dStr.split('-');
        return `${parseInt(m)}/${parseInt(d)}/${y}`;
    }

    return {
        symbol,
        startDate: formatDate(startDateRaw),
        endDate: formatDate(endDateRaw),
        stats: stats.map(s => ({
            date: s.date,
            count: Number(s.count)
        }))
    };
  }

  async getFutureEvents(symbol: string) {
    const today = new Date().toISOString().split('T')[0];
    return this.calendarRepository.find({
      where: { 
        symbol,
        event_date: MoreThan(today)
      },
      order: { event_date: 'ASC' },
      take: 10
    });
  }
}

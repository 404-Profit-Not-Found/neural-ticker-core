import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, MoreThanOrEqual } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { jsonToToon } from 'toon-parser';
import { execFileSync, execSync } from 'child_process';

import { StockTwitsPost } from './entities/stocktwits-post.entity';
import { StockTwitsWatcher } from './entities/stocktwits-watcher.entity';
import { StocktwitsAnalysis } from './entities/stocktwits-analysis.entity';
import {
  EventCalendar,
  EventCalendarEventType,
  EventCalendarSource,
} from './entities/event-calendar.entity';
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
  /**
   * Syncs posts from StockTwits API.
   * Uses `curl` to bypass Cloudflare and handles pagination.
   */
  async fetchAndStorePosts(symbol: string, maxPages: number = 10) {
    // Prevent overlapping syncs for same symbol
    if (this.syncLocks.has(symbol)) {
      this.logger.log(`Sync already in progress for ${symbol}, awaiting...`);
      return this.syncLocks.get(symbol);
    }

    const syncPromise = (async () => {
      try {
        this.logger.log(
          `Fetching StockTwits posts for ${symbol} (Limit: ${maxPages} pages)...`,
        );

        let maxId: number | null = null;
        let pages = 0;
        const MAX_PAGES = maxPages;
        const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
        let oldestDateFetched = new Date();

        while (pages < MAX_PAGES && oldestDateFetched > THIRTY_DAYS_AGO) {
          // Attempting max limit (API usually caps at 30, but we request 300 just in case)
          const url: string = `${this.BASE_URL}/${symbol}.json?limit=300${maxId ? `&max=${maxId}` : ''}`;

          let data: any;
          try {
            // Attempt 1: Fast path with Axios
            const response = await firstValueFrom(
              this.httpService.get(url, {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                  Accept: 'application/json',
                },
                timeout: 10000,
              }),
            );
            data = response.data;
          } catch (axiosError) {
            // Fallback: If Cloudflare blocks Axios, use curl (slower but bypasses WAF)
            if (
              axiosError.response?.status === 403 ||
              axiosError.code === 'ECONNABORTED'
            ) {
              this.logger.warn(
                `[${symbol}] Axios blocked with ${axiosError.response?.status || axiosError.code}. Falling back to curl...`,
              );

              const curlArgs = [
                '-s',
                '-i',
                '-A',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                '-H',
                'Accept: application/json',
                url,
              ];
              try {
                const output = execFileSync('curl', curlArgs, {
                  encoding: 'utf8',
                });

                // Check for 403 in headers
                if (
                  output.includes('HTTP/1.1 403') ||
                  output.includes('HTTP/2 403')
                ) {
                  this.logger.error(
                    `[${symbol}] curl also returned 403. Rate limit or permanent block.`,
                  );
                  break;
                }

                // Strip headers to get JSON body
                const bodyStart = output.indexOf('\r\n\r\n');
                const body =
                  bodyStart !== -1 ? output.substring(bodyStart + 4) : output;
                data = JSON.parse(body);
              } catch (curlError) {
                this.logger.error(
                  `[${symbol}] curl fallback failed: ${curlError.message}`,
                );
                break;
              }
            } else {
              this.logger.error(
                `[${symbol}] Fetch failed: ${axiosError.message}`,
              );
              break;
            }
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
                  // eslint-disable-next-line no-control-regex
                  body: (msg.body || '').replace(/\u0000/g, ''), // Sanitize null bytes to prevent Postgres error
                  likes_count: msg.likes?.total || 0,
                  created_at: new Date(msg.created_at),
                });
                await this.postsRepository.save(post);
                newPostsCount++;
              } catch (saveError) {
                // Gracefully handle rare race conditions (e.g. unique constraint)
                // without crashing the whole sync loop.
                if (
                  saveError.message.includes('unique constraint') ||
                  saveError.message.includes('duplicate key')
                ) {
                  this.logger.warn(
                    `Post ${msg.id} already inserted by another process. Skipping...`,
                  );
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

          this.logger.log(
            `[${symbol}] Page ${pages}: Stored ${newPostsCount} posts. Oldest: ${oldestDateFetched.toISOString()}`,
          );

          // Optimization: Stop if we've reached known history (all duplicate posts)
          if (newPostsCount === 0) {
            this.logger.log(
              `[${symbol}] Reached existing history at page ${pages}. Stopping sync.`,
            );
            break;
          }
          this.logger.log(`[${symbol}] Page ${pages} processed.`);
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
    const url = `${this.BASE_URL}/${symbol}.json`;
    let data: any;

    try {
      this.logger.log(`[${symbol}] Tracking watchers via Axios...`);
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
          timeout: 5000,
        }),
      );
      data = response.data;
    } catch (e) {
      if (e.response?.status === 403 || e.code === 'ECONNABORTED') {
        this.logger.warn(
          `[${symbol}] Watcher Axios blocked (403). Falling back to curl...`,
        );
        const curlCmd = `curl -s -i -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36" -H "Accept: application/json" "${url}"`;
        try {
          const output = execSync(curlCmd, { encoding: 'utf8' });
          const bodyStart = output.indexOf('\r\n\r\n');
          const body =
            bodyStart !== -1 ? output.substring(bodyStart + 4) : output;
          data = JSON.parse(body);
        } catch (curlError) {
          this.logger.error(
            `[${symbol}] Watcher curl fallback failed: ${curlError.message}`,
          );
          return;
        }
      } else {
        this.logger.error(`[${symbol}] Failed to track watchers: ${e.message}`);
        return;
      }
    }

    if (data && data.symbol && data.symbol.watchlist_count !== undefined) {
      await this.watchersRepository.save({
        symbol: symbol,
        count: data.symbol.watchlist_count,
        timestamp: new Date(),
      });
      this.logger.log(
        `[${symbol}] Recorded ${data.symbol.watchlist_count} watchers.`,
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
        await this.fetchAndStorePosts(ticker.symbol, 20); // Limit 20 pages for cron
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
    const history = await this.watchersRepository.find({
      where: { symbol },
      order: { timestamp: 'ASC' },
    });

    // JIT Sync: If no history or oldest data is from yesterday, trigger a refresh
    const lastRecord = history[history.length - 1];
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    if (!lastRecord || lastRecord.timestamp < sixHoursAgo) {
      this.logger.log(
        `[${symbol}] Watcher history stale or missing. Triggering JIT track...`,
      );
      // If empty, await so the first view has data. Otherwise background sync.
      if (history.length === 0) {
        await this.trackWatchers(symbol);
        return this.watchersRepository.find({
          where: { symbol },
          order: { timestamp: 'ASC' },
        });
      } else {
        void this.trackWatchers(symbol); // Background
      }
    }

    return history;
  }

  // --- AI Analysis ---

  async analyzeComments(
    symbol: string,
    userId?: string,
    options: {
      model?: string;
      quality?: 'low' | 'medium' | 'high' | 'deep';
    } = {},
  ) {
    this.logger.log(
      `Starting AI analysis for ${symbol}... (User: ${userId || 'System'}, Model: ${options.model || 'default'})`,
    );

    // 0. Sync latest posts first (Deep pulse: 50 pages max - approx 1500 posts to cover ~14 days)
    await this.fetchAndStorePosts(symbol, 50);

    // 1. Determine Window (Bridging the gap)
    const latestAnalysis = await this.getLatestAnalysis(symbol);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let since = thirtyDaysAgo;
    let isIncremental = false;
    let previousContext = '';

    if (latestAnalysis && latestAnalysis.created_at > thirtyDaysAgo) {
      // Heuristic: If last analysis was very shallow (e.g. < 5 posts), it might be a partial/incremental fragment.
      // Force a full re-read to ensure we get the big picture and correct the cumulative stats.
      this.logger.debug(
        `Checking shallow analysis: Count=${latestAnalysis.posts_analyzed} Type=${typeof latestAnalysis.posts_analyzed}`,
      );

      if ((latestAnalysis.posts_analyzed || 0) < 20) {
        this.logger.log(
          `Previous analysis for ${symbol} was shallow (${latestAnalysis.posts_analyzed} posts). Forcing full 30-day re-analysis.`,
        );
        // Leave 'since' as thirtyDaysAgo
        // Leave 'isIncremental' as false
      } else {
        since = latestAnalysis.created_at;
        isIncremental = true;
        previousContext = latestAnalysis.summary;
        this.logger.log(
          `Performing incremental analysis for ${symbol} since ${since.toISOString()}`,
        );
      }
    } else {
      this.logger.log(`Performing full 30-day analysis for ${symbol}`);
    }

    const posts = await this.postsRepository.find({
      where: { symbol, created_at: MoreThan(since) },
      order: { likes_count: 'DESC', created_at: 'DESC' },
      take: 150, // USER_RULE: LLM needs only 150 posts. Chart uses full DB history.
    });

    if (posts.length < 1 && isIncremental) {
      this.logger.log(
        `No new posts since last analysis for ${symbol}. Returning latest.`,
      );
      return latestAnalysis;
    }

    if (posts.length < 1) {
      this.logger.warn(`Not enough posts to analyze for ${symbol}`);
      return null;
    }

    // Move ticker fetch to top to provide better context to the LLM
    const ticker = await this.tickersService.findOneBySymbol(symbol);
    if (!ticker) throw new Error(`Ticker ${symbol} not found`);
    const companyName = ticker.name || symbol;

    // --- Credit Deduction ---
    if (userId) {
      const cost = this.creditService.getModelCost(
        options.model || 'gemini-3-flash-preview',
      );
      await this.creditService.deductCredits(
        userId,
        cost,
        'social_analysis_spend',
        { symbol, model: options.model },
      );
    }

    let data: any = null;
    let modelName = 'gemini';
    let totalTokens = 0;

    // Retry Strategy: If context is too large or model fails to output JSON, retry with reduced context
    const attempts = 2;
    for (let i = 0; i < attempts; i++) {
      // Attempt 0: Full batch (500). Attempt 1: Critical subset (50 highly engaging posts)
      const currentPosts = i === 0 ? posts : posts.slice(0, 50);

      if (i > 0) {
        this.logger.warn(
          `Retrying analysis with reduced context (${currentPosts.length} posts)...`,
        );
      }

      const postsData = currentPosts.map((p) =>
        new StockTwitsToonDto(p).toPlain(),
      );
      const postsToon = jsonToToon(postsData);
      this.logger.log(
        `TOON conversion (Attempt ${i + 1}): ${postsToon.length} chars.`,
      );

      // 2. Prompt LLM
      const prompt = `
        Analyze the following StockTwits comments for ${companyName} ($${symbol}).
        ${isIncremental ? `CONVERSATION CONTEXT (from last analysis): "${previousContext}"` : ''}
        
        ${
          isIncremental
            ? `INSTRUCTION: Incorporate the NEW comments below into the existing pulse. Update the sentiment, topics, and summary to reflect the current state (last 30 days total), but focus on what has changed or evolved since the previous summary.`
            : 'Focus on extracting a comprehensive social pulse for the last 30 days.'
        }

        THINKING STEP:
        1. Identify specific future events, catalysts, or dates mentioned in the comments.
        2. DEDUPLICATE: If multiple comments mention the same event (e.g., "CEO visit", "Earnings", or specific trips), combine them into a single, high-confidence entry. Do NOT output multiple entries for the same event. Use canonical names for events and individuals specific to ${companyName}.
        3. Be precise with dates: Return YYYY-MM-DD format ONLY. 
           - INVALID: "2026-01-XX", "Late Jan", "Next week".
           - VALID: "2026-01-31".
           - If a specific day is unknown but the month is known, use the 1st of that month (e.g. "2026-02-01" for "February").
           - If no date is mentioned, do NOT include it in "extracted_events".
        
        Focus on extracting:
        1. Main "Topics Discussed" (e.g. Earnings Hype, Buyout Rumors, Insider Selling, Technical Breakout).
        2. Sentiment Score (0-1, where 1 is Super Bullish).
        3. Events/Catalysts mentioned (with dates if available).
        
        Return JSON format:
        {
          "sentiment_score": 0.XX,
          "sentiment_label": "Bullish" | "Bearish" | "Neutral",
          "summary": "...",
          "highlights": {
            "topics": ["Topic 1", "Topic 2"],
            "bullish_points": ["..."],
            "bearish_points": ["..."]
          },
          "extracted_events": [
            {
              "title": "Clear Canonical Title",
              "date": "YYYY-MM-DD",
              "type": "earnings" | "product_launch" | "other",
              "impact_score": 1,
              "expected_impact": "Short summary of market effect",
              "confidence": 0.XX
            }
          ]
        }
        
        ${isIncremental ? 'NEW Comments (since last analysis)' : 'Comments (last 30d)'} (TOON format):
        ${postsToon}
        `;

      // Resolve Quality
      let quality: 'low' | 'medium' | 'high' | 'deep' =
        options.quality || 'medium';
      if (options.model) {
        if (options.model.includes('lite')) quality = 'low';
        else if (options.model.includes('pro')) quality = 'deep';
        else if (options.model.includes('flash')) quality = 'medium';
      }

      try {
        const result = await this.llmService.generateResearch({
          question: prompt,
          tickers: [symbol],
          numericContext: {},
          style: 'concise',
          provider: (options.model?.includes('gpt') ? 'openai' : 'gemini') as
            | 'gemini'
            | 'openai'
            | 'ensemble',
          quality: quality,
        });

        const response = result.answerMarkdown;
        totalTokens = (result.tokensIn || 0) + (result.tokensOut || 0);
        modelName = result.models ? result.models.join(', ') : 'gemini';

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[0]);
          break; // Success
        } else {
          if (i === attempts - 1) {
            this.logger.error(
              `Failed to parse JSON on last attempt. Raw: ${response.substring(0, 500)}...`,
            );
            throw new Error('No JSON found in LLM response');
          }
        }
      } catch (e) {
        if (i === attempts - 1) throw e;
        this.logger.warn(
          `Analysis failed (Attempt ${i + 1}): ${e.message}. Retrying...`,
        );
      }
    }

    // 3. Save Analysis
    // Determine metadata for the record
    let finalAnalysisStart =
      posts.length > 0 ? posts[posts.length - 1].created_at : new Date();
    let finalPostsCount = posts.length;

    if (isIncremental && latestAnalysis) {
      // Carry over the start date from the previous analysis to show full window
      finalAnalysisStart = latestAnalysis.analysis_start;
      // Accumulate post count
      finalPostsCount = (latestAnalysis.posts_analyzed || 0) + posts.length;
    }

    const analysis_end = posts.length > 0 ? posts[0].created_at : new Date();

    const analysis = this.analysisRepository.create({
      ticker_id: ticker.id,
      symbol: symbol,
      sentiment_score: data.sentiment_score,
      sentiment_label: data.sentiment_label,
      posts_analyzed: finalPostsCount,
      weighted_sentiment_score: data.sentiment_score,
      summary: data.summary,
      model_used: modelName,
      tokens_used: totalTokens, // This is just for this run, which is correct cost accounting
      analysis_start: finalAnalysisStart,
      analysis_end,
      highlights: data.highlights,
      extracted_events: data.extracted_events || [],
      created_at: new Date(),
    });

    await this.analysisRepository.save(analysis);

    // 4. Save Events (Deduplicated)
    if (data.extracted_events && Array.isArray(data.extracted_events)) {
      const eventsToSave = [];

      // Fetch existing future and recent events to prevent cross-analysis duplicates
      // We look 2 days back from today just in case an event was logged for today/yesterday
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const searchStartDate = twoDaysAgo.toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];

      // CLEANUP: Delete previous StockTwits-sourced future events for this symbol.
      // This prevents old "no-impact" duplicates from blocking the new high-intelligence run.
      await this.calendarRepository.delete({
        symbol,
        source: EventCalendarSource.STOCKTWITS,
        event_date: MoreThanOrEqual(todayStr),
      });

      const existingEvents = await this.calendarRepository.find({
        where: { symbol, event_date: MoreThanOrEqual(searchStartDate) },
      });

      // Helper to normalize and tokenize a title for similarity checking
      const getKeywords = (title: string) => {
        return title
          .toLowerCase()
          .replace(/[^\w\s]/g, '') // remove punctuation
          .split(/\s+/)
          .filter(
            (w) =>
              w.length >= 3 &&
              ![
                'the',
                'and',
                'for',
                'with',
                'visit',
                'tour',
                'meeting',
                'trip',
              ].includes(w),
          );
      };

      for (const event of data.extracted_events) {
        if (event.title && event.date) {
          const eventDate = new Date(event.date);
          if (isNaN(eventDate.getTime())) {
            this.logger.warn(
              `Invalid event date from LLM: ${event.date} for event "${event.title}". Skipping.`,
            );
            continue;
          }

          const dateStr = eventDate.toISOString().split('T')[0];

          // Backend Deduplication: Check if we already have a similar event within +/- 2 days
          // Social media noise often blurs dates for the same event.
          const eventKeywords = getKeywords(event.title);

          const isDuplicate = existingEvents.some((existing) => {
            const existingDate = new Date(existing.event_date);
            const diffDays = Math.abs(
              (eventDate.getTime() - existingDate.getTime()) /
                (1000 * 3600 * 24),
            );
            const isCloseDate = diffDays <= 2;

            if (!isCloseDate) return false;

            const existingKeywords = getKeywords(existing.title);

            // Calculate keyword intersection
            const intersection = eventKeywords.filter((k) =>
              existingKeywords.includes(k),
            );

            // If major keywords match (e.g. Jensen, Huang, China), it's a duplicate
            // Threshold: 60% of keywords match OR at least 3 keywords match
            const matchRatio =
              intersection.length / Math.max(eventKeywords.length, 1);
            const isDuplicateSimilar =
              matchRatio >= 0.6 || intersection.length >= 3;

            if (isDuplicateSimilar) {
              this.logger.debug(
                `Similarity Match Found: "${event.title}" <-> "${existing.title}" (Ratio: ${matchRatio.toFixed(2)}, Intersect: ${intersection.join(',')})`,
              );
            }

            return isCloseDate && isDuplicateSimilar;
          });

          if (isDuplicate) {
            this.logger.log(
              `Skipping duplicate event: "${event.title}" on ${dateStr} (Already exists nearby)`,
            );
            continue;
          }

          // Safe Integer Conversion & Scaling
          let finalImpactScore = 5; // Default
          if (event.impact_score !== undefined && event.impact_score !== null) {
            const rawScore = Number(event.impact_score);
            if (!isNaN(rawScore)) {
              // If LLM returned 0.9 instead of 9, scale it up
              finalImpactScore =
                rawScore <= 1
                  ? Math.round(rawScore * 10)
                  : Math.round(rawScore);
              // Clamp to 1-10
              finalImpactScore = Math.max(1, Math.min(10, finalImpactScore));
            }
          }

          const newEvent = this.calendarRepository.create({
            ticker_id: ticker.id,
            symbol: symbol,
            title: event.title,
            event_date: dateStr,
            event_type:
              (event.type as EventCalendarEventType) ||
              EventCalendarEventType.OTHER,
            source: EventCalendarSource.STOCKTWITS,
            confidence: event.confidence || 0.8,
            impact_score: finalImpactScore,
            expected_impact:
              event.expected_impact || 'Moderate volatility expected',
            created_at: new Date(),
          });
          eventsToSave.push(newEvent);

          // Add to our temporary list to prevent duplicates WITHIN the same batch if LLM failed
          existingEvents.push(newEvent as any);
        }
      }
      if (eventsToSave.length > 0) {
        await this.calendarRepository.save(eventsToSave);
      }
    }

    this.logger.log(`AI analysis completed for ${symbol}`);
    return analysis;
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

  async deleteAnalysis(id: string) {
    return this.analysisRepository.delete(id);
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



    // Fetch recent analyses to cross-reference topics
    const analyses = await this.analysisRepository.find({
      where: { symbol },
      order: { created_at: 'DESC' },
      take: 10,
    });

    // Calculate actual range from data found
    const startDateRaw =
      stats.length > 0 ? stats[0].date : since.toISOString().split('T')[0];
    const endDateRaw =
      stats.length > 0
        ? stats[stats.length - 1].date
        : new Date().toISOString().split('T')[0];

    // Format to MM/DD/YYYY for UI
    const formatDate = (dStr: string) => {
      const [y, m, d] = dStr.split('-');
      return `${parseInt(m)}/${parseInt(d)}/${y}`;
    };

    return {
      symbol,
      startDate: formatDate(startDateRaw),
      endDate: formatDate(endDateRaw),
      stats: stats.map((s) => {
        const dateStr = s.date; // YYYY-MM-DD
        const dateObj = new Date(dateStr);

        // Find relevant analysis
        // Logic: Analysis covers a range [start, end]. If this daily bar is inside that range, show its topics.
        // Simplified: Just check if date is within window.
        const relevantAnalysis = analyses.find((a) => {
          const start = new Date(a.analysis_start);
          const end = new Date(a.analysis_end);
          // Expand window slightly to catch same-day
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          return dateObj >= start && dateObj <= end;
        });

        return {
          date: s.date,
          count: Number(s.count),
          topics: relevantAnalysis?.highlights?.topics?.slice(0, 3) || [], // Top 3 topics
        };
      }),
    };
  }

  async getFutureEvents(symbol: string) {
    const today = new Date().toISOString().split('T')[0];
    return this.calendarRepository.find({
      where: {
        symbol,
        event_date: MoreThanOrEqual(today),
      },
      order: { event_date: 'ASC' },
      take: 10,
    });
  }
}

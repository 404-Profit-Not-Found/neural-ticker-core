import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockTwitsAnalysis } from '../stocktwits/entities/stocktwits-analysis.entity';
import { StockTwitsService } from '../stocktwits/stocktwits.service';
import { LlmService } from '../llm/llm.service';
import { MarketStatusService } from '../market-data/market-status.service';
import { EventCalendarService } from '../events/event-calendar.service';
import { TickersService } from '../tickers/tickers.service';
import { CreditService } from '../users/credit.service';

@Injectable()
export class SocialAnalysisService {
  private readonly logger = new Logger(SocialAnalysisService.name);
  private readonly SOCIAL_ANALYSIS_CREDIT_COST = 2;

  constructor(
    private readonly stockTwitsService: StockTwitsService,
    private readonly llmService: LlmService,
    private readonly marketStatusService: MarketStatusService,
    private readonly eventCalendarService: EventCalendarService,
    private readonly tickersService: TickersService,
    private readonly creditService: CreditService,
    @InjectRepository(StockTwitsAnalysis)
    private readonly analysisRepo: Repository<StockTwitsAnalysis>,
  ) {}

  /**
   * Main job: Pre-market analysis (called via API endpoint).
   * Runs 30 minutes before US market open (9:00 AM ET).
   */
  async runPreMarketAnalysis(): Promise<{
    success: boolean;
    processed: number;
    skipped: number;
    errors: number;
  }> {
    this.logger.log('Pre-market analysis job triggered');

    // Check if market is trading today
    const isTradingDay = await this.marketStatusService.isMarketTradingDay();
    if (!isTradingDay) {
      this.logger.log('Market is closed today (holiday). Skipping analysis.');
      return { success: true, processed: 0, skipped: 0, errors: 0 };
    }

    // Get only tickers with social analysis enabled
    const tickers = await this.tickersService.getTickersWithSocialAnalysis();

    if (tickers.length === 0) {
      this.logger.log('No tickers have social analysis enabled.');
      return { success: true, processed: 0, skipped: 0, errors: 0 };
    }

    this.logger.log(`Running analysis for ${tickers.length} tickers...`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const ticker of tickers) {
      try {
        // Get the user who enabled this ticker's analysis
        const enabledBy = await this.tickersService.getSocialAnalysisOwner(
          ticker.id,
        );

        // If PRO user, check and deduct credits
        if (enabledBy && enabledBy.tier === 'pro') {
          const balance = await this.creditService.getBalance(enabledBy.id);

          if (balance < this.SOCIAL_ANALYSIS_CREDIT_COST) {
            this.logger.warn(
              `Skipping ${ticker.symbol}: User ${enabledBy.id} has insufficient credits`,
            );
            skipped++;
            continue;
          }

          // Deduct credits
          await this.creditService.deductCredits(
            enabledBy.id,
            this.SOCIAL_ANALYSIS_CREDIT_COST,
            'social_analysis_spend',
            { ticker_id: ticker.id, symbol: ticker.symbol },
          );
        }

        // Run sentiment analysis (last 24 hours of posts)
        await this.analyzeRecentPosts(ticker.symbol, 24);

        // Run event search
        await this.eventCalendarService.searchUpcomingEvents(ticker.symbol);

        this.logger.log(`✓ Completed analysis for ${ticker.symbol}`);
        processed++;
      } catch (error) {
        this.logger.error(
          `Failed analysis for ${ticker.symbol}: ${error.message}`,
        );
        errors++;
      }
    }

    this.logger.log(
      `Pre-market analysis complete: ${processed} processed, ${skipped} skipped, ${errors} errors`,
    );
    return { success: true, processed, skipped, errors };
  }

  /**
   * Analyze recent posts for a symbol.
   */
  async analyzeRecentPosts(
    symbol: string,
    hours: number = 24,
  ): Promise<StockTwitsAnalysis | null> {
    // 1. Fetch recent posts from DB (already synced by StockTwitsService hourly)
    const posts = await this.stockTwitsService.getRecentPostsFromDb(
      symbol,
      hours,
    );

    // 2. Skip if insufficient data
    if (posts.length < 5) {
      this.logger.log(
        `Insufficient posts for ${symbol} (${posts.length}), skipping analysis`,
      );
      return null;
    }

    // 3. Prepare prompt with post data
    const postsJson = JSON.stringify(
      posts.map((p: any) => ({
        username: p.username,
        body: p.body,
        followers: p.user_followers_count,
        likes: p.likes_count,
        created_at: p.created_at,
      })),
    );

    const prompt = `
You are analyzing StockTwits posts for ${symbol}.

## Context
${postsJson}

## Instructions
Analyze these social media posts and extract:

1. **Overall Sentiment Score** (-1.0 to 1.0):
   - -1.0 = Extremely Bearish
   - 0 = Neutral
   - 1.0 = Extremely Bullish

2. **Weighted Sentiment** (factor in follower counts as credibility signal)

3. **Sentiment Label**: VERY_BULLISH | BULLISH | NEUTRAL | BEARISH | VERY_BEARISH

4. **Summary**: 1-2 paragraph synthesis of the social sentiment

5. **Top 5 Highlights**: Most insightful/influential posts
   - Prioritize: High-follower accounts, unique insights, specific catalysts

6. **Extracted Events**: Any mentioned upcoming events with dates
   - earnings, FDA decisions, conferences, product launches, etc.

Return the result as JSON.
`;

    // 4. Call LLM for analysis
    const result = await this.llmService.generateResearch({
      question: prompt,
      tickers: [symbol],
      quality: 'medium',
      numericContext: { posts_count: posts.length },
    });

    // 5. Parse result (assuming result.answerMarkdown is JSON)
    try {
      const data = JSON.parse(result.answerMarkdown);

      const analysis = this.analysisRepo.create({
        ticker_id: posts[0].ticker_id, // Assuming posts have ticker_id or we look it up
        symbol: symbol,
        analysis_start: new Date(Date.now() - hours * 60 * 60 * 1000),
        analysis_end: new Date(),
        sentiment_score: data.sentiment_score,
        sentiment_label: data.label || data.sentiment_label,
        posts_analyzed: posts.length,
        weighted_sentiment_score:
          data.weighted_sentiment || data.weighted_sentiment_score,
        summary: data.summary,
        highlights: data.highlights,
        extracted_events: data.events || data.extracted_events,
        model_used: 'gemini-2.5-flash-lite',
      });

      const saved = await this.analysisRepo.save(analysis);

      // 6. Upsert extracted events to calendar
      if (saved.extracted_events && saved.extracted_events.length > 0) {
        await this.eventCalendarService.upsertSocialEvents(
          symbol,
          saved.extracted_events,
        );
      }

      return saved;
    } catch (e) {
      this.logger.error(
        `Failed to parse LLM response for ${symbol}: ${e.message}`,
      );
      return null;
    }
  }

  /**
   * Get latest sentiment for a symbol.
   */
  async getLatestSentiment(symbol: string): Promise<StockTwitsAnalysis | null> {
    return this.analysisRepo.findOne({
      where: { symbol },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Cleanup old analyses.
   */
  async cleanupOldAnalyses(ageInDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ageInDays);

    const result = await this.analysisRepo
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }
}

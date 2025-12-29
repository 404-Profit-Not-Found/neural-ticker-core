import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import {
  EventCalendar,
  EventSource,
  EventType,
} from './entities/event-calendar.entity';
import { LlmService } from '../llm/llm.service';
import { TickersService } from '../tickers/tickers.service';

@Injectable()
export class EventCalendarService {
  private readonly logger = new Logger(EventCalendarService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly tickersService: TickersService,
    @InjectRepository(EventCalendar)
    private readonly eventRepo: Repository<EventCalendar>,
  ) {}

  /**
   * Search for events using AI + Google Search.
   * Called via job or on-demand.
   */
  async searchUpcomingEvents(symbol: string): Promise<EventCalendar[]> {
    const ticker = await this.tickersService.getTickerBySymbol(symbol);
    if (!ticker) {
      this.logger.warn(`Ticker not found for ${symbol}`);
      return [];
    }
    const companyName = ticker.name || symbol;

    const prompt = `
You are a financial research assistant. Use Google Search to find upcoming events and catalysts for ${symbol} (${companyName}).

## Search Focus
1. Earnings dates
2. FDA/regulatory decisions
3. Upcoming conferences and presentations
4. Product launches or announcements
5. Legal proceedings and deadlines
6. Analyst days and investor meetings

## Instructions
- Use your Google Search tool to find the latest information
- Focus on events within the next 90 days
- Include specific dates when available
- Note the source and confidence level

Return the result as JSON list of events.
`;

    // Call LLM with Google Search grounding
    const result = await this.llmService.generateResearch({
      question: prompt,
      tickers: [symbol],
      quality: 'medium',
      numericContext: {},
    });

    try {
      const data = JSON.parse(result.answerMarkdown);
      const events = data.events || data;

      const savedEvents = [];
      for (const e of events) {
        const saved = await this.upsertEvent({
          symbol,
          ticker_id: ticker.id,
          title: e.title,
          description: e.description,
          event_date: e.date ? new Date(e.date) : undefined,
          date_text: e.date_text || e.date,
          event_type: e.type || EventType.OTHER,
          source: EventSource.AI_SEARCH,
          confidence:
            e.confidence === 'high'
              ? 0.95
              : e.confidence === 'medium'
                ? 0.7
                : 0.4,
          impact_score: e.impact_score,
          expected_impact: e.expected_impact,
          source_reference: { url: e.source_url },
        });
        savedEvents.push(saved);
      }

      return savedEvents;
    } catch (e) {
      this.logger.error(
        `Failed to parse event search result for ${symbol}: ${e.message}`,
      );
      return [];
    }
  }

  /**
   * Upsert event from social extraction.
   */
  async upsertSocialEvents(symbol: string, events: any[]) {
    const ticker = await this.tickersService.getTickerBySymbol(symbol);
    if (!ticker) return;

    for (const e of events) {
      await this.upsertEvent({
        symbol,
        ticker_id: ticker.id,
        title: e.description, // Social events usually come as descriptions
        description: `Source: StockTwits mentioned posts ${e.source_post_ids?.join(', ')}`,
        event_date: e.date ? new Date(e.date) : undefined,
        date_text: e.date,
        event_type: e.type || EventType.OTHER,
        source: EventSource.STOCKTWITS,
        confidence: 0.6, // Social sentiment is medium confidence
        source_reference: { post_ids: e.source_post_ids },
      });
    }
  }

  /**
   * Generic upsert (title + date as uniqueness constraint).
   */
  async upsertEvent(data: Partial<EventCalendar>): Promise<EventCalendar> {
    // Check for existing event with same title and symbol within a week range
    const existing = await this.eventRepo.findOne({
      where: {
        symbol: data.symbol,
        title: data.title,
      },
    });

    if (existing) {
      // Update existing
      Object.assign(existing, data);
      existing.updated_at = new Date();
      return this.eventRepo.save(existing);
    }

    const event = this.eventRepo.create(data);
    return this.eventRepo.save(event);
  }

  /**
   * Get upcoming events for a symbol.
   */
  async getUpcomingEvents(
    symbol: string,
    days: number = 90,
  ): Promise<EventCalendar[]> {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + days);

    return this.eventRepo.find({
      where: {
        symbol,
        event_date: Between(now, futureDate),
      },
      order: { event_date: 'ASC' },
    });
  }
}

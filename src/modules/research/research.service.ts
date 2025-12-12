import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  ResearchNote,
  LlmProvider,
  ResearchStatus,
} from './entities/research-note.entity';
import { LlmService } from '../llm/llm.service';
import { MarketDataService } from '../market-data/market-data.service';
import { QualityTier } from '../llm/llm.types';
import { UsersService } from '../users/users.service';

import { RiskRewardService } from '../risk-reward/risk-reward.service';

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    @InjectRepository(ResearchNote)
    private readonly noteRepo: Repository<ResearchNote>,
    private readonly llmService: LlmService,
    private readonly marketDataService: MarketDataService,
    private readonly usersService: UsersService,
    private readonly riskRewardService: RiskRewardService,
  ) {}

  async createResearchTicket(
    userId: string,
    tickers: string[],
    question: string,
    provider: 'openai' | 'gemini' | 'ensemble' = 'ensemble',
    quality: QualityTier = 'medium',
  ): Promise<ResearchNote> {
    const note = this.noteRepo.create({
      request_id: uuidv4(),
      tickers,
      question,
      provider: provider as LlmProvider,
      quality,
      numeric_context: {}, // Filled during processing
      status: ResearchStatus.PENDING,
      user_id: userId,
    });
    return this.noteRepo.save(note);
  }

  // Legacy method kept for compatibility if needed, but forwarded to new flow?
  // Or just removed. I will remove it to force usage of new async flow.
  // The controller was the only user.

  async processTicket(id: string): Promise<void> {
    const note = await this.noteRepo.findOne({ where: { id } });
    if (!note) return;

    try {
      note.status = ResearchStatus.PROCESSING;
      await this.noteRepo.save(note);

      // 1. Gather Context
      const context: Record<string, any> = {};
      for (const ticker of note.tickers) {
        try {
          const snapshot = await this.marketDataService.getSnapshot(ticker);
          // Also fetch Risk/Reward Score
          const riskScore = await this.riskRewardService.getLatestScore(ticker);

          context[ticker] = {
            ...snapshot,
            risk_reward: riskScore
              ? {
                  overall_score: riskScore.overall_score,
                  financial_risk: riskScore.financial_risk,
                  execution_risk: riskScore.execution_risk,
                  reward_target: riskScore.price_target_weighted,
                  upside: riskScore.upside_percent,
                  scenarios: riskScore.scenarios?.map((s) => ({
                    type: s.scenario_type,
                    target: s.price_mid,
                  })),
                }
              : 'Not available',
          };
        } catch (e) {
          this.logger.warn(`Failed to fetch context for ${ticker}`, e);
        }
      }

      // 2. Resolve API Key
      let apiKey: string | undefined;
      if (note.user_id) {
        const user = await this.usersService.findById(note.user_id);
        apiKey = user?.preferences?.gemini_api_key;
      }
      // Fallback to System Default if User Key missing
      if (!apiKey) {
        apiKey = process.env.GEMINI_API_KEY;
        this.logger.log(`Using System Default Key for ticket ${id}`);
      } else {
        this.logger.log(`Using User Key for ticket ${id}`);
      }

      // 3. Call LLM
      const result = await this.llmService.generateResearch({
        question: note.question,
        tickers: note.tickers,
        numericContext: context,
        quality: note.quality as QualityTier,
        provider: note.provider as any,
        apiKey,
      });

      // 4. Generate dynamic title based on findings
      const title = await this.generateTitle(
        note.question,
        result.answerMarkdown,
        note.tickers,
      );

      // 5. Complete - Store full response and metadata
      note.status = ResearchStatus.COMPLETED;
      note.title = title;
      note.answer_markdown = result.answerMarkdown;
      note.full_response = JSON.stringify(result, null, 2); // Store complete response
      note.grounding_metadata = result.groundingMetadata || null;
      note.thinking_process = result.thoughts || null;
      note.tokens_in = result.tokensIn || null;
      note.tokens_out = result.tokensOut || null;
      note.numeric_context = context;
      note.models_used = result.models;
      await this.noteRepo.save(note);

      // 6. Post-Process: Generate "Deep Tier" Risk Score from the analysis
      // "Flip" logic: Research -> Score
      this.logger.log(`Triggering Deep Verification Score for ticket ${id}`);
      await this.riskRewardService.evaluateFromResearch(note);
    } catch (e) {
      this.logger.error(`Ticket ${id} failed`, e);
      note.status = ResearchStatus.FAILED;
      note.error = e.message;
      await this.noteRepo.save(note);
    }
  }

  /**
   * Generate a concise, informative title based on research findings
   */
  private async generateTitle(
    question: string,
    answerMarkdown: string,
    tickers: string[],
  ): Promise<string> {
    try {
      // Extract first 500 chars of answer for context
      const answerPreview = answerMarkdown.substring(0, 500);

      const titlePrompt = `Based on this financial research, generate a concise, informative title (max 80 characters) that captures the KEY FINDING or CONCLUSION. Focus on actionable insights, not generic descriptions.

Question: ${question}
Tickers: ${tickers.join(', ')}
Research Summary: ${answerPreview}...

Generate ONLY the title, nothing else. Examples of good titles:
- "NVDA Q4 Earnings: 50% Revenue Growth Driven by AI Demand"
- "AAPL Services Revenue Concerns Offset by Strong iPhone Sales"
- "TSLA Production Delays May Impact Q1 Delivery Targets"

Title:`;

      const result = await this.llmService.generateResearch({
        question: titlePrompt,
        tickers: [],
        numericContext: {},
        quality: 'low' as QualityTier, // Fast, cheap call
        provider: 'gemini',
        maxTokens: 50,
      });

      // Clean up the title (remove quotes, trim, limit length)
      let title = result.answerMarkdown
        .trim()
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/\n/g, ' ') // Remove newlines
        .substring(0, 80); // Enforce max length

      // Fallback to generic title if generation fails or is too short
      if (!title || title.length < 10) {
        title = `Research: ${tickers.join(', ')} - ${question.substring(0, 40)}`;
      }

      return title;
    } catch (e) {
      this.logger.warn(`Title generation failed, using fallback`, e);
      return `Research: ${tickers.join(', ')} - ${question.substring(0, 40)}`;
    }
  }

  async getResearchNote(id: string): Promise<ResearchNote | null> {
    return this.noteRepo.findOne({ where: { id } });
  }

  async getLatestNoteForTicker(symbol: string): Promise<ResearchNote | null> {
    return this.noteRepo
      .createQueryBuilder('note')
      .where(':symbol = ANY(note.tickers)', { symbol })
      .andWhere('note.status = :status', { status: ResearchStatus.COMPLETED })
      .orderBy('note.created_at', 'DESC')
      .getOne();
  }

  async findAll(
    userId: string,
    status: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: ResearchNote[];
    total: number;
    page: number;
    limit: number;
  }> {
    const query = this.noteRepo.createQueryBuilder('note');
    query.where('note.user_id = :userId', { userId });

    if (status && status !== 'all') {
      query.andWhere('note.status = :status', { status });
    }

    query.orderBy('note.created_at', 'DESC');
    query.skip((page - 1) * limit);
    query.take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async failStuckTickets(staleMinutes: number = 20): Promise<number> {
    const threshold = new Date(Date.now() - staleMinutes * 60 * 1000);

    const stuckNotes = await this.noteRepo.find({
      where: {
        status: ResearchStatus.PROCESSING,
        updated_at: LessThan(threshold),
      },
    });

    if (stuckNotes.length === 0) return 0;

    for (const note of stuckNotes) {
      note.status = ResearchStatus.FAILED;
      note.error = 'Timeout: Research stuck in processing state.';
      await this.noteRepo.save(note);
    }

    this.logger.warn(`Cleaned up ${stuckNotes.length} stuck research tickets.`);
    return stuckNotes.length;
  }
}

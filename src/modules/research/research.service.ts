import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ResearchNote, LlmProvider, ResearchStatus } from './entities/research-note.entity';
import { LlmService } from '../llm/llm.service';
import { MarketDataService } from '../market-data/market-data.service';
import { QualityTier } from '../llm/llm.types';
import { UsersService } from '../users/users.service';

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    @InjectRepository(ResearchNote)
    private readonly noteRepo: Repository<ResearchNote>,
    private readonly llmService: LlmService,
    private readonly marketDataService: MarketDataService,
    private readonly usersService: UsersService,
  ) {}

  async createResearchTicket(
    userId: string,
    tickers: string[],
    question: string,
    provider: 'openai' | 'gemini' | 'ensemble' = 'ensemble',
    quality: QualityTier = 'medium',
    overrideKey?: string,
  ): Promise<ResearchNote> {
    const note = this.noteRepo.create({
      request_id: uuidv4(),
      tickers,
      question,
      provider: provider as LlmProvider,
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
           context[ticker] = await this.marketDataService.getSnapshot(ticker);
        } catch (e) {
           this.logger.warn(`Failed to fetch snapshot for ${ticker}`, e);
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
        quality: 'high', // Force High for deep research as requested, or map from QualityTier
        provider: 'gemini', // Enforce Gemini 3 for async deep research
        apiKey,
      });

      // 4. Complete
      note.status = ResearchStatus.COMPLETED;
      note.answer_markdown = result.answerMarkdown;
      note.numeric_context = context;
      note.models_used = result.models;
      await this.noteRepo.save(note);
      
    } catch (e) {
      this.logger.error(`Ticket ${id} failed`, e);
      note.status = ResearchStatus.FAILED;
      note.error = e.message;
      await this.noteRepo.save(note);
    }
  }

  async getResearchNote(id: string): Promise<ResearchNote | null> {
    return this.noteRepo.findOne({ where: { id } });
  }
}

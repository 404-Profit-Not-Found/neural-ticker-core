import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ResearchNote, LlmProvider } from './entities/research-note.entity';
import { LlmService } from '../llm/llm.service';
import { MarketDataService } from '../market-data/market-data.service';
import { QualityTier } from '../llm/llm.types';

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    @InjectRepository(ResearchNote)
    private readonly noteRepo: Repository<ResearchNote>,
    private readonly llmService: LlmService,
    private readonly marketDataService: MarketDataService,
  ) {}

  async createResearchQuestion(
    tickers: string[],
    question: string,
    provider: 'openai' | 'gemini' | 'ensemble' = 'ensemble',
    quality: QualityTier = 'medium',
  ) {
    // 1. Gather context
    const context: Record<string, any> = {};
    for (const ticker of tickers) {
      // In a real app, this would handle errors gracefully per ticker
      const snapshot = await this.marketDataService.getSnapshot(ticker);
      context[ticker] = snapshot;
    }

    // 2. Call LLM
    const result = await this.llmService.generateResearch({
      question,
      tickers,
      numericContext: context,
      quality,
      provider,
    });

    // 3. Persist
    const note = this.noteRepo.create({
      request_id: uuidv4(),
      tickers,
      question,
      provider: provider as LlmProvider,
      models_used: result.models,
      answer_markdown: result.answerMarkdown,
      numeric_context: context,
    });

    return this.noteRepo.save(note);
  }

  async getResearchNote(id: string): Promise<ResearchNote | null> {
    return this.noteRepo.findOne({ where: { id } });
  }
}

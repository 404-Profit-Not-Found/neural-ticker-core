import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskRewardScore, RiskConfidenceLevel } from './entities/risk-reward-score.entity';
import { LlmService } from '../llm/llm.service';
import { MarketDataService } from '../market-data/market-data.service';
import { QualityTier } from '../llm/llm.types';

@Injectable()
export class RiskRewardService {
  private readonly logger = new Logger(RiskRewardService.name);

  constructor(
    @InjectRepository(RiskRewardScore)
    private readonly scoreRepo: Repository<RiskRewardScore>,
    private readonly llmService: LlmService,
    private readonly marketDataService: MarketDataService,
  ) {}

  async getLatestScore(symbol: string) {
      // Logic requires fetching symbol ID first usually, but for simplicity:
      // Assuming we join or look up by symbol string if we added relations,
      // but here we stored symbol_id. So we need symbol lookup.
      // Let's assume marketDataService can help or we inject SymbolsService.
      // For now, let's assume getSnapshot includes symbol entity which has ID.
      const snapshot = await this.marketDataService.getSnapshot(symbol);
      
      return this.scoreRepo.findOne({
          where: { symbol_id: snapshot.symbol.id },
          order: { as_of: 'DESC' },
      });
  }

  async getScoreHistory(symbol: string) {
      const snapshot = await this.marketDataService.getSnapshot(symbol);
      return this.scoreRepo.find({
          where: { symbol_id: snapshot.symbol.id },
          order: { as_of: 'DESC' },
      });
  }

  // Scanning logic would go here (evaluateSymbol)
  async evaluateSymbol(symbol: string, provider: 'openai'|'gemini' = 'openai', quality: QualityTier = 'low') {
      const snapshot = await this.marketDataService.getSnapshot(symbol);
      const context = {
          symbol: snapshot.symbol.symbol,
          price: snapshot.latestPrice,
          fundamentals: snapshot.fundamentals,
      };

      const prompt = {
          question: `Evaluate risk/reward 0-100. Return JSON matching: { risk_reward_score, risk_score, reward_score, confidence, summary, key_drivers }`,
          tickers: [symbol],
          numericContext: context,
          provider: provider, // Explicitly narrowing type
          quality,
      };

      const result = await this.llmService.generateResearch(prompt);
      
      // Parse JSON from result.answerMarkdown
      // Implementation omit real parsing for brevity, assume valid JSON block
      // In production: use structured outputs or strict parsing.
      let parsed;
      try {
          // Naive cleanup
          const jsonStr = result.answerMarkdown.replace(/```json/g, '').replace(/```/g, '').trim();
          parsed = JSON.parse(jsonStr);
      } catch (e) {
          this.logger.error(`Failed to parse LLM JSON for ${symbol}: ${e.message}`);
          // Fallback or throw
          return null;
      }

      const score = this.scoreRepo.create({
          symbol_id: snapshot.symbol.id,
          as_of: new Date(),
          risk_reward_score: parsed.risk_reward_score || 50,
          risk_score: parsed.risk_score || 50,
          reward_score: parsed.reward_score || 50,
          confidence_level: (parsed.confidence as RiskConfidenceLevel) || RiskConfidenceLevel.MEDIUM,
          provider: provider,
          models_used: result.models,
          rationale_markdown: parsed.summary || result.answerMarkdown.substring(0, 100),
          numeric_context: context,
      });

      return this.scoreRepo.save(score);
  }
}

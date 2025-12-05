import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RiskRewardScore,
  RiskConfidenceLevel,
} from './entities/risk-reward-score.entity';
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
    const snapshot = await this.marketDataService.getSnapshot(symbol);

    const latest = await this.scoreRepo.findOne({
      where: { symbol_id: snapshot.ticker.id },
      order: { as_of: 'DESC' },
    });

    const STALE_HOURS = 1;
    const isStale =
      !latest ||
      Date.now() - latest.as_of.getTime() > STALE_HOURS * 60 * 60 * 1000;

    if (isStale) {
      this.logger.log(
        `Score for ${symbol} is stale/missing. Generating new score...`,
      );
      try {
        return await this.evaluateSymbol(symbol);
      } catch (e) {
        this.logger.error(
          `Failed to generate on-demand score for ${symbol}: ${e.message}`,
        );
        // Return stale if available, otherwise null/throw
        return latest || null;
      }
    }

    return latest;
  }

  async getScoreHistory(symbol: string) {
    const snapshot = await this.marketDataService.getSnapshot(symbol);
    return this.scoreRepo.find({
      where: { symbol_id: snapshot.ticker.id },
      order: { as_of: 'DESC' },
    });
  }

  // Scanning logic would go here (evaluateSymbol)
  async evaluateSymbol(
    symbol: string,
    provider: 'gemini' | 'openai' = 'openai',
    quality: QualityTier = 'low',
  ) {
    const snapshot = await this.marketDataService.getSnapshot(symbol);
    const context = {
      symbol: snapshot.ticker.symbol,
      price: snapshot.latestPrice,
      fundamentals: snapshot.fundamentals,
    };

    const prompt = {
      question: `Evaluate risk/reward 0-100. Return JSON matching: { risk_reward_score, risk_score, reward_score, confidence, summary, key_drivers }. 
          IMPORTANT: 'confidence' MUST be one of: "low", "medium", "high".`,
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
      const jsonStr = result.answerMarkdown
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      this.logger.error(`Failed to parse LLM JSON for ${symbol}: ${e.message}`);
      // Fallback or throw
      return null;
    }

    // Helper to map confidence safely
    const mapConfidence = (val: any): RiskConfidenceLevel => {
      if (!val) return RiskConfidenceLevel.MEDIUM;
      const s = String(val).toLowerCase();
      if (s === 'high' || s === 'low' || s === 'medium')
        return s as RiskConfidenceLevel;
      // Number fallback
      const n = parseInt(s, 10);
      if (!isNaN(n)) {
        if (n >= 80) return RiskConfidenceLevel.HIGH;
        if (n >= 50) return RiskConfidenceLevel.MEDIUM;
        return RiskConfidenceLevel.LOW;
      }
      return RiskConfidenceLevel.MEDIUM;
    };

    const score = this.scoreRepo.create({
      symbol_id: snapshot.ticker.id,
      as_of: new Date(),
      risk_reward_score: parsed.risk_reward_score || 50,
      risk_score: parsed.risk_score || 50,
      reward_score: parsed.reward_score || 50,
      confidence_level: mapConfidence(parsed.confidence),
      provider: provider,
      models_used: result.models,
      rationale_markdown:
        parsed.summary || result.answerMarkdown.substring(0, 100),
      numeric_context: context,
    });

    return this.scoreRepo.save(score);
  }
}

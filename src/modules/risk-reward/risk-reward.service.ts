import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskRewardScore } from './entities/risk-reward-score.entity'; // Legacy
import { RiskAnalysis } from './entities/risk-analysis.entity';
import { RiskScenario, ScenarioType } from './entities/risk-scenario.entity';
import {
  RiskQualitativeFactor,
  QualitativeFactorType,
} from './entities/risk-qualitative-factor.entity';
import {
  RiskCatalyst,
  CatalystTimeframe,
} from './entities/risk-catalyst.entity';
import { LlmService } from '../llm/llm.service';
import { MarketDataService } from '../market-data/market-data.service';
import { QualityTier } from '../llm/llm.types';

@Injectable()
export class RiskRewardService {
  private readonly logger = new Logger(RiskRewardService.name);

  constructor(
    @InjectRepository(RiskRewardScore)
    private readonly oldScoreRepo: Repository<RiskRewardScore>,
    @InjectRepository(RiskAnalysis)
    private readonly analysisRepo: Repository<RiskAnalysis>,
    private readonly llmService: LlmService,
    private readonly marketDataService: MarketDataService,
  ) {}

  async getLatestScore(symbol: string) {
    const snapshot = await this.marketDataService.getSnapshot(symbol);
    return this.getLatestAnalysis(snapshot.ticker.id);
  }

  async getLatestAnalysis(tickerId: string): Promise<RiskAnalysis | null> {
    return this.analysisRepo.findOne({
      where: { ticker_id: tickerId },
      order: { created_at: 'DESC' },
      relations: ['scenarios', 'qualitative_factors', 'catalysts'],
    });
  }

  async getScoreHistory(symbol: string) {
    const snapshot = await this.marketDataService.getSnapshot(symbol);
    return this.analysisRepo.find({
      where: { ticker_id: snapshot.ticker.id },
      order: { created_at: 'DESC' },
      relations: ['scenarios'],
      take: 10,
    });
  }

  // Called by ResearchService after a Deep Research Note is generated
  async evaluateFromResearch(note: any): Promise<RiskAnalysis | null> {
    if (!note || !note.answer_markdown) return null;

    // We assume the note contains multiple tickers or one. The schema suggests analysis per ticker.
    // If the note has multiple tickers, we should ideally loop. For now, let's pick the first one
    // or try to handle all if possible.
    // The user schema is per-ticker.
    // Let's iterate over tickers in the note.

    const results: RiskAnalysis[] = [];

    for (const tickerSymbol of note.tickers) {
      try {
        const analysis = await this._generateAnalysisFromText(
          tickerSymbol,
          note.answer_markdown,
          note.id,
        );
        if (analysis) results.push(analysis);
      } catch (e) {
        this.logger.error(
          `Failed to generate analysis for ${tickerSymbol} from note ${note.id}: ${e.message}`,
        );
      }
    }

    return results.length > 0 ? results[0] : null;
  }

  private async _generateAnalysisFromText(
    symbol: string,
    text: string,
    noteId: string,
  ): Promise<RiskAnalysis> {
    const snapshot = await this.marketDataService.getSnapshot(symbol);
    const context = {
      symbol: snapshot.ticker.symbol,
      price: snapshot.latestPrice,
      market_cap: snapshot.fundamentals?.market_cap,
      fundamentals: snapshot.fundamentals,
    };

    const schemaStructure = `{
      "ticker": string,
      "company_name": string,
      "sector": string,
      "market_cap_current": number,
      "price_current": number,
      "risk_score": {
        "overall": number,
        "financial_risk": number,
        "execution_risk": number,
        "dilution_risk": number,
        "competitive_risk": number,
        "regulatory_risk": number
      },
      "time_horizon_years": number,
      "scenarios": {
        "bull": {
          "probability": number,
          "description": string,
          "price_target_low": number,
          "price_target_high": number,
          "price_target_mid": number,
          "expected_market_cap": number,
          "key_drivers": string[]
        },
        "base": {
          "probability": number,
          "description": string,
          "price_target_low": number,
          "price_target_high": number,
          "price_target_mid": number,
          "expected_market_cap": number,
          "key_drivers": string[]
        },
        "bear": {
          "probability": number,
          "description": string,
          "price_target_low": number,
          "price_target_high": number,
          "price_target_mid": number,
          "expected_market_cap": number,
          "key_drivers": string[]
        }
      },
      "expected_value": {
        "price_target_weighted": number,
        "upside_vs_current_percent": number
      },
      "fundamentals": {
        "cash_on_hand": number,
        "runway_years": number,
        "revenue_ttm": number,
        "gross_margin": number,
        "debt": number | null,
        "shares_outstanding": number,
        "dilution_forecast_3yr": number
      },
      "qualitative": {
        "strengths": string[],
        "weaknesses": string[],
        "opportunities": string[],
        "threats": string[]
      },
      "catalysts": {
        "near_term": string[],
        "long_term": string[]
      },
      "red_flags": string[],
      "analyst_summary": {
        "analyst_target_avg": number,
        "analyst_target_range_low": number,
        "analyst_target_range_high": number,
        "sentiment": string
      }
    }`;

    // Use a fast model (low quality tier) to extract structured data from the rich text
    const prompt = {
      question: `Extract a quantitative and qualitative Risk/Reward analysis for ${symbol} based on the provided Research Note.
      
      Research Note Content:
      """
      ${text.substring(0, 25000)} 
      """
      
      Output MUST be valid JSON matching this structure exactly:
      ${schemaStructure}

      If exact numbers are missing in the text, infer reasonable estimates based on the text's sentiment and context provided.
      Probabilities must sum to approx 1.0.

      IMPORTANT: Risk Scores (overall, financial, execution, etc.) are on a scale of 0 to 10.
      - 0 = NO RISK / EXTREMELY SAFE
      - 10 = EXTREME RISK / BANKRUPTCY IMMINENT
      - 5 = MARKET AVERAGE RISK
      `,
      tickers: [symbol],
      numericContext: context,
      provider: 'openai' as const, // Use a smart model for extraction to ensure valid JSON
      quality: 'low' as QualityTier, // 'Low' typically maps to gpt-4o-mini or flash, which might be enough, but 'high' is safer for complex JSON. Let's start with low/medium.
    };

    this.logger.log(
      `Extracting Risk Analysis for ${symbol} from Research Note...`,
    );

    let attempts = 0;
    const maxRetries = 3;
    let parsed: any;
    let lastRaw = '';

    while (attempts < maxRetries) {
      attempts++;
      try {
        const result = await this.llmService.generateResearch(prompt);
        const raw = result.answerMarkdown || '';
        lastRaw = raw;
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          this.logger.warn(
            'LLM response did not contain a JSON object, retrying...',
          );
          throw new Error('No JSON object found');
        }
        const cleanJson = jsonMatch[0];

        try {
          parsed = JSON.parse(cleanJson);
        } catch (_err) {
          // Attempt a tolerant repair: quote bare keys and strip trailing commas
          const repaired = cleanJson
            .replace(/(['"])?([A-Za-z0-9_]+)(['"])?:/g, '"$2":')
            .replace(/,(\s*[}\]])/g, '$1');
          parsed = JSON.parse(repaired);
        }

        // Basic validation: Check if key fields exist
        if (!parsed.risk_score || !parsed.scenarios) {
          throw new Error('Missing key sections (risk_score, scenarios)');
        }

        break; // Success
      } catch (e) {
        this.logger.warn(
          `Attempt ${attempts}/${maxRetries} failed to parse JSON for ${symbol}: ${e.message}`,
        );
        if (attempts === maxRetries) {
          this.logger.error(`Final attempt failed for ${symbol}.`);
          this.logger.error(
            `Failed payload (truncated): ${String(lastRaw).slice(0, 500)}`,
          );
          throw new Error(
            'LLM output could not be parsed as JSON after retries.',
          );
        }
        // Optional: Wait a bit? Or just retry immediately.
      }
    }

    // Map to Entities
    const analysis = new RiskAnalysis();
    analysis.ticker = snapshot.ticker;
    analysis.ticker_id = snapshot.ticker.id;
    analysis.model_version = '2.0.0';
    analysis.research_note_id = noteId;

    // Scores
    const rs = parsed.risk_score || {};
    analysis.overall_score = rs.overall || 5;
    analysis.financial_risk = rs.financial_risk || 5;
    analysis.execution_risk = rs.execution_risk || 5;
    analysis.dilution_risk = rs.dilution_risk || 5;
    analysis.competitive_risk = rs.competitive_risk || 5;
    analysis.regulatory_risk = rs.regulatory_risk || 5;

    // Expected Value
    const ev = parsed.expected_value || {};
    analysis.price_target_weighted = ev.price_target_weighted || 0;
    analysis.upside_percent = ev.upside_vs_current_percent || 0;
    analysis.time_horizon_years = parsed.time_horizon_years || 1;

    // Analyst
    const as = parsed.analyst_summary || {};
    analysis.analyst_target_avg = as.analyst_target_avg || 0;
    analysis.analyst_target_range_low = as.analyst_target_range_low || 0;
    analysis.analyst_target_range_high = as.analyst_target_range_high || 0;
    analysis.sentiment = as.sentiment || 'neutral';

    // Fundamentals
    analysis.fundamentals = parsed.fundamentals || {};
    analysis.red_flags = parsed.red_flags || [];

    // Scenarios
    analysis.scenarios = [];
    const scenarios = parsed.scenarios || {};
    const scenarioTypes: ScenarioType[] = [
      ScenarioType.BULL,
      ScenarioType.BASE,
      ScenarioType.BEAR,
    ];
    const buildFallbackScenarios = () => {
      const baseTarget = ev.price_target_weighted || 0;
      const bullTarget = baseTarget ? baseTarget * 1.25 : 0;
      const bearTarget = baseTarget ? baseTarget * 0.75 : 0;
      const probs = { bull: 0.25, base: 0.5, bear: 0.25 };
      return {
        bull: {
          probability: probs.bull,
          description: 'AI-estimated bull case (fallback)',
          price_target_low: bullTarget * 0.9,
          price_target_mid: bullTarget,
          price_target_high: bullTarget * 1.1,
          expected_market_cap: 0,
          key_drivers: [],
        },
        base: {
          probability: probs.base,
          description: 'AI-estimated base case (fallback)',
          price_target_low: baseTarget * 0.95,
          price_target_mid: baseTarget || 0,
          price_target_high: baseTarget * 1.05,
          expected_market_cap: 0,
          key_drivers: [],
        },
        bear: {
          probability: probs.bear,
          description: 'AI-estimated bear case (fallback)',
          price_target_low: bearTarget * 0.9,
          price_target_mid: bearTarget || 0,
          price_target_high: bearTarget * 1.05,
          expected_market_cap: 0,
          key_drivers: [],
        },
      };
    };

    const completeScenarios =
      scenarioTypes.every((t) => scenarios[t]) &&
      scenarioTypes.some((t) => scenarios[t]?.price_target_mid);

    const scenarioSource = completeScenarios
      ? scenarios
      : buildFallbackScenarios();

    scenarioTypes.forEach((type) => {
      const data = scenarioSource[type];
      if (data) {
        const scenario = new RiskScenario();
        scenario.scenario_type = type;
        scenario.probability = data.probability;
        scenario.description = data.description || '';
        scenario.price_low = data.price_target_low || 0;
        scenario.price_high = data.price_target_high || 0;
        scenario.price_mid = data.price_target_mid || 0;
        scenario.expected_market_cap = data.expected_market_cap || 0;
        scenario.key_drivers = data.key_drivers || [];
        analysis.scenarios.push(scenario);
      }
    });

    // Qualitative Factors
    analysis.qualitative_factors = [];
    if (parsed.qualitative) {
      const q = parsed.qualitative;
      const mapFactors = (list: string[], type: QualitativeFactorType) => {
        if (Array.isArray(list)) {
          list.forEach((txt) => {
            const f = new RiskQualitativeFactor();
            f.factor_type = type;
            f.description = txt;
            analysis.qualitative_factors.push(f);
          });
        }
      };
      mapFactors(q.strengths, QualitativeFactorType.STRENGTH);
      mapFactors(q.weaknesses, QualitativeFactorType.WEAKNESS);
      mapFactors(q.opportunities, QualitativeFactorType.OPPORTUNITY);
      mapFactors(q.threats, QualitativeFactorType.THREAT);
    }

    // Catalysts
    analysis.catalysts = [];
    if (parsed.catalysts) {
      const c = parsed.catalysts;
      const mapCatalysts = (list: string[], tf: CatalystTimeframe) => {
        if (Array.isArray(list)) {
          list.forEach((txt) => {
            const cat = new RiskCatalyst();
            cat.timeframe = tf;
            cat.description = txt;
            analysis.catalysts.push(cat);
          });
        }
      };
      mapCatalysts(c.near_term, CatalystTimeframe.NEAR_TERM);
      mapCatalysts(c.long_term, CatalystTimeframe.LONG_TERM);
    }

    // Save with cascade
    this.logger.log(
      `Saved Risk Analysis for ${symbol} (linked to Note ${noteId}).`,
    );
    return this.analysisRepo.save(analysis);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { toonToJson } from 'toon-parser';

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
    private readonly configService: ConfigService,
  ) {}

  // Heuristic salvage to keep processing when TOON/JSON is malformed but key numbers exist.
  private salvageFromRaw(raw: string) {
    if (!raw) return null;

    // Helper to extract numeric values by key (supports both quoted and unquoted keys)
    const getNum = (key: string) => {
      // Match quoted or unquoted key patterns
      const patterns = [
        new RegExp(`["']?${key}["']?\\s*:\\s*([-\\d.]+)`, 'i'),
        new RegExp(`${key}\\s*:\\s*([-\\d.]+)`, 'i'),
      ];
      for (const pattern of patterns) {
        const match = raw.match(pattern);
        if (match) {
          const n = Number(match[1]);
          if (Number.isFinite(n)) return n;
        }
      }
      return null;
    };

    // Helper to extract scenario price from various text patterns
    const getScenarioPrice = (scenario: string) => {
      // Try TOON/JSON format first: bull: { price_target_mid: X }
      const jsonPattern = new RegExp(
        `["']?${scenario}["']?\\s*:\\s*\\{[^}]*price_target_mid\\s*:\\s*([-\\d.]+)`,
        'i',
      );
      let match = raw.match(jsonPattern);
      if (match) return Number(match[1]);

      // Try text format: Bull Case: $X or Bull: $X
      const textPatterns = [
        new RegExp(`${scenario}\\s*(?:case)?\\s*[:=]\\s*\\$?([\\d,.]+)`, 'i'),
        new RegExp(`${scenario}\\s*target\\s*[:=]\\s*\\$?([\\d,.]+)`, 'i'),
      ];
      for (const pattern of textPatterns) {
        match = raw.match(pattern);
        if (match) {
          const n = Number(match[1].replace(/,/g, ''));
          if (Number.isFinite(n)) return n;
        }
      }
      return null;
    };

    // Helper to extract scenario probability from various text patterns
    const getScenarioProbability = (scenario: string): number | null => {
      // Try TOON/JSON format: bull: { probability: 0.25 }
      const jsonPattern = new RegExp(
        `["']?${scenario}["']?\\s*:\\s*\\{[^}]*probability\\s*:\\s*(\\d+\\.?\\d*)`,
        'i',
      );
      let match = raw.match(jsonPattern);
      if (match) {
        const n = Number(match[1]);
        // If value > 1, assume it's a percentage
        return n > 1 ? n / 100 : n;
      }

      // Try text format: Bull probability: 25% or Bull: 25%
      const textPatterns = [
        new RegExp(
          `${scenario}\\s*(?:probability|prob|chance)\\s*[:=]?\\s*(\\d+\\.?\\d*)\\s*%`,
          'i',
        ),
        new RegExp(`${scenario}\\s*[:=]?\\s*(\\d+\\.?\\d*)\\s*%`, 'i'),
        new RegExp(
          `${scenario}\\s*(?:probability|prob|chance)\\s*[:=]?\\s*0?\\.(\\d+)`,
          'i',
        ),
      ];
      for (const pattern of textPatterns) {
        match = raw.match(pattern);
        if (match) {
          let n = Number(match[1]);
          // Handle percentage vs decimal
          if (pattern.source.includes('%')) {
            n = n / 100;
          } else if (n > 1) {
            // If extracted from decimal pattern but > 1, treat as percentage part
            n = Number('0.' + match[1]);
          }
          if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
        }
      }
      return null;
    };

    const overall = getNum('overall');
    if (overall === null) return null;

    const priceTarget =
      getNum('price_target_weighted') ?? getNum('price_target_mid') ?? 0;
    const upside = getNum('upside_vs_current_percent') ?? 0;

    // Extract scenario-specific values from raw text
    const bullMid = getScenarioPrice('bull');
    const baseMid = getScenarioPrice('base');
    const bearMid = getScenarioPrice('bear');

    // Extract probabilities (with sensible defaults)
    const bullProb = getScenarioProbability('bull') ?? 0.25;
    const baseProb = getScenarioProbability('base') ?? 0.5;
    const bearProb = getScenarioProbability('bear') ?? 0.25;

    // Build scenarios from extracted values (or leave empty for fallback builder)
    // Helper to extract numeric values from specific scenario block
    const getScenarioNum = (scenario: string, key: string) => {
      const pattern = new RegExp(
        `["']?${scenario}["']?\\s*:\\s*\\{[^}]*${key}\\s*:\\s*([-\\d.]+)`,
        'i',
      );
      const match = raw.match(pattern);
      if (match) {
        const n = Number(match[1]);
        if (Number.isFinite(n)) return n;
      }
      return 0;
    };

    const scenarios: Record<string, any> = {};
    if (bullMid !== null) {
      scenarios.bull = {
        probability: bullProb,
        description: 'Extracted from research text',
        price_target_mid: bullMid,
        price_target_low: bullMid * 0.9,
        price_target_high: bullMid * 1.1,
        expected_market_cap: getScenarioNum('bull', 'expected_market_cap'),
        key_drivers: [],
      };
    }
    if (baseMid !== null) {
      scenarios.base = {
        probability: baseProb,
        description: 'Extracted from research text',
        price_target_mid: baseMid,
        price_target_low: baseMid * 0.95,
        price_target_high: baseMid * 1.05,
        expected_market_cap: getScenarioNum('base', 'expected_market_cap'),
        key_drivers: [],
      };
    }
    if (bearMid !== null) {
      scenarios.bear = {
        probability: bearProb,
        description: 'Extracted from research text',
        price_target_mid: bearMid,
        price_target_low: bearMid * 0.9,
        price_target_high: bearMid * 1.1,
        expected_market_cap: getScenarioNum('bear', 'expected_market_cap'),
        key_drivers: [],
      };
    }

    // Helper to extract string arrays from TOON/JSON or text lists
    const getStringArray = (key: string): string[] => {
      // Try TOON/JSON format: key: ["item1", "item2"]
      const jsonPattern = new RegExp(
        `["']?${key}["']?\\s*:\\s*\\[([^\\]]+)\\]`,
        'i',
      );
      let match = raw.match(jsonPattern);
      if (match) {
        // Parse the array content
        const items = match[1]
          .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/) // Split by comma not inside quotes
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter((s) => s.length > 0 && s !== 'null');
        if (items.length > 0) return items;
      }

      // Try text bullet format: - item or * item
      const textPattern = new RegExp(
        `${key}[:\\s]*(?:\\n|$)([\\s\\S]*?)(?=\\n[a-z_]+:|$)`,
        'i',
      );
      match = raw.match(textPattern);
      if (match) {
        const items = match[1]
          .split(/\n/)
          .map((line) => line.replace(/^[\s\-*•]+/, '').trim())
          .filter((s) => s.length > 5); // Filter out short/empty lines
        if (items.length > 0) return items.slice(0, 5); // Limit to 5 items
      }

      return [];
    };

    // Extract qualitative factors
    const qualitative = {
      strengths: getStringArray('strengths'),
      weaknesses: getStringArray('weaknesses'),
      opportunities: getStringArray('opportunities'),
      threats: getStringArray('threats'),
    };

    // Extract catalysts
    const catalysts = {
      near_term: getStringArray('near_term'),
      long_term: getStringArray('long_term'),
    };

    // Extract red_flags
    const red_flags = getStringArray('red_flags');

    // Extract key_drivers for scenarios and add to them
    const extractKeyDrivers = (scenario: string): string[] => {
      // Look for key_drivers inside the scenario block
      const patternScoped = new RegExp(
        `${scenario}[^}]*key_drivers\\s*:\\s*\\[([^\\]]+)\\]`,
        'i',
      );
      const match = raw.match(patternScoped);
      if (match) {
        return match[1]
          .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter((s) => s.length > 0);
      }
      return [];
    };

    // Add key_drivers to scenarios
    if (scenarios.bull) scenarios.bull.key_drivers = extractKeyDrivers('bull');
    if (scenarios.base) scenarios.base.key_drivers = extractKeyDrivers('base');
    if (scenarios.bear) scenarios.bear.key_drivers = extractKeyDrivers('bear');

    return {
      risk_score: {
        overall,
        financial_risk: getNum('financial_risk') ?? overall,
        execution_risk: getNum('execution_risk') ?? overall,
        dilution_risk: getNum('dilution_risk') ?? overall,
        competitive_risk: getNum('competitive_risk') ?? overall,
        regulatory_risk: getNum('regulatory_risk') ?? overall,
      },
      expected_value: {
        price_target_weighted: priceTarget,
        upside_vs_current_percent: upside,
      },
      scenarios,
      qualitative,
      catalysts,
      red_flags,
    };
  }

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
      "neural_investment_rating": number,
      "risk_score": {
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
      
      Output in TOON format (relaxed JSON: unquoted keys allowed, trailing commas OK).
      Structure:
      ${schemaStructure}

      TOON Example:
      {
        ticker: "${symbol}",
        company_name: "Example Corp",
        risk_score: { overall: 5, financial_risk: 4, execution_risk: 6, dilution_risk: 3, competitive_risk: 5, regulatory_risk: 2 },
        scenarios: {
          bull: { probability: 0.25, description: "Strong growth", price_target_low: 100, price_target_high: 120, price_target_mid: 110, expected_market_cap: 50000000000, key_drivers: ["AI adoption", "Market expansion"] },
          base: { probability: 0.50, description: "Moderate growth", price_target_low: 80, price_target_high: 95, price_target_mid: 87, expected_market_cap: 40000000000, key_drivers: ["Stable revenue"] },
          bear: { probability: 0.25, description: "Challenges ahead", price_target_low: 50, price_target_high: 70, price_target_mid: 60, expected_market_cap: 28000000000, key_drivers: ["Competition", "Margin pressure"] },
        },
        expected_value: { price_target_weighted: 85, upside_vs_current_percent: 15 },
      }

      CRITICAL RULES:
      1. neural_investment_rating (0-10): This is NOT a risk score. It is an overall "Buy/Hold/Sell" equivalent. 10.0 = Exceptional Opportunity/High Conviction, 5.0 = Neutral, 0.0 = Extreme Warning/Bankrupt/Avoid.
      2. If a stock is bankrupt, delisted, or has -100% upside potential, neural_investment_rating MUST be 0.0.
      3. risk_score fields (0-10): 10.0 = EXTREME RISK, 0.0 = NO RISK.
      4. Extract ACTUAL price targets from the research if present - do NOT invent numbers.
      5. If specific Bull/Base/Bear targets are mentioned, use those EXACT values.
      6. If exact numbers are missing, infer reasonable estimates based on sentiment.
      7. OUTPUT PURE JSON ONLY. No markdown formatting (no code blocks).
      8. Numeric fields must be FINAL CALCULATED NUMBERS (e.g., 150.50).
      9. DO NOT include equations, math, or "show your work" (e.g., NEVER output "100 * 1.5").
      10. DO NOT include comments like "// this is a comment".
      `,
      tickers: [symbol],
      numericContext: context,
      provider: this.configService.get<any>('riskReward.provider', 'gemini'),
      quality: 'medium' as QualityTier,
    };

    // this.logger.log(`[${symbol}] Numeric Context: ${JSON.stringify(context)}`);
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
        this.logger.log(
          `[${symbol}] Raw LLM Response: ${raw.substring(0, 1000)}${raw.length > 1000 ? '...' : ''}`,
        );
        lastRaw = raw;
        const toonMatch = raw.match(/\{[\s\S]*\}/);
        if (!toonMatch) {
          this.logger.warn(
            'LLM response did not contain a TOON/JSON object, retrying...',
          );
          throw new Error('No TOON object found');
        }
        const toonContent = toonMatch[0];

        // Primary: Use toonToJson since we requested TOON format
        try {
          parsed = toonToJson(toonContent, { strict: false }) as any;
        } catch {
          // Fallback: Try standard JSON.parse for valid JSON
          try {
            parsed = JSON.parse(toonContent);
          } catch {
            // Last resort: manual repair (quote bare keys, strip trailing commas)
            const repaired = toonContent
              .replace(/(['"])?([A-Za-z0-9_]+)(['"])?:/g, '"$2":')
              .replace(/,(\s*[}\]])/g, '$1');
            parsed = JSON.parse(repaired);
          }
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
          const salvaged = this.salvageFromRaw(lastRaw);
          if (salvaged) {
            this.logger.warn(
              `Using salvaged risk payload for ${symbol} after parse failures.`,
            );
            parsed = salvaged;
            break;
          }
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

    // === DEBUG LOGGING: Show what was extracted ===
    this.logger.log(`[${symbol}] === EXTRACTION RESULTS ===`);
    this.logger.log(
      `[${symbol}] Risk Score: overall=${parsed.risk_score?.overall}`,
    );
    this.logger.log(
      `[${symbol}] Scenarios: bull=$${parsed.scenarios?.bull?.price_target_mid}, base=$${parsed.scenarios?.base?.price_target_mid}, bear=$${parsed.scenarios?.bear?.price_target_mid}`,
    );
    this.logger.log(
      `[${symbol}] Bull key_drivers: ${JSON.stringify(parsed.scenarios?.bull?.key_drivers || [])}`,
    );
    this.logger.log(
      `[${symbol}] Base key_drivers: ${JSON.stringify(parsed.scenarios?.base?.key_drivers || [])}`,
    );
    this.logger.log(
      `[${symbol}] Bear key_drivers: ${JSON.stringify(parsed.scenarios?.bear?.key_drivers || [])}`,
    );
    this.logger.log(
      `[${symbol}] Qualitative strengths: ${JSON.stringify(parsed.qualitative?.strengths || [])}`,
    );
    this.logger.log(
      `[${symbol}] Qualitative weaknesses: ${JSON.stringify(parsed.qualitative?.weaknesses || [])}`,
    );
    this.logger.log(
      `[${symbol}] Qualitative opportunities: ${JSON.stringify(parsed.qualitative?.opportunities || [])}`,
    );
    this.logger.log(
      `[${symbol}] Qualitative threats: ${JSON.stringify(parsed.qualitative?.threats || [])}`,
    );
    this.logger.log(
      `[${symbol}] Catalysts near_term: ${JSON.stringify(parsed.catalysts?.near_term || [])}`,
    );
    this.logger.log(
      `[${symbol}] Catalysts long_term: ${JSON.stringify(parsed.catalysts?.long_term || [])}`,
    );
    this.logger.log(
      `[${symbol}] Red flags: ${JSON.stringify(parsed.red_flags || [])}`,
    );
    this.logger.log(`[${symbol}] === END EXTRACTION ===`);

    // Map to Entities
    const analysis = new RiskAnalysis();
    analysis.ticker = snapshot.ticker;
    analysis.ticker_id = snapshot.ticker.id;
    analysis.model_version = '2.0.0';
    analysis.research_note_id = noteId;

    // Scores
    const rs = parsed.risk_score || {};
    let overall = parsed.neural_investment_rating ?? 5;

    // Expected Value extraction
    const ev = parsed.expected_value || {};
    const upside = ev.upside_vs_current_percent || 0;

    // Safety Logic: If upside is -100% or price is 0, force low overall score
    const price = snapshot.latestPrice?.close || 0;
    if (upside <= -99 || price <= 0) {
      this.logger.warn(
        `Forcing low rating for potentially bankrupt ticker ${symbol}`,
      );
      overall = Math.min(overall, 1.0);
    }

    analysis.overall_score = overall;
    analysis.financial_risk = rs.financial_risk || 5;
    analysis.execution_risk = rs.execution_risk || 5;
    analysis.dilution_risk = rs.dilution_risk || 5;
    analysis.competitive_risk = rs.competitive_risk || 5;
    analysis.regulatory_risk = rs.regulatory_risk || 5;

    // Expected Value (using already declared ev)
    analysis.price_target_weighted = ev.price_target_weighted || 0;
    analysis.upside_percent = upside;
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

import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export interface QualityScore {
  score: number;
  rarity: Rarity;
  details: {
    riskRewardAnalysis: number; // 0-10
    hallucinationCheck: number; // 0-10
    insightDensity: number; // 0-10
    comprehensive: number; // 0-10
    reasoning: string;
  };
}

/**
 * Discriminated result of {@link QualityScoringService.score}. A failure
 * (LLM error, bad JSON, schema mismatch) returns `{ ok: false }` so callers
 * can leave quality_score / rarity NULL and retry later — never persisting a
 * bogus 0 / 'Common' from a transient 429.
 */
export type QualityScoreResult =
  | ({ ok: true } & QualityScore)
  | { ok: false; error: string };

@Injectable()
export class QualityScoringService {
  private readonly logger = new Logger(QualityScoringService.name);

  constructor(private readonly llmService: LlmService) {}

  async score(noteContent: string): Promise<QualityScoreResult> {
    const prompt = `
      You are an expert Senior Lead Analyst at a top-tier hedge fund. Your job is to grade investment research notes with extreme precision and nuance.

      RUBRIC (0-10 Scale, allowing decimals like 8.5):
      1. Risk/Reward Analysis (Weight: 30%): Does it identify asymmetric opportunities? Does it distinctively separate "financial risk" (balance sheet) from "execution risk"? (High scores require specific scenario price targets).
      2. Grounding & Hallucination Check (Weight: 20%): Are assertions backed by specific data points (TTM revenue, specific dates, exact margins)? "General" statements are penalized.
      3. Insight Density (Weight: 30%): The most important metric. Is average sentence providing new information? Penalize "filler" words. Reward non-consensus views if logic is sound.
      4. Comprehensiveness (Weight: 20%): Must cover Fundamentals, Technicals, AND Catalysts.

      SCORING PHILOSOPHY:
      - 70-80: Good, standard professional note.
      - 80-90: Excellent, deep specific insights, no fluff.
      - 90-100: "Legendary" / Institutional Grade. Looks like a Goldman Sachs deep dive. Perfect data density.

      RARITY TIERS (Strict but fair):
      - Common: 0-40
      - Uncommon: 41-70
      - Rare: 71-85 (Solid professional work)
      - Epic: 86-95 (Exceptional depth)
      - Legendary: 96-100 (World-class, actionable alpha)

      RETURN JSON object (TOON syntax allowed):
      {
        "score": number, // Weighted average, 1 decimal place allowed
        "rarity": "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary",
        "details": {
          "riskRewardAnalysis": number,
          "hallucinationCheck": number,
          "insightDensity": number,
          "comprehensive": number,
          "reasoning": "Nuanced critique focused on why it didn't get the next higher tier."
        }
      }

      NOTE CONTENT:
      ${noteContent.substring(0, 500000)} 
    `;

    try {
      const result = await this.llmService.generateResearch({
        question: prompt,
        quality: 'scoring', // Gemma 4 26B: 1500 RPD free, unlimited TPM, no search needed
        provider: 'gemini',
        tickers: [],
        numericContext: {},
      });

      // Extract JSON-like block if embedded in text
      // Improved regex to handle code blocks and greedy matching
      const jsonMatch = result.answerMarkdown.match(/\{[\s\S]*\}/);
      let contentToParse = jsonMatch ? jsonMatch[0] : result.answerMarkdown;

      // Clean up markdown code blocks if present
      contentToParse = contentToParse
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      let scoreData: any;
      try {
        const cleanContent = contentToParse
          .trim()
          .replace(/,\s*([}\]])/g, '$1');
        scoreData = JSON.parse(cleanContent);
      } catch (e) {
        this.logger.error(`Failed to parse content: ${contentToParse}`);
        throw new Error(`Failed to parse response as JSON: ${e.message}`);
      }

      // Numeric Coercion
      if (scoreData.score && typeof scoreData.score === 'string') {
        scoreData.score = parseFloat(scoreData.score);
      }

      // Validate schema loosely
      if (typeof scoreData.score !== 'number' || !scoreData.rarity) {
        this.logger.error(
          `Invalid Schema Recieved: ${JSON.stringify(scoreData)}`,
        );
        throw new Error('Invalid JSON schema from scoring service');
      }

      const score = this.clampScore(scoreData.score);
      return {
        ok: true,
        score,
        rarity: this.deriveRarity(score),
        details: {
          riskRewardAnalysis:
            Number(scoreData.details?.riskRewardAnalysis) || 0,
          hallucinationCheck:
            Number(scoreData.details?.hallucinationCheck) || 0,
          insightDensity: Number(scoreData.details?.insightDensity) || 0,
          comprehensive: Number(scoreData.details?.comprehensive) || 0,
          reasoning:
            typeof scoreData.details?.reasoning === 'string'
              ? scoreData.details.reasoning
              : '',
        },
      };
    } catch (error) {
      // Do NOT fabricate a 0 / 'Common' result — that would be persisted by
      // callers and permanently mislabel a good note on a transient failure
      // (e.g. a 429). Signal failure so callers leave the columns NULL and
      // a later run can re-score.
      this.logger.error(`Failed to score note: ${error.message}`);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Coerce an LLM-provided score into the documented [0, 100] range. The
   * rubric prompt mixes 0-10 (per-criterion) and 0-100 (overall) scales, and
   * the model occasionally emits an out-of-range or non-finite value. We never
   * persist anything outside [0, 100]; a NaN/non-finite value clamps to 0.
   */
  private clampScore(value: unknown): number {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.min(100, Math.max(0, num));
  }

  /**
   * Re-derive the rarity tier from the (clamped) score so persisted rarity is
   * always internally consistent with the score, regardless of what the model
   * claimed. Bands mirror the rubric prompt:
   *   Common 0-40, Uncommon 41-70, Rare 71-85, Epic 86-95, Legendary 96-100.
   */
  private deriveRarity(score: number): Rarity {
    if (score <= 40) return 'Common';
    if (score <= 70) return 'Uncommon';
    if (score <= 85) return 'Rare';
    if (score <= 95) return 'Epic';
    return 'Legendary';
  }
}

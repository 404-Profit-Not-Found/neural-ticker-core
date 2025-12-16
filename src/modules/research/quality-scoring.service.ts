import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { toonToJson } from 'toon-parser';

export interface QualityScore {
  score: number;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
  details: {
    riskRewardAnalysis: number; // 0-10
    hallucinationCheck: number; // 0-10
    insightDensity: number; // 0-10
    comprehensive: number; // 0-10
    reasoning: string;
  };
}

@Injectable()
export class QualityScoringService {
  private readonly logger = new Logger(QualityScoringService.name);

  constructor(private readonly llmService: LlmService) {}

  async score(noteContent: string): Promise<QualityScore> {
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
        quality: 'low', // Reverted to 'low' (Flash-Lite) per user request for cost efficiency
        provider: 'gemini',
        tickers: [],
        numericContext: {},
      });

      // Extract JSON-like block if embedded in text
      const jsonMatch = result.answerMarkdown.match(/\{[\s\S]*\}/);
      const contentToParse = jsonMatch ? jsonMatch[0] : result.answerMarkdown;

      let scoreData: any;
      try {
        scoreData = toonToJson(contentToParse, { strict: false });
      } catch (e) {
        // Fallback to standard JSON parse if TOON fails
        try {
          scoreData = JSON.parse(contentToParse);
        } catch {
          throw new Error(
            `Failed to parse response as TOON or JSON: ${e.message}`,
          );
        }
      }

      // Validate schema loosely
      if (typeof scoreData.score !== 'number' || !scoreData.rarity) {
        throw new Error('Invalid JSON schema from scoring service');
      }

      return scoreData as QualityScore;
    } catch (error) {
      this.logger.error(`Failed to score note: ${error.message}`);
      // Fallback for failure
      return {
        score: 0,
        rarity: 'Common',
        details: {
          riskRewardAnalysis: 0,
          hallucinationCheck: 0,
          insightDensity: 0,
          comprehensive: 0,
          reasoning: 'Scoring failed.',
        },
      };
    }
  }
}

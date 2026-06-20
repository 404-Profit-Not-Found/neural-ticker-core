import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { RiskRewardService } from '../../risk-reward/risk-reward.service';
import { toolJson } from '../dto/serializers';

const symbol = z
  .string()
  .trim()
  .min(1)
  .describe('Ticker symbol, e.g. "AAPL"')
  .transform((s) => s.toUpperCase());

/**
 * Anonymous risk/reward scoring tools. No authentication required — these
 * expose the platform's computed risk analyses for a symbol.
 */
@Injectable()
export class RiskTools {
  constructor(private readonly riskReward: RiskRewardService) {}

  @Tool({
    name: 'get_risk_score',
    description:
      'Get the latest risk/reward analysis for a symbol: overall score, ' +
      'scenarios, catalysts and qualitative factors. Returns the most recent ' +
      'computed analysis on record.',
    parameters: z.object({ symbol }),
  })
  async getRiskScore(args: { symbol: string }) {
    const score = await this.riskReward.getLatestScore(args.symbol);
    if (!score) {
      throw new Error(
        `No risk analysis available for ${args.symbol}.`,
      );
    }
    return toolJson(score);
  }

  @Tool({
    name: 'get_risk_score_history',
    description:
      'Get the recent history (up to 10) of risk/reward analyses for a symbol, ' +
      'newest first, to see how the score has evolved over time.',
    parameters: z.object({ symbol }),
  })
  async getRiskScoreHistory(args: { symbol: string }) {
    return toolJson(await this.riskReward.getScoreHistory(args.symbol));
  }
}

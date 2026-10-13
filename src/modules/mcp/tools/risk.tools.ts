import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { RiskRewardService } from '../../risk-reward/risk-reward.service';
import { TickersService } from '../../tickers/tickers.service';
import { toolJson } from '../dto/serializers';
import { getMcpUser } from '../auth/mcp-user.util';

const symbol = z
  .string()
  .trim()
  .min(1)
  .describe('Ticker symbol, e.g. "AAPL"')
  .transform((s) => s.toUpperCase());

/**
 * Anonymous risk/reward scoring tools. No authentication required — these
 * expose the platform's computed risk analyses for a symbol.
 *
 * Both reads resolve their symbol through MarketDataService.getSnapshot(),
 * i.e. through TickersService.ensureTicker(), which CREATES an untracked
 * ticker (provider calls, insert, history sync + an LLM research run). An
 * anonymous caller must never trigger that, so they pass through the same gate
 * as the market-data tools (see MarketDataTools): anonymous + untracked symbol
 * is a "not found" tool error. A caller with a valid token is not gated.
 */
@Injectable()
export class RiskTools {
  constructor(
    private readonly riskReward: RiskRewardService,
    private readonly tickers: TickersService,
  ) {}

  private async gateAnonymousRead(symbol: string, req: any): Promise<void> {
    if (getMcpUser(req)) return;
    await this.tickers.assertPublicReadAllowed(symbol, false);
  }

  @Tool({
    name: 'get_risk_score',
    description:
      'Get the latest risk/reward analysis for a symbol: overall score, ' +
      'scenarios, catalysts and qualitative factors. Returns the most recent ' +
      'computed analysis on record. Without authentication only tickers ' +
      'already tracked on the platform are available.',
    parameters: z.object({ symbol }),
  })
  async getRiskScore(args: { symbol: string }, _ctx: unknown, req: any) {
    await this.gateAnonymousRead(args.symbol, req);
    const score = await this.riskReward.getLatestScore(args.symbol);
    if (!score) {
      throw new Error(`No risk analysis available for ${args.symbol}.`);
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
  async getRiskScoreHistory(args: { symbol: string }, _ctx: unknown, req: any) {
    await this.gateAnonymousRead(args.symbol, req);
    return toolJson(await this.riskReward.getScoreHistory(args.symbol));
  }
}

/**
 * Backend port of the weighted verdict algorithm from frontend/src/lib/rating-utils.ts
 * This ensures Dashboard stats match the VerdictBadge displayed to users.
 */

export type RatingVariant =
  | 'default'
  | 'strongBuy'
  | 'buy'
  | 'hold'
  | 'sell'
  | 'speculativeBuy'
  | 'outline';

export interface RatingResult {
  rating: string;
  variant: RatingVariant;
  score: number;
}

export interface VerdictInput {
  risk: number; // 0-10
  upside: number; // Percentage (e.g. 50.5 for 50.5%)
  downside?: number; // Percentage (e.g. -20.0 for -20%)
  consensus?: string; // "Strong Buy", "Hold", etc.
  overallScore?: number | null; // 0-10 (Neural Score)
  peRatio: number | null;
  newsSentiment?: string | null;  // New
  newsImpact?: number | null;     // New
}

/**
 * The Architect-Level Weighted Verdict Algorithm.
 *
 * Calculates a Composite Score (0-100) based on multiple weighted factors:
 * 1. Risk Penalty: High risk penalizes score heavily.
 * 2. Asymmetric Risk/Reward: Downside is weighted more strictly than upside (Loss Aversion).
 * 3. Analyst Consensus: Aligns with or fades the neural verdict based on Wall St.
 * 4. P/E Ratio: Rewards value (low positive PE), penalizes overvaluation or losses.
 *
 * Score Tiers:
 * >= 80: Strong Buy
 * >= 65: Buy
 * >= 45: Hold
 * < 45: Sell
 */
export function calculateAiRating(input: VerdictInput): RatingResult {
  const { risk, upside, consensus, overallScore, peRatio, newsSentiment, newsImpact } = input;
  const downside = input.downside ?? 0;

  let score = 50; // Base Score

  // 1. Upside Impact (Max +30)
  const cappedUpside = Math.min(upside, 100);
  score += Math.max(0, cappedUpside * 0.4);

  // 2. Downside Impact (Max -40) - LOSS AVERSION
  const absDownside = Math.abs(downside);
  score -= Math.min(40, absDownside * 0.8);

  // 3. Risk Penalty / Bonus
  if (risk >= 8) score -= 20;
  else if (risk >= 6) score -= 10;
  else if (risk <= 3) score += 5;

  // 4. Neural Score Bonus (Weight Increased)
  if (overallScore) {
    if (overallScore >= 8) score += 20; // Was +10
    else if (overallScore >= 6) score += 10; // Was +5
    else if (overallScore <= 4) score -= 10; // Was -5
  }

  // 5. Analyst Consensus Integration
  if (consensus) {
    const cLower = consensus.toLowerCase();
    if (cLower.includes('strong buy')) score += 10;
    else if (cLower.includes('buy')) score += 5;
    else if (cLower.includes('sell')) score -= 10;
  }

  // 6. Smart News Integration (High Impact Only)
  if (input.newsImpact && input.newsImpact >= 8 && input.newsSentiment) {
      if (input.newsSentiment === 'BULLISH') score += 15; // Major Catalyst
      else if (input.newsSentiment === 'BEARISH') score -= 15; // Major Risk
  } else if (input.newsImpact && input.newsImpact >= 5 && input.newsSentiment) {
      if (input.newsSentiment === 'BULLISH') score += 5;
      else if (input.newsSentiment === 'BEARISH') score -= 5;
  }

  // 7. P/E Ratio Impact (Value Investing) - Only reward value, don't punish growth/pre-revenue
  if (typeof peRatio === 'number' && peRatio > 0) {
    // Positive P/E = profitable company
    if (peRatio <= 10) score += 20; // Exceptional Value
    else if (peRatio <= 15) score += 15; // Great Value
    else if (peRatio <= 25) score += 5; // Fair Value
    // Higher P/E = no bonus, but no penalty either
  }
  // Missing P/E (pre-revenue) or negative (loss-making) = neutral, no penalty

  // Verdict Determination
  // Hard Veto: If risk is Extreme (9+) and no massive redeeming qualities, kill it.
  if (risk >= 9 && score < 70) {
    return { rating: 'Sell', variant: 'sell', score };
  }

  // Speculative Buy Override
  // High Risk (>=8) but High Reward (Upside >= 100 OR Neural >= 7.5)
  if (risk >= 8 && (upside >= 100 || (overallScore && overallScore >= 7.5))) {
    return { rating: 'Speculative Buy', variant: 'speculativeBuy', score };
  }

  if (score >= 80) return { rating: 'Strong Buy', variant: 'strongBuy', score };
  if (score >= 65) return { rating: 'Buy', variant: 'buy', score };
  if (score >= 45) return { rating: 'Hold', variant: 'hold', score };

  return { rating: 'Sell', variant: 'sell', score };
}

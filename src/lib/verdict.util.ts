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
  peRatio?: number | null; // P/E Ratio
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
  const { risk, upside, consensus, overallScore, peRatio } = input;
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

  // 4. Neural Score Bonus
  if (overallScore) {
    if (overallScore >= 8) score += 10;
    else if (overallScore >= 6) score += 5;
    else if (overallScore <= 4) score -= 5;
  }

  // 5. Analyst Consensus Integration
  if (consensus) {
    const cLower = consensus.toLowerCase();
    if (cLower.includes('strong buy')) score += 10;
    else if (cLower.includes('buy')) score += 5;
    else if (cLower.includes('sell')) score -= 10;
  }

  // 6. P/E Ratio Impact (Value Investing)
  if (peRatio === undefined || peRatio === null) {
    score -= 10; // Penalty for missing P/E (Pre-revenue / Unknown)
  } else if (peRatio < 0) {
    score -= 10; // Unprofitable / Loss making
  } else {
    if (peRatio < 15) score += 15;
    else if (peRatio < 30) score += 5;
    else if (peRatio > 60) score -= 15;
    else if (peRatio > 40) score -= 5;
  }

  // Verdict Determination
  // Hard Veto: If risk is Extreme (9+) and no massive redeeming qualities, kill it.
  if (risk >= 9 && score < 70) {
    return { rating: 'Sell', variant: 'sell', score };
  }

  // Speculative Buy Override
  if (risk >= 8 && (upside >= 100 || (overallScore && overallScore >= 7.5))) {
    return { rating: 'Speculative Buy', variant: 'speculativeBuy', score };
  }

  if (score >= 80) return { rating: 'Strong Buy', variant: 'strongBuy', score };
  if (score >= 65) return { rating: 'Buy', variant: 'buy', score };
  if (score >= 45) return { rating: 'Hold', variant: 'hold', score };

  return { rating: 'Sell', variant: 'sell', score };
}

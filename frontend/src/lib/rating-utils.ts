export type RatingVariant = 'default' | 'strongBuy' | 'buy' | 'hold' | 'sell' | 'speculativeBuy' | 'outline';

export interface RatingResult {
  rating: string;
  variant: RatingVariant;
  score?: number;
}

/**
 * Extracts the Base Case mid-price from a list of scenarios (case-insensitive).
 */
export function getBasePriceFromScenarios(scenarios: Array<{ scenario_type: string; price_mid: number | string }> | undefined | null): number | null {
  if (!scenarios || !Array.isArray(scenarios)) return null;
  const base = scenarios.find(s => s.scenario_type?.toLowerCase() === 'base');
  return base && base.price_mid ? Number(base.price_mid) : null;
}

/**
 * The Standardized "Upside" Calculator.
 * 
 * Logic Order:
 * 1. If we have a Live Price and a Base Case Target -> Calculate Live Upside.
 * 2. Else -> Use the Pre-calculated 'upside_percent' from the Backend/Snapshot.
 * 3. Fallback -> 0.
 * 
 * This ensures that if the price moves, the verdict updates instantly, but if data is missing, we trust the DB.
 */
export function calculateLiveUpside(
  currentPrice: number, 
  baseTargetPrice: number | null | undefined, 
  backendPrecalculatedUpside: number | null | undefined
): number {
  if (currentPrice > 0 && typeof baseTargetPrice === 'number' && baseTargetPrice > 0) {
    return ((baseTargetPrice - currentPrice) / currentPrice) * 100;
  }
  return Number(backendPrecalculatedUpside ?? 0);
}

export function calculateLiveDownside(
  currentPrice: number,
  bearTargetPrice: number | null | undefined,
  backendFinancialRisk: number
): number {
    if (currentPrice > 0 && typeof bearTargetPrice === 'number' && bearTargetPrice > 0) {
        return ((bearTargetPrice - currentPrice) / currentPrice) * 100;
    }
    // Fallback estimation based on risk if no explicit bear target
    // Risk 10 = -50%, Risk 0 = 0%
    return -(backendFinancialRisk * 5); 
}

// Deprecated: Alias for legacy compatibility until full refactor, pointing to the new logic
export function calculateUpside(currentPrice: number, target: number | null | undefined, fallback?: number | null | undefined): number {
    return calculateLiveUpside(currentPrice, target, fallback);
}

/**
 * Centralized logic for calculating AI Rating based on Financial Risk and Potential Upside.
 * 
 * IMPORTANT: Always pass the "live" calculated upside to ensure accuracy.
 * 
 * Rules:
 * - High Overall Neural Score (>= 7.5) or Extreme Upside (>= 100%) and High Risk (>= 8) -> Speculative Buy
 * - High Risk (>= 8) or Negative Upside (< 0) -> Sell
 * - Upside > 20% and Risk <= 6 -> Strong Buy
 * - Upside > 10% and Risk <= 7 -> Buy
 * - Otherwise -> Hold
 */
/**
 * Input for the Weighted Verdict Algorithm
 */
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
export function calculateAiRating(
    riskOrInput: number | VerdictInput, 
    upsideArg?: number, 
    overallScoreArg?: number | null
): RatingResult {
    let input: VerdictInput;

    // Support legacy signature (risk, upside, overallScore) for incremental migration
    if (typeof riskOrInput === 'number') {
        input = {
            risk: riskOrInput,
            upside: upsideArg ?? 0,
            overallScore: overallScoreArg
        };
    } else {
        input = riskOrInput;
    }

    const { risk, upside, consensus, overallScore, peRatio } = input;
    const downside = input.downside ?? 0;

    let score = 50; // Base Score

    // 1. Upside Impact (Max +30)
    // Diminishing returns after 50% upside to prevent "YOLO" coins breaking the scale
    const cappedUpside = Math.min(upside, 100); 
    score += Math.max(0, cappedUpside * 0.4); 
    
    // 2. Downside Impact (Max -40) - LOSS AVERSION
    // We punish downside harder than we reward upside.
    // If downside is -50%, impact is -50 * 0.8 = -40. 
    const absDownside = Math.abs(downside);
    score -= Math.min(40, absDownside * 0.8);

    // 3. Risk Penalty / Bonus
    if (risk >= 8) score -= 20;      // Extreme penalty for high risk
    else if (risk >= 6) score -= 10; // Moderate penalty
    else if (risk <= 3) score += 5;  // Safety bonus

    // 4. Neural Score Bonus (The "AI" part)
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
        // Hold is neutral (0)
    }

    // 6. P/E Ratio Impact (Value Investing)
    if (peRatio === undefined || peRatio === null) {
        score -= 10; // Penalty for missing P/E (Pre-revenue / Unknown)
    } else if (peRatio < 0) {
        score -= 10; // Unprofitable / Loss making
    } else {
        // Positive P/E
        if (peRatio < 15) score += 15;      // Great Value
        else if (peRatio < 30) score += 5;  // Fair Value
        else if (peRatio > 60) score -= 15; // Extremely Overvalued
        else if (peRatio > 40) score -= 5;  // Overvalued
    }

    // -------------------------------------------------------------------------
    // Verdict Determination
    // -------------------------------------------------------------------------

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

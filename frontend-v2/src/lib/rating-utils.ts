export type RatingVariant = 'default' | 'strongBuy' | 'buy' | 'hold' | 'sell' | 'speculativeBuy' | 'legendary' | 'outline';

export interface RatingResult {
  rating: string;
  variant: RatingVariant;
  score?: number;
  fiftyTwoWeekScore?: number;
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
 * Scenario price target with probability for the enhanced verdict algorithm.
 */
export interface ScenarioInput {
    probability: number; // 0-1 (e.g. 0.25 for 25%)
    price: number;       // Target price for this scenario
}

/**
 * Input for the Weighted Verdict Algorithm.
 * 
 * When `scenarios` and `currentPrice` are provided, the algorithm uses 
 * probability-weighted expected returns with Loss Aversion (LAF = 2.0x).
 * Otherwise, falls back to legacy upside/downside-based calculation.
 */
export interface VerdictInput {
    risk: number; // 0-10
    upside: number; // Percentage (e.g. 50.5 for 50.5%) - used as fallback
    downside?: number; // Percentage (e.g. -20.0 for -20%) - used as fallback
    consensus?: string; // "Strong Buy", "Hold", etc.
    overallScore?: number | null; // 0-10 (Neural Score)
    peRatio?: number | null; // P/E Ratio
    newsSentiment?: string | null;  // New
    newsImpact?: number | null;     // New
    
    // NEW: Probability-weighted scenario data
    scenarios?: {
        bull?: ScenarioInput;
        base?: ScenarioInput;
        bear?: ScenarioInput;
    };
    currentPrice?: number;
    // NEW: ATH and Revenue Data for penalties
    fiftyTwoWeekHigh?: number | null;
    fiftyTwoWeekLow?: number | null; // NEW
    revenueTTM?: number | null;
}

/** Loss Aversion Factor - downside is penalized 2x vs upside (behavioral economics) */
const LOSS_AVERSION_FACTOR = 2.0;

/** Default probabilities when not provided: Bull 25%, Base 50%, Bear 25% */
const DEFAULT_PROBABILITIES = { bull: 0.25, base: 0.50, bear: 0.25 };

/**
 * Calculate the return percentage for a given scenario.
 */
function calculateScenarioReturn(targetPrice: number, currentPrice: number): number {
    if (currentPrice <= 0) return 0;
    return ((targetPrice - currentPrice) / currentPrice) * 100;
}

/**
 * Calculate probability-weighted expected return with loss aversion.
 * 
 * Returns: { weightedReturn, lossAdjustedReturn, skewRatio }
 */
export function calculateProbabilityWeightedMetrics(
    scenarios: { bull?: ScenarioInput; base?: ScenarioInput; bear?: ScenarioInput },
    currentPrice: number
): { weightedReturn: number; lossAdjustedReturn: number; skewRatio: number } {
    if (currentPrice <= 0) {
        return { weightedReturn: 0, lossAdjustedReturn: 0, skewRatio: 1 };
    }

    // Extract scenario data with defaults
    const bullProb = scenarios.bull?.probability ?? DEFAULT_PROBABILITIES.bull;
    const baseProb = scenarios.base?.probability ?? DEFAULT_PROBABILITIES.base;
    const bearProb = scenarios.bear?.probability ?? DEFAULT_PROBABILITIES.bear;

    const bullPrice = scenarios.bull?.price ?? currentPrice * 1.25;
    const basePrice = scenarios.base?.price ?? currentPrice;
    const bearPrice = scenarios.bear?.price ?? currentPrice * 0.75;

    // Calculate returns for each scenario
    const bullReturn = calculateScenarioReturn(bullPrice, currentPrice);
    const baseReturn = calculateScenarioReturn(basePrice, currentPrice);
    const bearReturn = calculateScenarioReturn(bearPrice, currentPrice);

    // 1. Simple probability-weighted expected return
    const weightedReturn = 
        bullProb * bullReturn +
        baseProb * baseReturn +
        bearProb * bearReturn;

    // 2. Loss-adjusted return (LAF = 2.0 for negative returns)
    const applyLAF = (ret: number) => ret < 0 ? ret * LOSS_AVERSION_FACTOR : ret;
    const lossAdjustedReturn = 
        bullProb * applyLAF(bullReturn) +
        baseProb * applyLAF(baseReturn) +
        bearProb * applyLAF(bearReturn);

    // 3. Skew Ratio: Bull contribution / Bear contribution (higher = more favorable asymmetry)
    const bullContribution = bullProb * Math.max(0, bullReturn);
    const bearContribution = bearProb * Math.abs(Math.min(0, bearReturn));
    const skewRatio = bearContribution > 0 ? bullContribution / bearContribution : 10;

    return { weightedReturn, lossAdjustedReturn, skewRatio };
}

/**
 * The Architect-Level Weighted Verdict Algorithm.
 * 
 * Calculates a Composite Score (0-100) based on multiple weighted factors:
 * 1. Probability-Weighted Expected Return with Loss Aversion (when scenarios provided)
 * 2. Risk Penalty: High risk penalizes score heavily.
 * 3. Skew Bonus/Penalty: Favorable/unfavorable risk-reward asymmetry.
 * 4. Analyst Consensus: Aligns with or fades the neural verdict based on Wall St.
 * 5. P/E Ratio: Rewards value (low positive PE), penalizes overvaluation or losses.
 * 
 * Score Tiers:
 * >= 80: Strong Buy
 * >= 65: Buy
 * >= 45: Hold
 * < 45: Sell
 */
// 0-10 Impact Score from AI
export function calculateAiRating(
    riskOrInput: number | VerdictInput,
    upsideArg?: number,
    overallScoreArg?: number | null | undefined, // Added parameter
    downsideArg: number = 0,
    consensusArg?: string | null,
    peArg?: number | null,
    newsSentimentArg?: string | null,
    newsImpactArg?: number | null
): RatingResult {
    // 1. Normalize Input
    let risk: number;
    let upside: number;
    let overallScore: number | null | undefined;
    let downside: number;
    let consensus: string | null | undefined;
    let pe: number | null | undefined;
    let newsSentiment: string | null | undefined;
    let newsImpact: number | null | undefined;

    if (typeof riskOrInput === 'object') {
        const i = riskOrInput;
        risk = i.risk;
        upside = i.upside;
        overallScore = i.overallScore;
        downside = i.downside ?? 0;
        consensus = i.consensus;
        pe = i.peRatio;
        newsSentiment = i.newsSentiment;
        newsImpact = i.newsImpact;
    } else {
        risk = riskOrInput;
        upside = upsideArg!;
        overallScore = overallScoreArg;
        downside = downsideArg;
        consensus = consensusArg;
        pe = peArg;
        newsSentiment = newsSentimentArg;
        newsImpact = newsImpactArg;
        // Legacy call - no penalties
    }

    // NEW: Probability-Weighted integration
    let weightedUpside = upside;
    const weightedDownside = downside;
    let skewBonus = 0;

    if (typeof riskOrInput === 'object' && riskOrInput.scenarios && riskOrInput.currentPrice) {
        const metrics = calculateProbabilityWeightedMetrics(riskOrInput.scenarios, riskOrInput.currentPrice);
        
        // We use loss-adjusted return for the main score impact
        weightedUpside = metrics.lossAdjustedReturn;
        
        // Downside is already factored into lossAdjustedReturn, but we can extract separate downside 
        // impact for the verdict logic if needed. For now, weightedUpside is the primary driver.
        
        // Skew Bonus: Reward favorable asymmetry (Skew > 1.5)
        if (metrics.skewRatio > 1.5) {
            skewBonus = Math.min(10, (metrics.skewRatio - 1.5) * 5);
        } else if (metrics.skewRatio < 0.6) {
            // Penalty for unfavorable skew (downside risk significantly higher than upside potential)
            skewBonus = -10; 
        }
    }

    let score = 50; // Base Score
    const effectiveUpside = weightedUpside;

    // 1. Upside Impact (Max +40)
    // If it's probability-weighted, we allow it to drive the score more directly
    const cappedUpside = Math.min(Math.max(-50, weightedUpside), 100); 
    score += cappedUpside * 0.4; 
    
    // 2. Downside Impact (Max -40) - LOSS AVERSION
    // If weighted, downside is already partially in the lossAdjustedReturn, 
    // but we can still penalize high catastrophic downside if explicitly passed.
    const absDownside = Math.abs(weightedDownside);
    score -= Math.min(40, absDownside * 0.4);

    // 2.5 Add Skew Bonus
    score += skewBonus;

    // 3. Risk Penalty / Bonus
    if (risk >= 8) score -= 20;      // Extreme penalty for high risk
    else if (risk >= 6) score -= 10; // Moderate penalty
    else if (risk <= 3) score += 5;  // Safety bonus

    // 3.5. 52-Week High Penalty (Progressive)
    // Buying at the top?
    if (typeof riskOrInput === 'object' && riskOrInput.currentPrice && riskOrInput.fiftyTwoWeekHigh && riskOrInput.fiftyTwoWeekHigh > 0) {
        const { currentPrice, fiftyTwoWeekHigh } = riskOrInput;
        if (currentPrice >= 0.98 * fiftyTwoWeekHigh) {
            score -= 20; // Extreme High
        } else if (currentPrice >= 0.90 * fiftyTwoWeekHigh) {
            score -= 10; // Very High
        } else if (currentPrice >= 0.80 * fiftyTwoWeekHigh) {
            score -= 5;  // High
        }
    }

    // 3.6. 52-Week Low Reward (Buy the Dip)
    // Reward value/dip buying, but avoid "Falling Knives"
    if (typeof riskOrInput === 'object' && riskOrInput.currentPrice && riskOrInput.fiftyTwoWeekLow && riskOrInput.fiftyTwoWeekLow > 0) {
        const { currentPrice, fiftyTwoWeekLow, fiftyTwoWeekHigh, consensus, downside } = riskOrInput;
        const actualDownside = downside ?? 0;
        
        const isFallingKnife = consensus?.toLowerCase().includes('sell') && actualDownside <= -99;
        
        // Calculate Position in Range (0.0 = Low, 1.0 = High)
        let positionInRange = 1.0;
        if (fiftyTwoWeekHigh && fiftyTwoWeekHigh > fiftyTwoWeekLow) {
            positionInRange = (currentPrice - fiftyTwoWeekLow) / (fiftyTwoWeekHigh - fiftyTwoWeekLow);
        }

        if (!isFallingKnife) {
            // Tier 1: Bottom 5% of Range OR < 5% from Low (Deep Value)
            if (currentPrice <= 1.05 * fiftyTwoWeekLow || positionInRange <= 0.05) {
                score += 10; 
            } 
            // Tier 2: Bottom 20% of Range OR < 25% from Low (Value Zone)
            else if (currentPrice <= 1.25 * fiftyTwoWeekLow || positionInRange <= 0.20) {
                score += 5;  
            }
        }
    }

    // 3.7. No Revenue Penalty (Speculative/Pre-revenue)
    if (typeof riskOrInput === 'object' && (riskOrInput.revenueTTM === 0 || riskOrInput.revenueTTM === null || riskOrInput.revenueTTM === undefined)) {
        score -= 5;
    }

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
        // Hold is neutral (0)
    }

    // 6. Smart News Integration (High Impact Only)
    if (newsImpact && newsImpact >= 8 && newsSentiment) {
        if (newsSentiment === 'BULLISH') score += 15; // Major Catalyst
        else if (newsSentiment === 'BEARISH') score -= 15; // Major Risk
    } else if (newsImpact && newsImpact >= 5 && newsSentiment) {
        if (newsSentiment === 'BULLISH') score += 5;
        else if (newsSentiment === 'BEARISH') score -= 5;
    }

    // 7. P/E Ratio Impact - Only reward value, don't punish growth/pre-revenue
    if (typeof pe === 'number' && pe > 0) {
        // Positive P/E = profitable company
        if (pe <= 10) score += 20;       // Exceptional Value
        else if (pe <= 15) score += 15;  // Great Value
        else if (pe <= 25) score += 5;   // Fair Value
        // Higher P/E = no bonus, but no penalty either
    }
    // Missing P/E (pre-revenue) or negative (loss-making) = neutral, no penalty

    // -------------------------------------------------------------------------
    // Verdict Determination
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // Verdict Determination
    // -------------------------------------------------------------------------

    // Capture the 52-week score impact for the tooltip
    // We recreate the logic here to isolate the value for display since it was applied inline above
    let fiftyTwoWeekScore = 0;
    
    // High Penalty
    if (typeof riskOrInput === 'object' && riskOrInput.currentPrice && riskOrInput.fiftyTwoWeekHigh && riskOrInput.fiftyTwoWeekHigh > 0) {
        const { currentPrice, fiftyTwoWeekHigh } = riskOrInput;
        if (currentPrice >= 0.98 * fiftyTwoWeekHigh) fiftyTwoWeekScore -= 20;
        else if (currentPrice >= 0.90 * fiftyTwoWeekHigh) fiftyTwoWeekScore -= 10;
        else if (currentPrice >= 0.80 * fiftyTwoWeekHigh) fiftyTwoWeekScore -= 5;
    }

    // Low Reward
    if (typeof riskOrInput === 'object' && riskOrInput.currentPrice && riskOrInput.fiftyTwoWeekLow && riskOrInput.fiftyTwoWeekLow > 0) {
        const { currentPrice, fiftyTwoWeekLow, fiftyTwoWeekHigh, consensus, downside } = riskOrInput;
        const actualDownside = downside ?? 0;
        const isFallingKnife = consensus?.toLowerCase().includes('sell') && actualDownside <= -99;
        
        // Calculate Position in Range
        let positionInRange = 1.0;
        if (fiftyTwoWeekHigh && fiftyTwoWeekHigh > fiftyTwoWeekLow) {
            positionInRange = (currentPrice - fiftyTwoWeekLow) / (fiftyTwoWeekHigh - fiftyTwoWeekLow);
        }

        if (!isFallingKnife) {
            if (currentPrice <= 1.05 * fiftyTwoWeekLow || positionInRange <= 0.05) fiftyTwoWeekScore += 10;
            else if (currentPrice <= 1.25 * fiftyTwoWeekLow || positionInRange <= 0.20) fiftyTwoWeekScore += 5;
        }
    }

    // Speculative Buy Override
    // High Risk (>=8) but High Reward (Upside >= 100 OR Neural >= 7.5)
    // Moved BEFORE Hard Veto to allow high-upside plays (YOLO) to exist.
    if (risk >= 8 && (effectiveUpside >= 100 || (overallScore && overallScore >= 7.5))) {
        return { rating: 'Speculative Buy', variant: 'speculativeBuy', score, fiftyTwoWeekScore };
    }

    // Hard Veto: If risk is Extreme (9+) and no massive redeeming qualities, kill it.
    if (risk >= 9 && score < 70) {
        return { rating: 'Sell', variant: 'sell', score, fiftyTwoWeekScore };
    }

    if (score > 105) return { rating: 'No Brainer', variant: 'legendary', score, fiftyTwoWeekScore };
    if (score >= 80) return { rating: 'Strong Buy', variant: 'strongBuy', score, fiftyTwoWeekScore };
    if (score >= 65) return { rating: 'Buy', variant: 'buy', score, fiftyTwoWeekScore };
    if (score >= 45) return { rating: 'Hold', variant: 'hold', score, fiftyTwoWeekScore };
    
    return { rating: 'Sell', variant: 'sell', score, fiftyTwoWeekScore };
}

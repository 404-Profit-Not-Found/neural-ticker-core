export type RatingVariant = 'default' | 'strongBuy' | 'buy' | 'hold' | 'sell' | 'speculativeBuy' | 'outline';

export interface RatingResult {
  rating: string;
  variant: RatingVariant;
}

/**
 * Helper to calculate live upside percentage against a target price.
 */
export function calculateUpside(currentPrice: number, targetPrice: number | null | undefined, fallbackUpside?: number | null): number {
  if (typeof targetPrice === 'number' && currentPrice > 0) {
    return ((targetPrice - currentPrice) / currentPrice) * 100;
  }
  return Number(fallbackUpside ?? 0);
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
export function calculateAiRating(risk: number, upside: number, overallScore?: number | null): RatingResult {
  // 1. Speculative Buy / YOLO Override (Highest Priority for risky plays)
  if (risk >= 8 && ((overallScore && overallScore >= 7.5) || upside >= 100)) {
    return { rating: 'Speculative Buy', variant: 'speculativeBuy' };
  }

  // 2. Sell Overrides (High Risk or Negative Upside)
  if (upside < 0 || risk >= 8) {
    return { rating: 'Sell', variant: 'sell' };
  }

  // 3. Strong Buy
  if (upside > 20 && risk <= 6) {
    return { rating: 'Strong Buy', variant: 'strongBuy' };
  }

  // 4. Buy
  if (upside > 10 && risk <= 7) {
    return { rating: 'Buy', variant: 'buy' };
  }

  return { rating: 'Hold', variant: 'hold' };
}

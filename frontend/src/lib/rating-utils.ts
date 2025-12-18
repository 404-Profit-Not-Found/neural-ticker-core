export type RatingVariant = 'default' | 'strongBuy' | 'buy' | 'hold' | 'sell' | 'outline';

export interface RatingResult {
  rating: string;
  variant: RatingVariant;
}

/**
 * Centralized logic for calculating AI Rating based on Financial Risk and Potential Upside.
 * 
 * Rules:
 * - High Risk (>= 8) or Negative Upside (< 0) -> Sell
 * - Upside > 20% and Risk <= 6 -> Strong Buy
 * - Upside > 10% and Risk <= 7 -> Buy
 * - Otherwise -> Hold
 */
export function calculateAiRating(risk: number, upside: number): RatingResult {
  const rating = 'Hold';
  const variant: RatingVariant = 'hold';

  // Overrides (Sell condition first)
  if (upside < 0 || risk >= 8) {
    return { rating: 'Sell', variant: 'sell' };
  }

  // Strong Buy
  if (upside > 20 && risk <= 6) {
    return { rating: 'Strong Buy', variant: 'strongBuy' };
  }

  // Buy
  if (upside > 10 && risk <= 7) {
    return { rating: 'Buy', variant: 'buy' };
  }

  return { rating, variant };
}

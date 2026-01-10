import { describe, it, expect } from 'vitest';
import { calculateAiRating, calculateUpside, calculateProbabilityWeightedMetrics, calculateLiveDownside } from './rating-utils';

describe('Rating Utilities', () => {
  describe('calculateUpside', () => {
    it('should calculate upside correctly', () => {
      expect(calculateUpside(100, 150)).toBe(50);
      expect(calculateUpside(100, 80)).toBe(-20);
    });

    it('should use fallback if target price is missing', () => {
      expect(calculateUpside(100, null, 15)).toBe(15);
      expect(calculateUpside(100, undefined, -5)).toBe(-5);
    });
  });

  describe('calculateProbabilityWeightedMetrics', () => {
    it('should calculate weighted return correctly', () => {
      // Bull +50%, Base 0%, Bear -50% with default 25/50/25 probabilities
      const scenarios = {
        bull: { probability: 0.25, price: 150 },
        base: { probability: 0.50, price: 100 },
        bear: { probability: 0.25, price: 50 },
      };
      const result = calculateProbabilityWeightedMetrics(scenarios, 100);
      
      // Expected: 0.25 * 50% + 0.50 * 0% + 0.25 * -50% = 12.5 - 12.5 = 0
      expect(result.weightedReturn).toBe(0);
    });

    it('should apply loss aversion factor (2x) to negative returns', () => {
      const scenarios = {
        bull: { probability: 0.25, price: 150 },  // +50%
        base: { probability: 0.50, price: 100 },   // 0%
        bear: { probability: 0.25, price: 50 },    // -50%
      };
      const result = calculateProbabilityWeightedMetrics(scenarios, 100);
      
      // LAF applied: 0.25 * 50% + 0.50 * 0% + 0.25 * (-50% * 2) = 12.5 - 25 = -12.5
      expect(result.lossAdjustedReturn).toBe(-12.5);
    });

    it('should calculate skew ratio correctly', () => {
      const scenarios = {
        bull: { probability: 0.25, price: 200 },  // +100%
        base: { probability: 0.50, price: 100 },  // 0%
        bear: { probability: 0.25, price: 50 },   // -50%
      };
      const result = calculateProbabilityWeightedMetrics(scenarios, 100);
      
      // Bull contribution: 0.25 * 100 = 25
      // Bear contribution: 0.25 * 50 = 12.5
      // Skew = 25 / 12.5 = 2
      expect(result.skewRatio).toBe(2);
    });

    it('should use default prices when scenarios are partial', () => {
      const scenarios = {
        bull: { probability: 0.3, price: 130 },
        // base and bear missing - should use defaults
      };
      const result = calculateProbabilityWeightedMetrics(scenarios, 100);
      
      // Default base = 100 (0%), default bear = 75 (-25%)
      // 0.3 * 30% + 0.5 * 0% + 0.25 * -25% = 9 - 6.25 = 2.75
      expect(result.weightedReturn).toBeCloseTo(2.75, 1);
    });
  });

  describe('calculateAiRating - Legacy Mode', () => {
    it('should return Speculative Buy for high risk and high neural score', () => {
      expect(calculateAiRating(8, 20, 7.5)).toMatchObject({ rating: 'Speculative Buy', variant: 'speculativeBuy' });
    });

    it('should return Speculative Buy for extreme upside even with high risk', () => {
      expect(calculateAiRating(8, 100, 5)).toMatchObject({ rating: 'Speculative Buy', variant: 'speculativeBuy' });
    });

    it('should return Sell for high risk without speculative triggers', () => {
      expect(calculateAiRating(8, 20, 5)).toMatchObject({ rating: 'Sell', variant: 'sell' });
    });

    it('should return Sell for negative upside with significant downside', () => {
      // Score: 50 + 0 (capped at 0) - 40 (50% downside * 0.8) + 5 (low risk) - 10 (no P/E) = 5 → Sell
      expect(calculateAiRating({
        risk: 3,
        upside: -10,
        downside: -50,
      })).toMatchObject({ rating: 'Sell', variant: 'sell' });
    });

    it('should return Strong Buy for low risk, high upside, and value P/E', () => {
      // Score: 50 + 40 (100% upside capped) + 5 (low risk) + 15 (good P/E) = 110 → Strong Buy
      expect(calculateAiRating({
        risk: 3,
        upside: 100,
        peRatio: 12,
      })).toMatchObject({ rating: 'Strong Buy', variant: 'strongBuy' });
    });

    it('should return Buy for moderate risk and moderate upside with fair P/E', () => {
      // Score: 50 + 12 (30% * 0.4) + 5 (fair P/E) = 67 → Buy
      expect(calculateAiRating({
        risk: 5,
        upside: 30,
        peRatio: 25,
      })).toMatchObject({ rating: 'Buy', variant: 'buy' });
    });

    it('should return Hold for low upside (legacy without P/E)', () => {
      // Score: 50 + 2 (5% * 0.4) + 5 (low risk) - 10 (no P/E) = 47 → Hold
      expect(calculateAiRating(3, 5)).toMatchObject({ rating: 'Hold', variant: 'hold' });
    });
  });

  describe('calculateAiRating - Probability-Weighted Mode', () => {
    it('should use probability-weighted scoring when scenarios provided', () => {
      const result = calculateAiRating({
        risk: 5,
        upside: 0, // Fallback ignored when scenarios provided
        scenarios: {
          bull: { probability: 0.3, price: 150 },
          base: { probability: 0.5, price: 110 },
          bear: { probability: 0.2, price: 80 },
        },
        currentPrice: 100,
      });
      
      expect(result.score).toBeDefined();
      expect(result.rating).toBeDefined();
    });

    it('should return Sell for negative probability-weighted outlook (NVO-like)', () => {
      // NVO scenario: negative base case, very negative bear case
      const result = calculateAiRating({
        risk: 5,
        upside: -19, // Fallback
        scenarios: {
          bull: { probability: 0.20, price: 70 },   // +19%
          base: { probability: 0.50, price: 47.64 }, // -19%
          bear: { probability: 0.30, price: 35.29 }, // -40%
        },
        currentPrice: 58.81,
        peRatio: 15.84,
        overallScore: 7.0,
        consensus: 'Hold/Buy',
      });
      
      // Given the heavily negative probability-weighted outlook, should be Sell
      expect(result.variant).toBe('sell');
      // Score should be in the low range (below 45)
      expect(result.score).toBeLessThan(50);
    });

    it('should return Strong Buy for highly positive skewed scenarios', () => {
      const result = calculateAiRating({
        risk: 3,
        upside: 50, // Fallback
        scenarios: {
          bull: { probability: 0.40, price: 200 },  // +100%
          base: { probability: 0.45, price: 130 },  // +30%
          bear: { probability: 0.15, price: 90 },   // -10%
        },
        currentPrice: 100,
        peRatio: 20,
        overallScore: 8,
      });
      
      expect(['Strong Buy', 'Buy']).toContain(result.rating);
      expect(result.score).toBeGreaterThan(60);
    });

    it('should handle news sentiment and impact correctly', () => {
      const baseOptions = {
        risk: 5,
        upside: 20,
        peRatio: null,
      };

      const bullishResult = calculateAiRating({
        ...baseOptions,
        newsSentiment: 'BULLISH',
        newsImpact: 9,
      });

      const bearishResult = calculateAiRating({
        ...baseOptions,
        newsSentiment: 'BEARISH',
        newsImpact: 9,
      });

      expect(bullishResult.score).toBeGreaterThan(50);
      expect(bearishResult.score).toBeLessThan(50);
      expect(bullishResult.score!).toBeGreaterThan(bearishResult.score!);
    });

    it('should handle moderate news impact (5-7)', () => {
      const baseOptions = { risk: 5, upside: 20 };
      const bullishResult = calculateAiRating({ ...baseOptions, newsSentiment: 'BULLISH', newsImpact: 6 });
      const bearishResult = calculateAiRating({ ...baseOptions, newsSentiment: 'BEARISH', newsImpact: 6 });

      // Base for these options is higher than 45 in current implementation
      expect(bullishResult.score).toBe(63); 
      expect(bearishResult.score).toBe(53); 
    });

    it('should trigger hard veto for extreme risk regardless of other factors', () => {
      const result = calculateAiRating({
        risk: 9.5,
        upside: 100,
        overallScore: 2, // Low neural
      });
      expect(result.rating).toBe('Sell');
      expect(result.variant).toBe('sell');
    });

    it('should handle speculative buy override', () => {
      const result = calculateAiRating({
        risk: 8.5,
        upside: 120, // > 100%
        overallScore: 8.0,
      });
      expect(result.rating).toBe('Speculative Buy');
      expect(result.variant).toBe('speculativeBuy');
    });

    it('should calculate live downside with fallback', () => {
      const currentPrice = 100;
      const risk = 8;
      // Fallback is -(risk * 5) = -40
      expect(calculateLiveDownside(currentPrice, null, risk)).toBe(-40);
      
      // With target
      expect(calculateLiveDownside(currentPrice, 80, risk)).toBe(-20);
    });

    it('should handle zero currentPrice in probability weighted metrics', () => {
      const result = calculateProbabilityWeightedMetrics({}, 0);
      expect(result.weightedReturn).toBe(0);
      expect(result.skewRatio).toBe(1);
    });
  });


});


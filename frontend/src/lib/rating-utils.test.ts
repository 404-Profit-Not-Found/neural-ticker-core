import { describe, it, expect } from 'vitest';
import { calculateAiRating, calculateUpside } from './rating-utils';

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

  describe('calculateAiRating', () => {
    it('should return Speculative Buy for high risk and high neural score', () => {
      expect(calculateAiRating(8, 20, 7.5)).toEqual({ rating: 'Speculative Buy', variant: 'speculativeBuy' });
    });

    it('should return Speculative Buy for extreme upside even with high risk', () => {
      expect(calculateAiRating(8, 100, 5)).toEqual({ rating: 'Speculative Buy', variant: 'speculativeBuy' });
    });

    it('should return Sell for high risk without speculative triggers', () => {
      expect(calculateAiRating(8, 20, 5)).toEqual({ rating: 'Sell', variant: 'sell' });
    });

    it('should return Sell for negative upside', () => {
      expect(calculateAiRating(3, -5)).toEqual({ rating: 'Sell', variant: 'sell' });
    });

    it('should return Strong Buy for low risk and high upside', () => {
      expect(calculateAiRating(3, 25)).toEqual({ rating: 'Strong Buy', variant: 'strongBuy' });
    });

    it('should return Buy for moderate risk and moderate upside', () => {
      expect(calculateAiRating(5, 15)).toEqual({ rating: 'Buy', variant: 'buy' });
    });

    it('should return Hold for low upside', () => {
      expect(calculateAiRating(3, 5)).toEqual({ rating: 'Hold', variant: 'hold' });
    });
  });
});

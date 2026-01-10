import { calculateAiRating } from './verdict.util';

describe('VerdictUtil', () => {
  describe('calculateAiRating', () => {
    it('should return Strong Buy for high upside, low risk, and positive factors', () => {
      const result = calculateAiRating({
        risk: 2,
        upside: 40,
        downside: -5,
        overallScore: 9,
        peRatio: 8,
        consensus: 'Strong Buy',
      });
      expect(result.rating).toBe('Strong Buy');
      expect(result.variant).toBe('strongBuy');
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it('should return Buy for moderate upside and risk', () => {
      const result = calculateAiRating({
        risk: 5,
        upside: 25,
        downside: -10,
        overallScore: 6,
        peRatio: 20,
      });
      expect(result.rating).toBe('Buy');
      expect(result.variant).toBe('buy');
    });

    it('should return Hold for neutral factors', () => {
      const result = calculateAiRating({
        risk: 6,
        upside: 10,
        downside: -10,
        overallScore: 5,
        peRatio: 30,
      });
      expect(result.rating).toBe('Hold');
      expect(result.variant).toBe('hold');
    });

    it('should return Sell for high risk and negative factors', () => {
      const result = calculateAiRating({
        risk: 8,
        upside: 5,
        downside: -30,
        overallScore: 3,
        peRatio: null,
      });
      expect(result.rating).toBe('Sell');
      expect(result.variant).toBe('sell');
    });

    it('should return Sell for extreme risk even with moderate score (Hard Veto)', () => {
      const result = calculateAiRating({
        risk: 10,
        upside: 50,
        downside: -20,
        overallScore: 7, // Score might be okay but risk is 10
        peRatio: 15,
      });
      expect(result.rating).toBe('Sell');
      expect(result.variant).toBe('sell');
    });

    it('should return Speculative Buy for high risk but extreme upside', () => {
      const result = calculateAiRating({
        risk: 8,
        upside: 120,
        downside: -40,
        overallScore: 5,
        peRatio: null,
      });
      expect(result.rating).toBe('Speculative Buy');
      expect(result.variant).toBe('speculativeBuy');
    });

    it('should return Speculative Buy for high risk but high Neural Score', () => {
      const result = calculateAiRating({
        risk: 9,
        upside: 20,
        downside: -10,
        overallScore: 8,
        peRatio: null,
      });
      expect(result.rating).toBe('Speculative Buy');
      expect(result.variant).toBe('speculativeBuy');
    });

    it('should handle news sentiment correctly', () => {
      const bullishNews = calculateAiRating({
        risk: 5,
        upside: 20,
        newsSentiment: 'BULLISH',
        newsImpact: 9,
        peRatio: null,
      });
      const bearishNews = calculateAiRating({
        risk: 5,
        upside: 20,
        newsSentiment: 'BEARISH',
        newsImpact: 9,
        peRatio: null,
      });
      
      expect(bullishNews.score).toBeGreaterThan(50);
      expect(bearishNews.score).toBeLessThan(50);
    });

    it('should handle missing fields gracefully', () => {
      const result = calculateAiRating({
        risk: 5,
        upside: 0,
        peRatio: null,
      });
      expect(result.rating).toBeDefined();
    });
  });
});

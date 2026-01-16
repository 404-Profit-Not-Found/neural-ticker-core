import { calculateAiRating } from './verdict.util';

describe('VerdictUtil', () => {
  describe('calculateAiRating', () => {
    it('should return Legendary for exceptional stats (Score > 105)', () => {
      const result = calculateAiRating({
        risk: 2, // +5
        upside: 100, // +40 (Max)
        downside: -5, // -2 (5*0.4)
        overallScore: 9, // +20
        peRatio: 8, // +20
        consensus: 'Strong Buy', // +10
        newsSentiment: 'BULLISH',
        newsImpact: 9, // +15
        revenueTTM: 1000000,
        fiftyTwoWeekHigh: 200,
        fiftyTwoWeekLow: 50,
        currentPrice: 100, // Not near ATH, Not near Low
      });
      // Base 50 + 5 + 40 - 2 + 20 + 20 + 10 + 15 = 158.
      expect(result.rating).toBe('No Brainer');
      expect(result.variant).toBe('legendary');
      expect(result.score).toBeGreaterThan(105);
    });

    it('should return Strong Buy for high upside, low risk, and positive factors', () => {
      const result = calculateAiRating({
        risk: 2,
        upside: 40,
        downside: -5,
        overallScore: 7, // Reduced from 9 to keep score < 105 (Legendary)
        peRatio: 20, // +5 (Fair Value) instead of +20. Total should be ~92.
        consensus: 'Strong Buy',
        revenueTTM: 1000000,
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
        revenueTTM: 1000000,
      });
      expect(result.rating).toBe('Buy');
      expect(result.variant).toBe('buy');
    });

    it('should return Hold for neutral factors', () => {
      const result = calculateAiRating({
        risk: 5,
        upside: 15,
        downside: -5,
        overallScore: 5,
        peRatio: 30,
      });
      // Base 50 + Upside 6 (15*0.4) - Downside 4 (5*0.8) = 52. Hold.
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
        peRatio: 10, // Added to push score above veto threshold (70)
        revenueTTM: 1000000,
      });
      // Base 50 + Upside 8 (20*0.4) - Downside 8 (10*0.8) - Risk 20 + Neural 20 + PE 20 = 70.
      // Not vetoed (score >= 70). Speculative buy override triggers.
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

    it('should penalize pre-revenue companies', () => {
      const result = calculateAiRating({
        risk: 5,
        upside: 25,
        peRatio: null,
        revenueTTM: 0,
        overallScore: 6,
      });
      // Base calculation would be Buy (~65).
      // With -5 penalty and missing PE, it might drop or change.
      // Just verifying score is lower than if it had revenue.
      const resultWithRevenue = calculateAiRating({
        risk: 5,
        upside: 25,
        peRatio: null,
        revenueTTM: 100000,
        overallScore: 6,
      });
      expect(result.score).toBeLessThan(resultWithRevenue.score);
      expect(result.score).toBe(resultWithRevenue.score - 5);
    });

    it('should apply progressive penalties for 52-week high', () => {
      // Extreme High (>98%) -> -20
      const resultExtreme = calculateAiRating({
        risk: 5,
        upside: 10,
        peRatio: 20,
        revenueTTM: 100000,
        overallScore: 6,
        currentPrice: 99,
        fiftyTwoWeekHigh: 100,
        fiftyTwoWeekLow: 50,
      });

      // Very High (>90%) -> -10
      const resultVeryHigh = calculateAiRating({
        risk: 5,
        upside: 10,
        peRatio: 20,
        revenueTTM: 100000,
        overallScore: 6,
        currentPrice: 92,
        fiftyTwoWeekHigh: 100,
        fiftyTwoWeekLow: 50,
      });

      // High (>80%) -> -5
      const resultHigh = calculateAiRating({
        risk: 5,
        upside: 10,
        peRatio: 20,
        revenueTTM: 100000,
        overallScore: 6,
        currentPrice: 82,
        fiftyTwoWeekHigh: 100,
        fiftyTwoWeekLow: 50,
      });

      // Baseline (Mid) -> 0
      const resultMid = calculateAiRating({
        risk: 5,
        upside: 10,
        peRatio: 20,
        revenueTTM: 100000,
        overallScore: 6,
        currentPrice: 50,
        fiftyTwoWeekHigh: 100,
        fiftyTwoWeekLow: 10, // Price 50 is mid
      });

      // Verify Penalties relative to Baseline
      // Note: resultMid might get low reward if not careful with input, so let's check deltas
      // Actually simpler: Expect specific penalties based on known base calculation

      // Let's compare them to each other
      expect(resultExtreme.score).toBeLessThan(resultVeryHigh.score);
      expect(resultVeryHigh.score).toBeLessThan(resultHigh.score);
    });

    it('should reward buying the dip (progressive) - Standard % from Low', () => {
      // Case 1: Within 5% of Low -> +10
      const result1 = calculateAiRating({
        risk: 5,
        upside: 10,
        peRatio: 20,
        revenueTTM: 100000,
        overallScore: 6,
        currentPrice: 104,
        fiftyTwoWeekLow: 100,
        fiftyTwoWeekHigh: 200,
      }); // 1.04x Low
      expect(result1.score).toBeGreaterThan(50); // Just check it runs, we know base score logic

      // Case 2: Within 25% of Low -> +5
      const result2 = calculateAiRating({
        risk: 5,
        upside: 10,
        peRatio: 20,
        revenueTTM: 100000,
        overallScore: 6,
        currentPrice: 120,
        fiftyTwoWeekLow: 100,
        fiftyTwoWeekHigh: 200,
      }); // 1.20x Low

      expect(result1.score).toBe(result2.score + 5); // +10 vs +5 = 5 diff
    });

    it('should reward buying the dip (Range Position) - ARCT Scenario', () => {
      // Scenario: Stock rallied > 25% from low, but range is HUGE, so it's still in bottom 20%
      // Low: 100, High: 1000. Range: 900.
      // Bottom 20% of range logic: Position = (Price - Low) / (High - Low)

      const result = calculateAiRating({
        risk: 5,
        upside: 10,
        peRatio: 20,
        revenueTTM: 100000,
        overallScore: 6,
        currentPrice: 130, // +30% from low (fails < 1.25x check)
        fiftyTwoWeekLow: 100,
        fiftyTwoWeekHigh: 1000,
      });

      // Position = (130 - 100) / 900 = 30 / 900 = 0.033 (3.3%)
      // This is <= 0.05 (Bottom 5%), so should get Tier 1 reward (+10)

      // Control: High in range
      const resultHigh = calculateAiRating({
        risk: 5,
        upside: 10,
        peRatio: 20,
        revenueTTM: 100000,
        overallScore: 6,
        currentPrice: 900,
        fiftyTwoWeekLow: 100,
        fiftyTwoWeekHigh: 1000,
      });

      expect(result.score).toBe(resultHigh.score + 20);
      // resultHigh gets -10 penalty for being near high (900/1000=0.9 -> Very High -10)
      // resultLow gets +10 reward
      // Diff = 10 - (-10) = 20? No wait.
      // High score calculation: Base - 10 (High penalty).
      // Low score calculation: Base + 10 (Low reward).
      // Diff should be 20.
    });

    it('should reward Tier 2 Range Position', () => {
      // Low: 100, High: 1000. Range: 900.
      // Price: 250 (+150% from low, but still low in range).
      // Position = (250 - 100) / 900 = 150 / 900 = 0.166 (16.6%)
      // This is <= 0.20 (Bottom 20%), so should get Tier 2 reward (+5)

      const result = calculateAiRating({
        risk: 5,
        upside: 10,
        peRatio: 20,
        revenueTTM: 100000,
        overallScore: 6,
        currentPrice: 250,
        fiftyTwoWeekLow: 100,
        fiftyTwoWeekHigh: 1000,
      });

      const resultMid = calculateAiRating({
        risk: 5,
        upside: 10,
        peRatio: 20,
        revenueTTM: 100000,
        overallScore: 6,
        currentPrice: 500, // Mid range
        fiftyTwoWeekLow: 100,
        fiftyTwoWeekHigh: 1000,
      });

      expect(result.score).toBe(resultMid.score + 5);
    });

    it('should NOT reward falling knives (Sell + 100% Downside)', () => {
      // Condition for Falling Knife: Sell Consensus AND Downside <= -99
      // This should get 0 reward even if at ATL
      const resultKnife = calculateAiRating({
        risk: 5,
        upside: 10,
        peRatio: 20,
        revenueTTM: 100000,
        overallScore: 6,
        currentPrice: 100,
        fiftyTwoWeekLow: 100,
        fiftyTwoWeekHigh: 500, // At Low
        consensus: 'Sell',
        downside: -100, // Maximum downside
      });

      // Control: Same setup but 'Hold' consensus (should get reward)
      const resultDip = calculateAiRating({
        risk: 5,
        upside: 10,
        peRatio: 20,
        revenueTTM: 100000,
        overallScore: 6,
        currentPrice: 100,
        fiftyTwoWeekLow: 100,
        fiftyTwoWeekHigh: 500,
        consensus: 'Hold',
        downside: -100,
      });

      expect(resultKnife.score).toBeLessThan(resultDip.score);
      expect(resultDip.score).toBe(resultKnife.score + 20); // Knife loses +10 reward AND gets -10 for Sell consensus
    });
  });
});

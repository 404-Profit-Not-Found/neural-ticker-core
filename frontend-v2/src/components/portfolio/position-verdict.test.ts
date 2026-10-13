import { describe, it, expect } from 'vitest';
import { deriveVerdict } from '../../lib/ticker-metrics';
import { nativePrice, positionVerdict, positionVerdictBadgeProps, positionVerdictSource } from './position-verdict';

const position = {
    current_price: 138, // converted to the display currency (EUR)
    original_current_price: 150, // native USD
    fiftyTwoWeekHigh: 180,
    fiftyTwoWeekLow: 110,
    fundamentals: { pe_ttm: '28.5', consensus_rating: 'Buy' },
    ticker: { name: 'Apple Inc', news_sentiment: 'bullish', news_impact_score: 8 },
    aiAnalysis: { financial_risk: 3, overall_score: 8, base_price: 165, bear_price: 135, upside_percent: 4 },
};

describe('position verdict', () => {
    it('prices the holding in its own currency, never the converted display value', () => {
        expect(nativePrice(position)).toBe(150);
        expect(nativePrice({ ...position, quote: { c: 151 } })).toBe(151);
        expect(nativePrice({ current_price: 99 })).toBe(99);
        // Targets are native too: +10% from 150, not +19.6% from the EUR figure.
        expect(positionVerdict(position).upside).toBeCloseTo(10, 5);
        expect(positionVerdict(position).downside).toBeCloseTo(-10, 5);
    });

    it('is the shared derivation with the same inputs other views use', () => {
        const source = positionVerdictSource(position);
        expect(source).toMatchObject({
            price: 150,
            risk: 3,
            pe: 28.5,
            consensus: 'Buy',
            newsSentiment: 'bullish',
            newsImpact: 8,
            fiftyTwoWeekHigh: 180,
            fiftyTwoWeekLow: 110,
        });
        expect(positionVerdict(position)).toEqual(deriveVerdict(source));
    });

    it('marks an estimated downside and an unanalysed holding honestly', () => {
        const noBear = { ...position, aiAnalysis: { ...position.aiAnalysis, bear_price: undefined } };
        expect(positionVerdict(noBear).downsideEstimated).toBe(true);

        const unanalysed = { current_price: 50 };
        expect(positionVerdict(unanalysed)).toMatchObject({ upside: null, downside: null, rating: '-', variant: null });
        expect(positionVerdictBadgeProps(unanalysed).analysed).toBe(false);
        expect(positionVerdictBadgeProps(position)).toMatchObject({ analysed: true, currentPrice: 150, upside: 10 });
    });
});

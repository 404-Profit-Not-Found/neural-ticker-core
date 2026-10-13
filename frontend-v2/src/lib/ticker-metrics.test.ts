import { describe, expect, it } from 'vitest';
import type { StockSnapshot } from '../hooks/useStockAnalyzer';
import { calculateAiRating } from './rating-utils';
import { deriveVerdict, ratingStamp, snapshotToTickerData, verdictProps } from './ticker-metrics';

const snapshot = (over: Partial<StockSnapshot> = {}): StockSnapshot => ({
  ticker: { id: 't1', symbol: 'NVDA', name: 'NVIDIA Corp', exchange: 'NASDAQ', currency: 'USD' },
  latestPrice: { close: 100, open: 99, high: 101, low: 98, volume: 1, change: 1.5, prevClose: 98.5, ts: '2026-10-13' },
  fundamentals: { pe_ttm: 30, consensus_rating: 'Buy', fifty_two_week_high: 120, fifty_two_week_low: 60 },
  aiAnalysis: { overall_score: 8, upside_percent: 20, financial_risk: 3, sentiment: 'bullish', base_price: 130, bear_price: 90 },
  counts: { news: 2, research: 1, analysts: 5, social: 0 },
  sparkline: [1, 2, 3],
  ...over,
});

describe('deriveVerdict', () => {
  it('computes upside and downside from the scenario targets and today\'s price', () => {
    const v = deriveVerdict({ price: 100, risk: 3, basePrice: 130, bearPrice: 90 });
    expect(v.upside).toBeCloseTo(30);
    expect(v.downside).toBeCloseTo(-10);
    expect(v.downsideEstimated).toBe(false);
    expect(v.rating).not.toBe('-');
    expect(v.variant).not.toBeNull();
  });

  it('falls back to the backend upside when there is no base target', () => {
    expect(deriveVerdict({ price: 100, risk: 3, upsidePercent: 12.5 }).upside).toBe(12.5);
  });

  it('marks a downside estimated from risk as an estimate', () => {
    const v = deriveVerdict({ price: 100, risk: 4, basePrice: 120 });
    expect(v.downside).toBe(-10);
    expect(v.downsideEstimated).toBe(true);
    expect(deriveVerdict({ price: 100, risk: 9, basePrice: 120 }).downside).toBe(-100);
  });

  it('gives an unanalysed ticker no rating — and no invented figures', () => {
    const v = deriveVerdict({ price: 100, risk: null });
    expect(v).toEqual({ upside: null, downside: null, downsideEstimated: false, rating: '-', variant: null });
  });

  it('only penalises a company for having no revenue when it really has none', () => {
    // Every view used to omit revenue, so every company was scored as
    // pre-revenue (−5) and badges disagreed with the server's rating filter.
    const withRevenue = snapshotToTickerData(
      snapshot({ fundamentals: { pe_ttm: 30, consensus_rating: 'Buy', fifty_two_week_high: 120, fifty_two_week_low: 60, revenue_ttm: 60_000_000_000 } }),
    );
    const preRevenue = snapshotToTickerData(snapshot());
    expect(withRevenue.revenueTTM).toBe(60_000_000_000);
    expect(preRevenue.revenueTTM).toBeNull();

    const score = (record: typeof withRevenue) => {
      const { pe, ...rest } = verdictProps(record);
      return calculateAiRating({ ...rest, peRatio: pe }).score ?? NaN;
    };
    // The badge is handed the revenue too, and that is worth exactly 5 points.
    expect(verdictProps(withRevenue).revenueTTM).toBe(60_000_000_000);
    expect(score(withRevenue) - score(preRevenue)).toBe(5);
  });

  it('ignores a "-" consensus instead of treating it as one', () => {
    const base = { price: 100, risk: 3, basePrice: 130, bearPrice: 90 };
    expect(deriveVerdict({ ...base, consensus: '-' })).toEqual(deriveVerdict(base));
  });
});

describe('snapshotToTickerData', () => {
  it('maps a snapshot to the record every view renders', () => {
    const record = snapshotToTickerData(snapshot());
    expect(record).toMatchObject({
      symbol: 'NVDA',
      company: 'NVIDIA Corp',
      price: 100,
      change: 1.5,
      riskScore: 3,
      overallScore: 8,
      rating: 'Buy',
      currency: 'USD',
      downsideEstimated: false,
    });
    expect(record.potentialUpside).toBeCloseTo(30);
    expect(record.potentialDownside).toBeCloseTo(-10);
  });

  it('leaves an unanalysed ticker unrated', () => {
    const record = snapshotToTickerData(snapshot({ aiAnalysis: null }));
    expect(record.riskScore).toBeNull();
    expect(record.aiRating).toBe('-');
    expect(record.potentialUpside).toBeNull();
    expect(record.potentialDownside).toBeNull();
    expect(ratingStamp(record)).toBeNull();
  });

  it('gives the badge exactly the inputs the record\'s own rating used', () => {
    // The row stamp shows `aiRating`; cards and tables hand `verdictProps` to
    // VerdictBadge, which recomputes. Both must land on the same rating.
    for (const s of [
      snapshot(),
      snapshot({ aiAnalysis: { overall_score: 4, upside_percent: -8, financial_risk: 7, sentiment: 'bearish' } }),
      snapshot({ ticker: { id: 't2', symbol: 'COIN', name: 'Coinbase', exchange: 'NASDAQ', news_sentiment: 'BULLISH', news_impact_score: 9 } }),
      snapshot({ fundamentals: { consensus_rating: undefined } }),
    ]) {
      const record = snapshotToTickerData(s);
      const { pe, ...rest } = verdictProps(record);
      expect(calculateAiRating({ ...rest, peRatio: pe }).rating).toBe(record.aiRating);
    }
  });
});

describe('ratingStamp', () => {
  it('shortens "Speculative Buy" and keeps its colour', () => {
    const record = { ...snapshotToTickerData(snapshot()), aiRating: 'Speculative Buy', aiRatingVariant: 'speculativeBuy' as const };
    expect(ratingStamp(record)).toEqual({ label: 'Spec buy', variant: 'speculativeBuy' });
  });

  it('derives the colour from the label when no variant was stored', () => {
    const record = { ...snapshotToTickerData(snapshot()), aiRating: 'Sell', aiRatingVariant: undefined };
    expect(ratingStamp(record)).toEqual({ label: 'Sell', variant: 'sell' });
  });
});

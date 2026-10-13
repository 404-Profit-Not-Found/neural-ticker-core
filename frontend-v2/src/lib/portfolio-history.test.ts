import { describe, it, expect } from 'vitest';
import {
  buildPortfolioSeries,
  eachDay,
  shiftDay,
  toDay,
  type ClosePoint,
  type HistoryPosition,
  type LedgerTrade,
} from './portfolio-history';

const usd = () => 1;

function position(overrides: Partial<HistoryPosition> = {}): HistoryPosition {
  return {
    symbol: 'AAPL',
    shares: 10,
    buyPrice: 100,
    buyDate: '2026-01-02',
    currentPrice: 130,
    nativeCurrency: 'USD',
    ...overrides,
  };
}

function trade(overrides: Partial<LedgerTrade> = {}): LedgerTrade {
  return {
    symbol: 'AAPL',
    side: 'buy',
    shares: 10,
    price: 100,
    date: '2026-01-02',
    currency: 'USD',
    ...overrides,
  };
}

const closes = (pairs: Array<[string, number]>): ClosePoint[] =>
  pairs.map(([date, close]) => ({ date, close }));

describe('date helpers', () => {
  it('lists every calendar day inclusively, across month and year ends', () => {
    expect(eachDay('2025-12-30', '2026-01-02')).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
    expect(eachDay('2026-03-05', '2026-03-05')).toEqual(['2026-03-05']);
    expect(eachDay('2026-03-05', '2026-03-01')).toEqual([]);
    expect(eachDay('nope', '2026-03-01')).toEqual([]);
  });

  it('shifts days in both directions', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('normalises candle timestamps to a day', () => {
    expect(toDay('2026-10-12')).toBe('2026-10-12');
    expect(toDay('2026-10-12T00:00:00.000Z')).toBe('2026-10-12');
    expect(toDay(new Date('2026-10-12T15:30:00Z'))).toBe('2026-10-12');
    expect(toDay(null)).toBeNull();
    expect(toDay('garbage')).toBeNull();
  });
});

describe('buildPortfolioSeries', () => {
  it('values a holding at shares × that day’s close, forward-filling market holidays', () => {
    const series = buildPortfolioSeries({
      positions: [position()],
      trades: [trade()],
      closes: {
        // Fri, (weekend missing), Mon, Tue
        AAPL: closes([
          ['2026-01-09', 110],
          ['2026-01-12', 115],
          ['2026-01-13', 120],
        ]),
      },
      startDate: '2026-01-09',
      endDate: '2026-01-14',
      fx: usd,
    });

    expect(series.points.map((p) => [p.date, p.value])).toEqual([
      ['2026-01-09', 1100],
      ['2026-01-10', 1100], // Saturday: Friday's close
      ['2026-01-11', 1100], // Sunday
      ['2026-01-12', 1150],
      ['2026-01-13', 1200],
      ['2026-01-14', 1300], // today: live price (130), not a candle
    ]);
    // Cost basis never moves without a trade.
    expect(series.points.every((p) => p.invested === 1000)).toBe(true);
    expect(series.missingHistory).toEqual([]);
  });

  it('ends exactly at the live holdings value', () => {
    const series = buildPortfolioSeries({
      positions: [position({ shares: 3, currentPrice: 210.5 })],
      trades: [trade({ shares: 3 })],
      closes: { AAPL: closes([['2026-02-01', 200]]) },
      startDate: '2026-02-01',
      endDate: '2026-02-03',
      fx: usd,
    });
    expect(series.points.at(-1)?.value).toBeCloseTo(3 * 210.5, 10);
  });

  it('shows nothing before the first buy, marks the buy, and does not count the deposit as gain', () => {
    const series = buildPortfolioSeries({
      positions: [position({ currentPrice: 110 })],
      trades: [trade({ date: '2026-03-03', price: 100 })],
      closes: {
        AAPL: closes([
          ['2026-03-02', 98],
          ['2026-03-03', 101],
          ['2026-03-04', 105],
        ]),
      },
      startDate: '2026-03-01',
      endDate: '2026-03-05',
      fx: usd,
    });

    expect(series.points.map((p) => p.value)).toEqual([0, 0, 1010, 1050, 1100]);
    expect(series.points.map((p) => p.invested)).toEqual([0, 0, 1000, 1000, 1000]);
    expect(series.points[2].bought).toEqual(['AAPL']);
    expect(series.points[1].bought).toBeUndefined();

    // Paid 1000, now worth 1100: the gain is 100, not 1100.
    expect(series.periodGain).toBeCloseTo(100, 10);
    expect(series.periodGainPct).toBeCloseTo(10, 10);
  });

  it('reduces shares and cost basis on a partial sell and keeps realised profit in the period gain', () => {
    const series = buildPortfolioSeries({
      positions: [position({ shares: 6, currentPrice: 150 })],
      trades: [
        trade({ date: '2026-04-01', shares: 10, price: 100 }),
        trade({ date: '2026-04-03', side: 'sell', shares: 4, price: 140 }),
      ],
      closes: {
        AAPL: closes([
          ['2026-04-01', 100],
          ['2026-04-02', 120],
          ['2026-04-03', 140],
          ['2026-04-04', 145],
        ]),
      },
      startDate: '2026-04-01',
      endDate: '2026-04-05',
      fx: usd,
    });

    expect(series.points.map((p) => p.value)).toEqual([1000, 1200, 6 * 140, 6 * 145, 6 * 150]);
    // Average-cost basis: 4 of 10 shares sold → 60% of the basis remains.
    expect(series.points.map((p) => p.invested)).toEqual([1000, 1000, 600, 600, 600]);
    expect(series.points[2].sold).toEqual(['AAPL']);

    // Start 1000 → end 900 with 560 taken out by the sale: +460 overall
    // (160 realised on the 4 sold + 300 unrealised on the 6 kept).
    expect(series.periodGain).toBeCloseTo(460, 10);
    expect(series.periodGainPct).toBeCloseTo(46, 10);
  });

  it('includes positions that were fully closed, for as long as they were held', () => {
    const series = buildPortfolioSeries({
      positions: [],
      trades: [
        trade({ symbol: 'TSLA', date: '2026-05-01', shares: 2, price: 200 }),
        trade({ symbol: 'TSLA', date: '2026-05-03', side: 'sell', shares: 2, price: 260 }),
      ],
      closes: {
        TSLA: closes([
          ['2026-05-01', 205],
          ['2026-05-02', 240],
          ['2026-05-03', 255],
        ]),
      },
      startDate: '2026-05-01',
      endDate: '2026-05-04',
      fx: usd,
    });

    expect(series.points.map((p) => p.value)).toEqual([410, 480, 0, 0]);
    expect(series.points.map((p) => p.invested)).toEqual([400, 400, 0, 0]);
    // Bought before the baseline was taken (day 0), sold for 520 → 520 − 410.
    expect(series.periodGain).toBeCloseTo(110, 10);
  });

  it('falls back to the position row when the ledger does not add up to what is held', () => {
    const series = buildPortfolioSeries({
      // The user edited the position to 25 shares; the ledger only knows 10.
      positions: [position({ shares: 25, buyPrice: 80, buyDate: '2026-06-02', currentPrice: 100 })],
      trades: [trade({ date: '2026-06-01', shares: 10, price: 90 })],
      closes: {
        AAPL: closes([
          ['2026-06-01', 90],
          ['2026-06-02', 95],
        ]),
      },
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      fx: usd,
    });

    expect(series.points.map((p) => p.value)).toEqual([0, 25 * 95, 25 * 100]);
    expect(series.points.map((p) => p.invested)).toEqual([0, 2000, 2000]);
  });

  it('treats a position with no buy date and no ledger as held throughout', () => {
    const series = buildPortfolioSeries({
      positions: [position({ buyDate: null, shares: 2, buyPrice: 50, currentPrice: 70 })],
      trades: [],
      closes: { AAPL: closes([['2026-07-01', 60]]) },
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      fx: usd,
    });
    expect(series.points.map((p) => p.value)).toEqual([120, 140]);
    expect(series.points[0].bought).toBeUndefined();
    expect(series.periodGain).toBeCloseTo(20, 10);
  });

  it('never invents prices: without candles a holding sits at cost and is reported', () => {
    const series = buildPortfolioSeries({
      positions: [position({ symbol: 'NEWCO', currentPrice: 12 })],
      trades: [trade({ symbol: 'NEWCO', date: '2026-08-01', price: 10 })],
      closes: {},
      startDate: '2026-08-01',
      endDate: '2026-08-04',
      fx: usd,
    });

    expect(series.points.map((p) => p.value)).toEqual([100, 100, 100, 120]);
    expect(series.missingHistory).toEqual(['NEWCO']);
  });

  it('converts each holding with its own exchange rate', () => {
    const series = buildPortfolioSeries({
      positions: [
        position({ symbol: 'AAPL', shares: 1, currentPrice: 200 }),
        position({ symbol: 'SAP.DE', shares: 2, currentPrice: 100, nativeCurrency: 'EUR' }),
      ],
      trades: [
        trade({ symbol: 'AAPL', shares: 1, price: 150, date: '2026-01-02' }),
        trade({ symbol: 'SAP.DE', shares: 2, price: 90, date: '2026-01-02', currency: 'EUR' }),
      ],
      closes: {
        AAPL: closes([['2026-09-01', 180]]),
        'SAP.DE': closes([['2026-09-01', 95]]),
      },
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      // Display currency EUR: 1 USD = 0.5 EUR (round numbers for the test).
      fx: (currency) => (currency === 'USD' ? 0.5 : 1),
    });

    expect(series.points[0].value).toBeCloseTo(180 * 0.5 + 2 * 95, 10);
    expect(series.points[1].value).toBeCloseTo(200 * 0.5 + 2 * 100, 10);
    expect(series.points[0].invested).toBeCloseTo(150 * 0.5 + 2 * 90, 10);
  });

  it('leaves out — and names — holdings that cannot be converted', () => {
    const series = buildPortfolioSeries({
      positions: [
        position({ symbol: 'AAPL', shares: 1, currentPrice: 200 }),
        position({ symbol: '7203.T', shares: 5, currentPrice: 3000, nativeCurrency: 'JPY' }),
      ],
      trades: [],
      closes: { AAPL: closes([['2026-09-01', 180]]), '7203.T': closes([['2026-09-01', 2900]]) },
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      fx: (currency) => (currency === 'JPY' ? null : 1),
    });

    expect(series.excluded).toEqual(['7203.T']);
    expect(series.points.map((p) => p.value)).toEqual([180, 200]);
  });

  it('is deterministic and contains no synthetic variation', () => {
    const input = {
      positions: [position({ shares: 7, currentPrice: 100 })],
      trades: [trade({ shares: 7, date: '2025-01-02' })],
      // A perfectly flat market…
      closes: { AAPL: closes(eachDay('2026-01-01', '2026-01-30').map((d) => [d, 100])) },
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      fx: usd,
    };
    const a = buildPortfolioSeries(input);
    const b = buildPortfolioSeries(input);
    expect(a).toEqual(b);
    // …must produce a perfectly flat line: no noise, no trend.
    expect(new Set(a.points.map((p) => p.value))).toEqual(new Set([700]));
    expect(a.periodGain).toBe(0);
    expect(a.periodGainPct).toBe(0);
  });

  it('copes with numeric strings from the API and ignores unusable rows', () => {
    const series = buildPortfolioSeries({
      positions: [position({ shares: 1, currentPrice: 12 })],
      trades: [
        trade({ shares: 1, price: 10, date: '2026-10-01' }),
        // zero-share and undated rows must not break or distort anything
        trade({ shares: 0, price: 999, date: '2026-10-01' }),
        trade({ shares: 5, price: 999, date: 'not-a-date' }),
      ],
      closes: {
        AAPL: [
          { date: '2026-10-01T00:00:00.000Z', close: '11' as unknown as number },
          { date: '2026-10-02', close: 0 }, // bad tick
          { date: 'bogus', close: 50 },
        ],
      },
      startDate: '2026-10-01',
      endDate: '2026-10-03',
      fx: usd,
    });
    expect(series.points.map((p) => p.value)).toEqual([11, 11, 12]);
  });

  it('returns an empty series for an empty portfolio or an invalid window', () => {
    expect(
      buildPortfolioSeries({
        positions: [],
        trades: [],
        closes: {},
        startDate: '2026-01-01',
        endDate: '2026-01-03',
        fx: usd,
      }).points.map((p) => p.value),
    ).toEqual([0, 0, 0]);

    expect(
      buildPortfolioSeries({
        positions: [position()],
        trades: [],
        closes: {},
        startDate: '2026-02-01',
        endDate: '2026-01-01',
        fx: usd,
      }).points,
    ).toEqual([]);
  });
});

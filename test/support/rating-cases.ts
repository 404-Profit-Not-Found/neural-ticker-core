import type { TickerVerdictRow } from '../../src/lib/ticker-verdict';

/**
 * Test tickers for the AI rating, described by the values the DATABASE holds
 * (so the same case can be inserted into PostgreSQL and fed to TypeScript):
 * a fixed list of boundary cases plus a seeded, reproducible random set.
 *
 * Used by
 *   - src/lib/ticker-verdict.spec.ts   → the golden vectors
 *     (test-vectors/ai-rating.json), also run by the frontend's vitest;
 *   - test/db/ai-rating.db-spec.ts     → SQL == TypeScript on a real database.
 *
 * Every number keeps to the scale of its column (prices and risk two decimals,
 * fundamentals four), so what is inserted is exactly what is read back.
 */
export interface RatingCase {
  name: string;
  /** Latest candle close; null = the ticker has no price row at all. */
  close: number | null;
  /** null = never analysed. `base` / `bear` null = that scenario is missing. */
  analysis: {
    financial_risk: number;
    overall_score: number;
    upside_percent: number;
    base: number | null;
    bear: number | null;
  } | null;
  /** null = no fundamentals row. */
  fundamentals: {
    consensus_rating: string | null;
    pe_ttm: number | null;
    revenue_ttm: number | null;
    fifty_two_week_high: number | null;
    fifty_two_week_low: number | null;
  } | null;
  news_sentiment: string | null;
  news_impact_score: number | null;
}

/** The case as the server-side rating function takes it. */
export function toVerdictRow(c: RatingCase): TickerVerdictRow {
  return {
    close: c.close,
    analysis: c.analysis
      ? {
          financial_risk: c.analysis.financial_risk,
          overall_score: c.analysis.overall_score,
          upside_percent: c.analysis.upside_percent,
          base_price: c.analysis.base,
          bear_price: c.analysis.bear,
        }
      : null,
    fundamentals: c.fundamentals,
    news_sentiment: c.news_sentiment,
    news_impact_score: c.news_impact_score,
  };
}

/** Every spelling of an analyst consensus worth telling apart. */
export const CONSENSUS_SPELLINGS: (string | null)[] = [
  null,
  '',
  '-',
  'Strong Buy',
  'strong buy',
  'STRONG BUY',
  'Strong_Buy',
  'strong_buy',
  'Buy',
  'buy',
  'Moderate Buy',
  'Outperform',
  'Hold',
  'Neutral',
  'Sell',
  'sell',
  'Strong Sell',
  'Underperform',
  'N/A',
];

export const NEWS_SENTIMENTS: (string | null)[] = [
  null,
  '',
  'BULLISH',
  'BEARISH',
  'NEUTRAL',
  'Bullish',
  'bearish',
];

type Analysis = NonNullable<RatingCase['analysis']>;
type Fundamentals = NonNullable<RatingCase['fundamentals']>;

const analysis = (over: Partial<Analysis> = {}): Analysis => ({
  financial_risk: 5,
  overall_score: 5,
  upside_percent: 0,
  base: null,
  bear: null,
  ...over,
});

const fundamentals = (over: Partial<Fundamentals> = {}): Fundamentals => ({
  consensus_rating: null,
  pe_ttm: null,
  revenue_ttm: 1000000,
  fifty_two_week_high: null,
  fifty_two_week_low: null,
  ...over,
});

const base = (over: Partial<RatingCase> = {}): Omit<RatingCase, 'name'> => ({
  close: 100,
  analysis: analysis(),
  fundamentals: fundamentals(),
  news_sentiment: null,
  news_impact_score: null,
  ...over,
});

/** Hand-picked cases: every rule, and every threshold from both sides. */
export function boundaryCases(): RatingCase[] {
  const cases: RatingCase[] = [];
  const add = (name: string, over: Partial<RatingCase> = {}) =>
    cases.push({ name, ...base(over) });

  // --- not analysed / nothing to go on -----------------------------------
  add('not analysed: price and fundamentals only', { analysis: null });
  add('not analysed: nothing at all', {
    close: null,
    analysis: null,
    fundamentals: null,
  });
  add('analysed, but no price row', { close: null });
  add('analysed, price 0', { close: 0 });
  add('analysed, no fundamentals row', { fundamentals: null });

  // --- upside: live target vs the stored upside_percent -------------------
  for (const [label, a] of [
    ['base target +50 %', { base: 150 }],
    ['base target -30 %', { base: 70 }],
    ['base target -60 % (below the -50 clamp)', { base: 40 }],
    ['base target +100 % exactly', { base: 200 }],
    ['base target +250 % (above the +100 clamp)', { base: 350 }],
    ['no base target: stored upside +35 %', { upside_percent: 35 }],
    ['no base target: stored upside -80 %', { upside_percent: -80 }],
    [
      'base target 0: falls back to the stored upside',
      { base: 0, upside_percent: 22.5 },
    ],
  ] as [string, Partial<Analysis>][]) {
    add(`upside — ${label}`, { analysis: analysis(a) });
  }
  add('upside — no price: stored upside is used even with a base target', {
    close: 0,
    analysis: analysis({ base: 150, upside_percent: 12 }),
  });

  // --- downside: bear target vs the estimate from risk --------------------
  for (const [label, a] of [
    ['bear target -20 %', { bear: 80 }],
    ['bear target -99 % (falling-knife threshold)', { bear: 1 }],
    ['bear target 0 (-100 %)', { bear: 0 }],
    ['bear target above the price (+10 %)', { bear: 110 }],
    ['no bear target, risk 0: no downside at all', { financial_risk: 0 }],
    ['no bear target, risk 0.01', { financial_risk: 0.01 }],
    ['no bear target, risk 4: estimated -10 %', { financial_risk: 4 }],
    [
      'no bear target, risk 7.99: estimated -19.975 %',
      { financial_risk: 7.99 },
    ],
    ['no bear target, risk 8: estimated -100 %', { financial_risk: 8 }],
  ] as [string, Partial<Analysis>][]) {
    add(`downside — ${label}`, { analysis: analysis(a) });
  }

  // --- risk bands -----------------------------------------------------------
  for (const risk of [0, 2.99, 3, 3.01, 5.99, 6, 7.99, 8, 8.99, 9, 10]) {
    add(`risk ${risk}`, {
      analysis: analysis({ financial_risk: risk, base: 130, bear: 85 }),
    });
  }

  // --- neural score (0 counts as missing) ----------------------------------
  for (const score of [
    0, 0.01, 3.99, 4, 4.01, 5.99, 6, 7.49, 7.5, 7.99, 8, 10,
  ]) {
    add(`overall score ${score}`, {
      analysis: analysis({ overall_score: score, base: 120, bear: 90 }),
    });
  }

  // --- 52-week high penalty: both sides of 80 / 90 / 98 % -------------------
  for (const close of [
    79.99, 80, 80.01, 89.99, 90, 90.01, 97.99, 98, 98.01, 100, 120,
  ]) {
    add(`52w high 100, price ${close}`, {
      close,
      fundamentals: fundamentals({ fifty_two_week_high: 100 }),
    });
  }
  add('52w high 0 (treated as missing)', {
    fundamentals: fundamentals({ fifty_two_week_high: 0 }),
  });

  // --- 52-week low reward: distance from the low, and position in range ----
  for (const close of [40, 50, 52.49, 52.5, 52.51, 62.49, 62.5, 62.51, 70]) {
    add(`52w low 50 (no high), price ${close}`, {
      close,
      fundamentals: fundamentals({ fifty_two_week_low: 50 }),
    });
  }
  // range 50–250: bottom 5 % ends at 60, bottom 20 % at 90
  for (const close of [59.99, 60, 60.01, 89.99, 90, 90.01, 150, 250, 300]) {
    add(`52w range 50-250, price ${close}`, {
      close,
      fundamentals: fundamentals({
        fifty_two_week_low: 50,
        fifty_two_week_high: 250,
      }),
    });
  }
  add('52w range inverted (high below low)', {
    close: 55,
    fundamentals: fundamentals({
      fifty_two_week_low: 50,
      fifty_two_week_high: 40,
    }),
  });
  add('52w low reward — falling knife: Sell consensus and -100 % downside', {
    close: 51,
    analysis: analysis({ financial_risk: 9, bear: 0 }),
    fundamentals: fundamentals({
      fifty_two_week_low: 50,
      consensus_rating: 'Strong Sell',
    }),
  });
  add('52w low reward — Sell consensus but downside only -98 %', {
    close: 50,
    analysis: analysis({ bear: 1 }),
    fundamentals: fundamentals({
      fifty_two_week_low: 50,
      consensus_rating: 'Sell',
    }),
  });

  // --- revenue ---------------------------------------------------------------
  for (const revenue of [null, 0, -1500000, 0.0001, 2500000000]) {
    add(`revenue ${revenue}`, {
      fundamentals: fundamentals({ revenue_ttm: revenue }),
    });
  }

  // --- P/E -------------------------------------------------------------------
  for (const pe of [
    null,
    0,
    -12.5,
    0.0001,
    9.9999,
    10,
    10.0001,
    15,
    15.0001,
    25,
    25.0001,
    400,
  ]) {
    add(`P/E ${pe}`, { fundamentals: fundamentals({ pe_ttm: pe }) });
  }

  // --- consensus: every spelling ---------------------------------------------
  for (const consensus of CONSENSUS_SPELLINGS) {
    add(`consensus ${JSON.stringify(consensus)}`, {
      fundamentals: fundamentals({ consensus_rating: consensus }),
    });
  }

  // --- news --------------------------------------------------------------------
  for (const sentiment of NEWS_SENTIMENTS) {
    for (const impact of [null, 0, 4, 5, 7, 8, 10]) {
      add(`news ${JSON.stringify(sentiment)} impact ${impact}`, {
        news_sentiment: sentiment,
        news_impact_score: impact,
      });
    }
  }

  // --- verdict rules -----------------------------------------------------------
  add('speculative buy: risk 8, upside exactly 100 %', {
    analysis: analysis({ financial_risk: 8, base: 200, bear: 60 }),
  });
  add('not speculative: risk 8, upside 99.99 %', {
    analysis: analysis({ financial_risk: 8, base: 199.99, bear: 60 }),
  });
  add('speculative buy: risk 9.5, neural 7.5', {
    analysis: analysis({ financial_risk: 9.5, overall_score: 7.5 }),
  });
  add('not speculative: risk 7.99, upside 300 %', {
    analysis: analysis({ financial_risk: 7.99, base: 400 }),
  });
  add('hard veto: risk 9 with a score of 67 is a Sell, not a Buy', {
    analysis: analysis({
      financial_risk: 9,
      overall_score: 7,
      base: 160,
      bear: 95,
    }),
    fundamentals: fundamentals({ consensus_rating: 'Buy' }),
  });
  add('no veto: risk 9 but the score clears 70', {
    analysis: analysis({
      financial_risk: 9,
      overall_score: 7.4,
      base: 199,
      bear: 99,
    }),
    fundamentals: fundamentals({ pe_ttm: 8, consensus_rating: 'Strong Buy' }),
    news_sentiment: 'BULLISH',
    news_impact_score: 9,
  });
  add('no brainer: everything lines up', {
    close: 51,
    analysis: analysis({
      financial_risk: 1,
      overall_score: 9.5,
      base: 200,
      bear: 50,
    }),
    fundamentals: fundamentals({
      pe_ttm: 7,
      consensus_rating: 'Strong Buy',
      fifty_two_week_low: 50,
      fifty_two_week_high: 300,
    }),
    news_sentiment: 'BULLISH',
    news_impact_score: 10,
  });
  add('everything against it', {
    close: 99,
    analysis: analysis({
      financial_risk: 10,
      overall_score: 1,
      base: 40,
      bear: 0,
    }),
    fundamentals: fundamentals({
      pe_ttm: -3,
      revenue_ttm: 0,
      consensus_rating: 'Strong Sell',
      fifty_two_week_high: 100,
      fifty_two_week_low: 20,
    }),
    news_sentiment: 'BEARISH',
    news_impact_score: 10,
  });

  // --- the tier thresholds, approached from both sides -------------------------
  // score = 50 + 0.4 * upside (no other term applies): 45 / 65 / 80 / 105
  for (const target of [
    87.49, 87.5, 87.51, 137.49, 137.5, 137.51, 174.99, 175, 175.01,
  ]) {
    add(`tier threshold — base target ${target}`, {
      analysis: analysis({
        financial_risk: 5,
        overall_score: 5,
        base: target,
        bear: 100,
      }),
    });
  }
  return cases;
}

/** mulberry32: a tiny seeded PRNG, so the "random" set never changes. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` reproducible random tickers covering the whole input space. */
export function randomCases(count: number, seed = 20261013): RatingCase[] {
  const rnd = prng(seed);
  const int = (min: number, max: number) =>
    min + Math.floor(rnd() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)];
  const chance = (p: number) => rnd() < p;
  /** A value with `decimals` decimal places, as a column of that scale holds it. */
  const dec = (min: number, max: number, decimals: number) =>
    int(Math.round(min * 10 ** decimals), Math.round(max * 10 ** decimals)) /
    10 ** decimals;

  const cases: RatingCase[] = [];
  for (let i = 0; i < count; i++) {
    const close = chance(0.03) ? null : chance(0.02) ? 0 : dec(0.5, 900, 2);
    const price = close || 100;

    const withAnalysis = !chance(0.1);
    const a: Analysis | null = withAnalysis
      ? {
          // boundaries often, anything in 0–10 otherwise
          financial_risk: chance(0.35)
            ? pick([0, 3, 6, 8, 9, 10])
            : dec(0, 10, 2),
          overall_score: chance(0.35)
            ? pick([0, 4, 6, 7.5, 8, 10])
            : dec(0, 10, 2),
          upside_percent: dec(-90, 300, 2),
          base: chance(0.2)
            ? null
            : chance(0.03)
              ? 0
              : Math.round(price * dec(0.3, 3.2, 2) * 100) / 100,
          bear: chance(0.25)
            ? null
            : chance(0.05)
              ? 0
              : Math.round(price * dec(0.02, 1.1, 2) * 100) / 100,
        }
      : null;

    let f: Fundamentals | null = null;
    if (!chance(0.08)) {
      // 52-week range around the price: inside it, above the high, below the low
      const where = pick([
        'inside',
        'inside',
        'inside',
        'above',
        'below',
        'none',
      ]);
      let low: number | null = null;
      let high: number | null = null;
      if (where !== 'none') {
        const lowFactor =
          where === 'below' ? dec(1.02, 1.6, 2) : dec(0.4, 1, 2);
        const highFactor =
          where === 'above' ? dec(0.5, 0.99, 2) : dec(1, 2.5, 2);
        low = chance(0.1)
          ? null
          : Math.round(price * lowFactor * 10000) / 10000;
        high = chance(0.1)
          ? null
          : Math.round(price * highFactor * 10000) / 10000;
        if (chance(0.03)) high = 0;
        if (chance(0.03)) low = 0;
      }
      f = {
        consensus_rating: pick(CONSENSUS_SPELLINGS),
        pe_ttm: chance(0.2)
          ? null
          : chance(0.1)
            ? 0
            : chance(0.15)
              ? -dec(0.5, 80, 4)
              : chance(0.3)
                ? pick([10, 15, 25])
                : dec(0.5, 120, 4),
        revenue_ttm: chance(0.15)
          ? null
          : chance(0.1)
            ? 0
            : chance(0.03)
              ? -dec(1, 1000, 2)
              : dec(1, 500000000, 2),
        fifty_two_week_high: high,
        fifty_two_week_low: low,
      };
    }

    cases.push({
      name: `random #${i + 1}`,
      close,
      analysis: a,
      fundamentals: f,
      news_sentiment: pick(NEWS_SENTIMENTS),
      news_impact_score: chance(0.3) ? null : int(0, 10),
    });
  }
  return cases;
}

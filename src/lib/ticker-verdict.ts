import { calculateAiRating, calculateLiveUpside } from './rating-utils';
import type { RatingVariant, VerdictInput } from './rating-utils';

/**
 * THE SERVER'S AI RATING.
 *
 * The rating is defined by the clients' maths — `calculateAiRating` in
 * frontend-v2/src/lib/rating-utils.ts (copied byte-for-byte into
 * ./rating-utils.ts) fed by `deriveVerdict` in
 * frontend-v2/src/lib/ticker-metrics.ts. This file is the server's side of it,
 * in two forms that MUST give the same answer for every ticker:
 *
 *   1. TypeScript — `deriveVerdict` (a port of the client function of the same
 *      name) and `tickerVerdict` (database values in, rating out). Used where
 *      the service already holds the row: snapshots, the composite.
 *   2. SQL — `VERDICT_SQL`. Used where the database has to decide: the
 *      analyzer's `aiRating` filter and `ai_rating` sort, the dashboard counts.
 *
 * What keeps them together:
 *   - test-vectors/ai-rating.json — golden inputs → outputs, checked by
 *     src/lib/ticker-verdict.spec.ts AND by the frontend's own test
 *     (frontend-v2/src/lib/ai-rating.vectors.test.ts);
 *   - test/db/ai-rating.db-spec.ts — on a real PostgreSQL, for hundreds of
 *     randomised tickers, the SQL score equals the TypeScript score exactly
 *     and every rating filter returns exactly the tickers TypeScript gives
 *     that rating.
 *
 * A ticker that has never been analysed has NO rating (null) — it is not a
 * "Hold" and not a "Sell", no rating filter matches it and it sorts last.
 */

// ---------------------------------------------------------------------------
// 1. TypeScript
// ---------------------------------------------------------------------------

/** Everything a rating is derived from (client: `VerdictSource`). */
export interface VerdictSource {
  price: number;
  /** Financial risk 0–10; null when the ticker has not been analysed. */
  risk: number | null;
  basePrice?: number | null;
  bearPrice?: number | null;
  /** The stored `upside_percent`, used when there is no base target. */
  upsidePercent?: number | null;
  overallScore?: number | null;
  consensus?: string | null;
  pe?: number | null;
  newsSentiment?: string | null;
  newsImpact?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  revenueTTM?: number | null;
}

export interface Verdict {
  upside: number | null;
  downside: number | null;
  /** True when `downside` was estimated from the risk score (no bear target). */
  downsideEstimated: boolean;
  /** "Strong Buy", "Hold", … or null when the ticker is not analysed. */
  rating: string | null;
  variant: RatingVariant | null;
  /** The weighted verdict score behind the rating; null when not analysed. */
  score: number | null;
  /** What was handed to `calculateAiRating`; null when not analysed. */
  input: VerdictInput | null;
}

const cleanConsensus = (value?: string | null): string | undefined =>
  value && value !== '-' ? value : undefined;

/**
 * Port of the clients' `deriveVerdict` (frontend-v2/src/lib/ticker-metrics.ts)
 * — same statements in the same order. The only additions are the `score` and
 * `input` it also returns, and `null` (instead of the display string "-") for
 * the rating of a ticker that has not been analysed.
 */
export function deriveVerdict(src: VerdictSource): Verdict {
  const { price } = src;
  const hasTarget =
    (typeof src.basePrice === 'number' && src.basePrice > 0) ||
    typeof src.upsidePercent === 'number';
  const upside = hasTarget
    ? calculateLiveUpside(price, src.basePrice, src.upsidePercent)
    : null;

  // Bear-case move from today's price.
  let downside: number | null = null;
  if (typeof src.bearPrice === 'number' && price > 0) {
    downside = ((src.bearPrice - price) / price) * 100;
  }

  // No risk score means no analysis: targets may exist, a rating does not.
  if (src.risk === null || !Number.isFinite(src.risk)) {
    return {
      upside,
      downside,
      downsideEstimated: false,
      rating: null,
      variant: null,
      score: null,
      input: null,
    };
  }
  const risk = src.risk;
  // Without a bear target the downside is estimated from the risk score.
  let downsideEstimated = false;
  if (downside === null) {
    if (risk >= 8) downside = -100;
    else if (risk > 0) downside = -(risk * 2.5);
    downsideEstimated = downside !== null;
  }

  const input: VerdictInput = {
    risk,
    upside: upside ?? 0,
    downside: downside ?? 0,
    overallScore: src.overallScore ?? undefined,
    consensus: cleanConsensus(src.consensus),
    peRatio: src.pe ?? undefined,
    newsSentiment: src.newsSentiment ?? undefined,
    newsImpact: src.newsImpact ?? undefined,
    currentPrice: price,
    fiftyTwoWeekHigh: src.fiftyTwoWeekHigh ?? undefined,
    fiftyTwoWeekLow: src.fiftyTwoWeekLow ?? undefined,
    revenueTTM: src.revenueTTM ?? null,
  };
  const { rating, variant, score } = calculateAiRating(input);
  return {
    upside,
    downside,
    downsideEstimated,
    rating,
    variant,
    score: score ?? null,
    input,
  };
}

/** A numeric column as the database / an entity hands it over. */
type Numeric = number | string | null | undefined;

const num = (value: Numeric): number => Number(value ?? 0);
/** The clients' `Number(x ?? 0) || null`: missing and 0 are both "none". */
const numOrNull = (value: Numeric): number | null => num(value) || null;

/** The stored values of one ticker that its rating is derived from. */
export interface TickerVerdictRow {
  /** `close` of the ticker's latest DAILY candle; null without any price. */
  close: Numeric;
  /** The latest risk analysis; null when the ticker has never been analysed. */
  analysis: {
    financial_risk: Numeric;
    overall_score: Numeric;
    upside_percent: Numeric;
    /** `price_mid` of its 'base' / 'bear' scenario; null when missing. */
    base_price: number | null;
    bear_price: number | null;
  } | null;
  fundamentals: {
    consensus_rating?: string | null;
    pe_ttm?: Numeric;
    revenue_ttm?: Numeric;
    fifty_two_week_high?: Numeric;
    fifty_two_week_low?: Numeric;
  } | null;
  news_sentiment?: string | null;
  news_impact_score?: number | null;
}

/**
 * Database values → rating inputs, the way the clients read the analyzer /
 * snapshot payload (`snapshotToTickerData` in ticker-metrics.ts): the latest
 * stored close is "the price", and a 0 P/E, 52-week bound or revenue counts
 * as missing.
 */
export function verdictSource(row: TickerVerdictRow): VerdictSource {
  const { analysis, fundamentals } = row;
  return {
    price: num(row.close),
    risk: analysis ? Number(analysis.financial_risk || 0) : null,
    basePrice: analysis?.base_price,
    bearPrice: analysis?.bear_price,
    upsidePercent: analysis ? num(analysis.upside_percent) : undefined,
    overallScore: analysis ? num(analysis.overall_score) : undefined,
    consensus: fundamentals?.consensus_rating || '-',
    pe: numOrNull(fundamentals?.pe_ttm),
    newsSentiment: row.news_sentiment,
    newsImpact: row.news_impact_score,
    fiftyTwoWeekHigh: numOrNull(fundamentals?.fifty_two_week_high),
    fiftyTwoWeekLow: numOrNull(fundamentals?.fifty_two_week_low),
    revenueTTM: numOrNull(fundamentals?.revenue_ttm),
  };
}

/** The server's rating of one ticker, from its stored values. */
export function tickerVerdict(row: TickerVerdictRow): Verdict {
  return deriveVerdict(verdictSource(row));
}

/**
 * The two fields every endpoint adds to a ticker's analysis so that a client
 * can show the server's answer instead of recomputing it:
 * `rating` ("Strong Buy" | "Buy" | "Hold" | "Sell" | "Speculative Buy" |
 * "No Brainer") and `rating_score` (the weighted score behind it).
 */
export function ratingFields(row: TickerVerdictRow): {
  rating: string | null;
  rating_score: number | null;
} {
  const verdict = tickerVerdict(row);
  return { rating: verdict.rating, rating_score: verdict.score };
}

/**
 * A scenario's `price_mid` as the number the rating uses: Postgres hands
 * numeric columns back as strings ("140.50"); a missing scenario is null. A
 * target of 0 is a real target (a -100 % bear case), not "missing".
 */
export function toScenarioPrice(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const price = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(price) ? price : null;
}

/** Every rating `calculateAiRating` can return. */
export const AI_RATINGS = [
  'No Brainer',
  'Strong Buy',
  'Buy',
  'Hold',
  'Sell',
  'Speculative Buy',
] as const;
export type AiRating = (typeof AI_RATINGS)[number];

/** A rating filter value as clients send it → the rating it selects. */
export function ratingFilterValue(value: string): AiRating | null {
  if (value === 'Legendary') return 'No Brainer';
  return (AI_RATINGS as readonly string[]).includes(value)
    ? (value as AiRating)
    : null;
}

// ---------------------------------------------------------------------------
// 2. SQL
// ---------------------------------------------------------------------------
//
// The same derivation as SQL expressions over the analyzer's joins. The query
// must join, with exactly these aliases:
//   ticker         tickers
//   price          the ticker's latest DAILY price_ohlcv row
//   risk           the ticker's latest risk_analyses row
//   base_scenario  that analysis' 'base' risk_scenarios row
//   bear_scenario  that analysis' 'bear' risk_scenarios row
//   fund           fundamentals
//
// EXACT equivalence with the TypeScript is the point, so:
//   - every operand is `double precision` — the IEEE-754 double JavaScript
//     computes in. (numeric arithmetic would be decimal and round differently:
//     a score of 79.99999999999999 vs 80 is a different rating.)
//   - every operation is written in the order the TypeScript performs it;
//     floating-point addition is not associative.
// Read each expression next to the statement of rating-utils.ts /
// deriveVerdict it mirrors.

// (CAST(...) rather than `::` — TypeORM's query builder reads `:name` as a
// parameter placeholder.)
const f8 = (expr: string): string => `CAST(${expr} AS double precision)`;

/** price: `Number(latestPrice?.close ?? 0)` */
const P = `COALESCE(${f8('price.close')}, CAST(0 AS double precision))`;
/** risk: financial risk of the latest analysis (NULL = not analysed) */
const R = f8('risk.financial_risk');
const O = f8('risk.overall_score');
const BASE = f8('base_scenario.price_mid');
const BEAR = f8('bear_scenario.price_mid');
const H = f8('fund.fifty_two_week_high');
const L = f8('fund.fifty_two_week_low');
const PE = f8('fund.pe_ttm');
const REV = f8('fund.revenue_ttm');
const CONSENSUS = `LOWER(fund.consensus_rating)`;

/**
 * deriveVerdict: `calculateLiveUpside(price, basePrice, upsidePercent)` — the
 * move to the base target from today's price, or the stored `upside_percent`
 * when there is no usable target or price. NULL when not analysed.
 */
const UPSIDE = `(CASE
    WHEN ${P} > 0 AND ${BASE} > 0 THEN ((${BASE} - ${P}) / ${P}) * 100
    ELSE ${f8('risk.upside_percent')}
  END)`;

/**
 * deriveVerdict: the move to the bear target from today's price; without a
 * bear target an estimate from the risk score (-100 at risk >= 8, otherwise
 * -(risk * 2.5)). NULL when not analysed, and when there is nothing to
 * estimate from (risk 0) — the clients then show no downside.
 */
const DOWNSIDE = `(CASE
    WHEN risk.id IS NULL THEN NULL
    WHEN ${BEAR} IS NOT NULL AND ${P} > 0 THEN ((${BEAR} - ${P}) / ${P}) * 100
    WHEN ${R} >= 8 THEN CAST(-100 AS double precision)
    WHEN ${R} > 0 THEN -(${R} * CAST(2.5 AS double precision))
    ELSE NULL
  END)`;

/** `upside ?? 0` / `downside ?? 0` — what calculateAiRating receives. */
const U = `COALESCE(${UPSIDE}, CAST(0 AS double precision))`;
const D = `COALESCE(${DOWNSIDE}, CAST(0 AS double precision))`;

/** rating-utils 3.6: position of the price in the 52-week range (1 = high). */
const POSITION_IN_RANGE = `(CASE
    WHEN ${H} > ${L} THEN (${P} - ${L}) / (${H} - ${L})
    ELSE CAST(1 AS double precision)
  END)`;

/**
 * calculateAiRating's `score`, term by term in the order the TypeScript adds
 * them. (The probability-weighted branch and its skew bonus do not exist
 * here: no view passes `scenarios`, and deriveVerdict never does.)
 */
const SCORE = `(
    CAST(50 AS double precision)
    -- 1. Upside impact: min(max(-50, upside), 100) * 0.4
    + (LEAST(GREATEST(CAST(-50 AS double precision), ${U}), CAST(100 AS double precision)) * CAST(0.4 AS double precision))
    -- 2. Downside impact: - min(40, |downside| * 0.4)
    - LEAST(CAST(40 AS double precision), ABS(${D}) * CAST(0.4 AS double precision))
    -- 3. Risk penalty / bonus
    + (CASE WHEN ${R} >= 8 THEN -20 WHEN ${R} >= 6 THEN -10 WHEN ${R} <= 3 THEN 5 ELSE 0 END)
    -- 3.5 52-week high penalty (needs a price and a high)
    + (CASE
        WHEN ${P} <> 0 AND ${H} > 0 THEN
          (CASE
            WHEN ${P} >= CAST(0.98 AS double precision) * ${H} THEN -20
            WHEN ${P} >= CAST(0.9 AS double precision) * ${H} THEN -10
            WHEN ${P} >= CAST(0.8 AS double precision) * ${H} THEN -5
            ELSE 0
          END)
        ELSE 0
      END)
    -- 3.6 52-week low reward, unless it is a falling knife
    + (CASE
        WHEN ${P} <> 0 AND ${L} > 0 THEN
          (CASE
            WHEN ${CONSENSUS} LIKE '%sell%' AND ${D} <= -99 THEN 0
            WHEN ${P} <= CAST(1.05 AS double precision) * ${L} OR ${POSITION_IN_RANGE} <= CAST(0.05 AS double precision) THEN 10
            WHEN ${P} <= CAST(1.25 AS double precision) * ${L} OR ${POSITION_IN_RANGE} <= CAST(0.2 AS double precision) THEN 5
            ELSE 0
          END)
        ELSE 0
      END)
    -- 3.7 No-revenue penalty: revenue missing or 0
    + (CASE WHEN ${REV} IS NULL OR ${REV} = 0 THEN -5 ELSE 0 END)
    -- 4. Neural score ("if (overallScore)": a score of 0 counts as missing)
    + (CASE
        WHEN ${O} IS NULL OR ${O} = 0 THEN 0
        WHEN ${O} >= 8 THEN 20
        WHEN ${O} >= 6 THEN 10
        WHEN ${O} <= 4 THEN -10
        ELSE 0
      END)
    -- 5. Analyst consensus (substring match on the lower-cased text)
    + (CASE
        WHEN ${CONSENSUS} LIKE '%strong buy%' THEN 10
        WHEN ${CONSENSUS} LIKE '%buy%' THEN 5
        WHEN ${CONSENSUS} LIKE '%sell%' THEN -10
        ELSE 0
      END)
    -- 6. News (exact, case-sensitive 'BULLISH' / 'BEARISH')
    + (CASE
        WHEN ticker.news_impact_score >= 8 AND ticker.news_sentiment = 'BULLISH' THEN 15
        WHEN ticker.news_impact_score >= 8 AND ticker.news_sentiment = 'BEARISH' THEN -15
        WHEN ticker.news_impact_score >= 5 AND ticker.news_impact_score < 8 AND ticker.news_sentiment = 'BULLISH' THEN 5
        WHEN ticker.news_impact_score >= 5 AND ticker.news_impact_score < 8 AND ticker.news_sentiment = 'BEARISH' THEN -5
        ELSE 0
      END)
    -- 7. P/E: only a positive P/E earns anything
    + (CASE
        WHEN ${PE} > 0 AND ${PE} <= 10 THEN 20
        WHEN ${PE} > 0 AND ${PE} <= 15 THEN 15
        WHEN ${PE} > 0 AND ${PE} <= 25 THEN 5
        ELSE 0
      END)
  )`;

/** The score of an analysed ticker; NULL for one that has no analysis. */
const SCORE_OR_NULL = `(CASE WHEN risk.id IS NULL THEN NULL ELSE ${SCORE} END)`;

/** calculateAiRating's verdict; NULL for a ticker that has no analysis. */
const RATING = `(CASE
    WHEN risk.id IS NULL THEN NULL
    WHEN ${R} >= 8 AND (${U} >= 100 OR ${O} >= 7.5) THEN 'Speculative Buy'
    WHEN ${R} >= 9 AND ${SCORE} < 70 THEN 'Sell'
    WHEN ${SCORE} > 105 THEN 'No Brainer'
    WHEN ${SCORE} >= 80 THEN 'Strong Buy'
    WHEN ${SCORE} >= 65 THEN 'Buy'
    WHEN ${SCORE} >= 45 THEN 'Hold'
    ELSE 'Sell'
  END)`;

export const VERDICT_SQL = {
  /** Upside in percent as the clients show it; NULL when not analysed. */
  upside: UPSIDE,
  /** Downside in percent as the clients show it; NULL when there is none. */
  downside: DOWNSIDE,
  /** The weighted verdict score; NULL when not analysed. */
  score: SCORE_OR_NULL,
  /** The rating text; NULL when not analysed. */
  rating: RATING,
} as const;

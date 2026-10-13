import type { StockSnapshot } from '../hooks/useStockAnalyzer';
import type { TickerData } from '../components/dashboard/WatchlistTableView';
import type { BadgeProps } from '../components/ui/badge';
import { calculateAiRating, calculateLiveUpside, type RatingVariant } from './rating-utils';

export type RiskBand = 'low' | 'medium' | 'high';
export type ScoreBand = 'good' | 'fair' | 'poor';

/**
 * The band of a 0–10 risk score. The score is rounded first, because views
 * print the rounded number: "3" is always low, "4" always medium, "7" always
 * high — the figure and its colour can never disagree.
 */
export function riskBand(value: number): RiskBand {
  const n = Math.round(value);
  return n <= 3 ? 'low' : n <= 6 ? 'medium' : 'high';
}

/** The band of a 0–10 risk/reward score: 7 and up is good, 5 and up fair. */
export function scoreBand(value: number): ScoreBand {
  return value >= 7 ? 'good' : value >= 5 ? 'fair' : 'poor';
}

/** Text colour for each band — theme tokens, so they hold in light themes. */
export const RISK_TEXT: Record<RiskBand, string> = {
  low: 'text-up',
  medium: 'text-amber-600 dark:text-yellow-500',
  high: 'text-down',
};
export const SCORE_TEXT: Record<ScoreBand, string> = {
  good: 'text-up',
  fair: 'text-amber-600 dark:text-yellow-500',
  poor: 'text-down',
};

/** Everything a rating is derived from. Missing fields are simply left out. */
export interface VerdictSource {
  price: number;
  /** Financial risk 0–10; null when the ticker has not been analysed. */
  risk: number | null;
  basePrice?: number | null;
  bearPrice?: number | null;
  /** Backend's pre-computed upside, used when there is no base target. */
  upsidePercent?: number | null;
  overallScore?: number | null;
  consensus?: string | null;
  pe?: number | null;
  newsSentiment?: string | null;
  newsImpact?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  /**
   * Trailing-twelve-month revenue. The rating takes 5 points off a company
   * with none; leaving this out makes EVERY company look pre-revenue, which
   * is how badges used to disagree with the server's rating filter.
   */
  revenueTTM?: number | null;
}

export interface Verdict {
  upside: number | null;
  downside: number | null;
  /**
   * True when there is no bear-case target and `downside` was estimated from
   * the risk score. It still feeds the rating; views must mark it ("≈").
   */
  downsideEstimated: boolean;
  /** "Strong Buy", "Hold", … or "-" when the ticker is not analysed. */
  rating: string;
  variant: RatingVariant | null;
}

const cleanConsensus = (value?: string | null): string | undefined =>
  value && value !== '-' ? value : undefined;

/**
 * The one derivation of upside, downside and AI rating. Every view (rows,
 * cards, tables, the dashboard filters) goes through here, so a ticker reads
 * the same wherever it appears.
 */
export function deriveVerdict(src: VerdictSource): Verdict {
  const { price } = src;
  const hasTarget =
    (typeof src.basePrice === 'number' && src.basePrice > 0) || typeof src.upsidePercent === 'number';
  const upside = hasTarget ? calculateLiveUpside(price, src.basePrice, src.upsidePercent) : null;

  // Bear-case move from today's price.
  let downside: number | null = null;
  if (typeof src.bearPrice === 'number' && price > 0) {
    downside = ((src.bearPrice - price) / price) * 100;
  }

  // No risk score means no analysis: targets may exist, a rating does not.
  if (src.risk === null || !Number.isFinite(src.risk)) {
    return { upside, downside, downsideEstimated: false, rating: '-', variant: null };
  }
  const risk = src.risk;
  // Without a bear target the downside is estimated from the risk score.
  let downsideEstimated = false;
  if (downside === null) {
    if (risk >= 8) downside = -100;
    else if (risk > 0) downside = -(risk * 2.5);
    downsideEstimated = downside !== null;
  }

  const { rating, variant } = calculateAiRating({
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
  });
  return { upside, downside, downsideEstimated, rating, variant };
}

/**
 * Props for `VerdictBadge` / `TickerCard`: the same inputs `deriveVerdict`
 * used, so the badge they compute matches the row's stamp and the filters.
 */
export function verdictProps(item: TickerData) {
  return {
    risk: item.riskScore ?? 0,
    upside: item.potentialUpside ?? 0,
    downside: item.potentialDownside ?? 0,
    overallScore: item.overallScore ?? undefined,
    consensus: cleanConsensus(item.rating),
    pe: item.pe ?? undefined,
    newsSentiment: item.newsSentiment ?? undefined,
    newsImpact: item.newsImpact ?? undefined,
    currentPrice: item.price,
    fiftyTwoWeekHigh: item.fiftyTwoWeekHigh ?? undefined,
    fiftyTwoWeekLow: item.fiftyTwoWeekLow ?? undefined,
    revenueTTM: item.revenueTTM ?? null,
  };
}

/** The parts of a ticker-detail style payload a rating is derived from. */
export interface DetailVerdictSource {
  price: number;
  risk_analysis: {
    financial_risk: number;
    overall_score?: number | null;
    upside_percent?: number | null;
    scenarios?: Array<{ scenario_type: string; price_mid: number | string }> | null;
  };
  fundamentals?: {
    consensus_rating?: string | null;
    pe_ratio?: number | null;
    fifty_two_week_high?: number | null;
    fifty_two_week_low?: number | null;
    revenue_ttm?: number | null;
  } | null;
  news?: { sentiment?: string | null; score?: number | null } | null;
}

const scenarioPrice = (scenarios: DetailVerdictSource['risk_analysis']['scenarios'], type: string): number | null => {
  const hit = scenarios?.find((s) => s.scenario_type?.toLowerCase() === type);
  const price = hit ? Number(hit.price_mid) : NaN;
  return Number.isFinite(price) && price > 0 ? price : null;
};

/**
 * `VerdictBadge` props for a page that holds the full ticker payload (ticker
 * detail, research note, public report). Same derivation as the lists, so a
 * ticker's badge on its own page matches its row everywhere else.
 */
export function detailVerdictProps(src: DetailVerdictSource) {
  const { price, risk_analysis: risk, fundamentals, news } = src;
  const source: VerdictSource = {
    price,
    risk: risk.financial_risk,
    basePrice: scenarioPrice(risk.scenarios, 'base'),
    bearPrice: scenarioPrice(risk.scenarios, 'bear'),
    upsidePercent: risk.upside_percent,
    overallScore: risk.overall_score,
    consensus: fundamentals?.consensus_rating,
    pe: fundamentals?.pe_ratio,
    newsSentiment: news?.sentiment,
    newsImpact: news?.score,
    fiftyTwoWeekHigh: fundamentals?.fifty_two_week_high,
    fiftyTwoWeekLow: fundamentals?.fifty_two_week_low,
    revenueTTM: fundamentals?.revenue_ttm,
  };
  const verdict = deriveVerdict(source);
  return {
    risk: risk.financial_risk,
    upside: verdict.upside ?? 0,
    downside: verdict.downside ?? 0,
    overallScore: risk.overall_score ?? undefined,
    consensus: cleanConsensus(fundamentals?.consensus_rating),
    pe: fundamentals?.pe_ratio ?? undefined,
    newsSentiment: news?.sentiment ?? undefined,
    newsImpact: news?.score ?? undefined,
    currentPrice: price,
    fiftyTwoWeekHigh: fundamentals?.fifty_two_week_high ?? undefined,
    fiftyTwoWeekLow: fundamentals?.fifty_two_week_low ?? undefined,
    revenueTTM: fundamentals?.revenue_ttm ?? null,
  };
}

/** An analyzer snapshot as the flat record every ticker view renders. */
export function snapshotToTickerData(item: StockSnapshot): TickerData {
  const riskRaw = item.aiAnalysis?.financial_risk;
  const risk = item.aiAnalysis ? (typeof riskRaw === 'number' ? riskRaw : Number(riskRaw || 0)) : null;
  const currentPrice = Number(item.latestPrice?.close ?? 0);
  const fiftyTwoWeekHigh = Number(item.fundamentals?.fifty_two_week_high ?? 0) || null;
  const fiftyTwoWeekLow = Number(item.fundamentals?.fifty_two_week_low ?? 0) || null;
  const pe = Number(item.fundamentals?.pe_ttm ?? 0) || null;
  const consensus = (item.fundamentals?.consensus_rating as string) || '-';
  const revenueTTM = Number(item.fundamentals?.revenue_ttm ?? 0) || null;

  const verdict = deriveVerdict({
    price: currentPrice,
    risk,
    basePrice: item.aiAnalysis?.base_price,
    bearPrice: item.aiAnalysis?.bear_price,
    upsidePercent: item.aiAnalysis?.upside_percent,
    overallScore: item.aiAnalysis?.overall_score,
    consensus,
    pe,
    newsSentiment: item.ticker.news_sentiment,
    newsImpact: item.ticker.news_impact_score,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    revenueTTM,
  });

  return {
    symbol: item.ticker.symbol,
    company: item.ticker.name,
    logo: item.ticker.logo_url,
    sector:
      item.ticker.industry ||
      item.ticker.sector ||
      (item.fundamentals?.sector as string) ||
      'Unknown',
    price: currentPrice,
    change: Number(item.latestPrice?.change ?? 0),
    pe,
    marketCap: Number(item.fundamentals?.market_cap ?? 0) || null,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    potentialUpside: verdict.upside,
    potentialDownside: verdict.downside,
    downsideEstimated: verdict.downsideEstimated,
    riskScore: risk,
    rating: consensus,
    aiRating: verdict.rating,
    aiRatingVariant: verdict.variant,
    newsSentiment: item.ticker.news_sentiment ?? null,
    newsImpact: item.ticker.news_impact_score ?? null,
    revenueTTM,
    analystCount: item.counts?.analysts || 0,
    newsCount: item.counts?.news || 0,
    researchCount: item.counts?.research || 0,
    socialCount: item.counts?.social || 0,
    overallScore: item.aiAnalysis?.overall_score ?? null,
    itemId: item.ticker.id,
    sparkline: item.sparkline,
    currency: item.ticker.currency || 'USD',
  };
}

export interface RatingStamp {
  label: string;
  variant: BadgeProps['variant'];
}

const VARIANT_BY_RATING: Record<string, RatingVariant> = {
  'No Brainer': 'legendary',
  'Strong Buy': 'strongBuy',
  Buy: 'buy',
  Hold: 'hold',
  Sell: 'sell',
  'Speculative Buy': 'speculativeBuy',
};

/**
 * The AI rating as a short stamp for list rows — the rating already derived
 * for the record, never a second calculation. Returns null when the ticker
 * has not been analysed: "not rated" is not "Hold".
 */
export function ratingStamp(item: TickerData): RatingStamp | null {
  if (!item.aiRating || item.aiRating === '-') return null;
  const variant = item.aiRatingVariant ?? VARIANT_BY_RATING[item.aiRating] ?? 'outline';
  // Rows have room for a word or two, not "Speculative Buy" at full length.
  const label = item.aiRating === 'Speculative Buy' ? 'Spec buy' : item.aiRating;
  return { label, variant: (variant === 'default' ? 'outline' : variant) as BadgeProps['variant'] };
}

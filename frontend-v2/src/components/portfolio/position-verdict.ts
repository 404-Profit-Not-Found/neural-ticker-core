import { deriveVerdict, type Verdict, type VerdictSource } from '../../lib/ticker-metrics';

/** The fields of a position that a rating is derived from. */
export interface PositionVerdictInput {
    current_price?: number | string | null;
    /** Native close when the row was converted to the display currency. */
    original_current_price?: number | null;
    /** Live native quote merged from the market snapshot. */
    quote?: { c?: number | null } | null;
    fiftyTwoWeekHigh?: number | null;
    fiftyTwoWeekLow?: number | null;
    fundamentals?: {
        pe_ttm?: number | string | null;
        consensus_rating?: string | null;
        fifty_two_week_high?: number | string | null;
        fifty_two_week_low?: number | string | null;
        revenue_ttm?: number | string | null;
    } | null;
    /** The position carries its ticker entity, news read-out included. */
    ticker?: { news_sentiment?: string | null; news_impact_score?: number | string | null; [key: string]: unknown } | null;
    aiAnalysis?: {
        financial_risk?: number | null;
        overall_score?: number | null;
        upside_percent?: number | null;
        base_price?: number | null;
        bear_price?: number | null;
    } | null;
}

/**
 * The instrument's price in its OWN currency. Price targets and the 52-week
 * range are native, while `current_price` is converted to the Portfolio
 * display currency — comparing those would turn an FX rate into "upside".
 */
export function nativePrice(position: PositionVerdictInput): number {
    const price = Number(position.quote?.c ?? position.original_current_price ?? position.current_price ?? 0);
    return Number.isFinite(price) ? price : 0;
}

/** Postgres decimals arrive as strings; anything unusable is "missing". */
const num = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n !== 0 ? n : null;
};

export function positionVerdictSource(position: PositionVerdictInput): VerdictSource {
    const risk = position.aiAnalysis?.financial_risk;
    return {
        price: nativePrice(position),
        risk: typeof risk === 'number' && Number.isFinite(risk) ? risk : null,
        basePrice: position.aiAnalysis?.base_price,
        bearPrice: position.aiAnalysis?.bear_price,
        upsidePercent: position.aiAnalysis?.upside_percent,
        overallScore: position.aiAnalysis?.overall_score,
        consensus: position.fundamentals?.consensus_rating,
        pe: num(position.fundamentals?.pe_ttm),
        // The same news read-out the Tickers / Watchlist rows use.
        newsSentiment: position.ticker?.news_sentiment ?? null,
        newsImpact: num(position.ticker?.news_impact_score),
        // Merged from the market snapshot when present, else the position's own fundamentals.
        fiftyTwoWeekHigh: num(position.fiftyTwoWeekHigh ?? position.fundamentals?.fifty_two_week_high),
        fiftyTwoWeekLow: num(position.fiftyTwoWeekLow ?? position.fundamentals?.fifty_two_week_low),
        revenueTTM: num(position.fundamentals?.revenue_ttm),
    };
}

/**
 * Upside, downside and AI rating of a holding — through the app's single
 * derivation (`lib/ticker-metrics`), so a position reads the same in the
 * Portfolio table, cards and filters as on Tickers, Watchlist and its own page.
 */
export function positionVerdict(position: PositionVerdictInput): Verdict {
    return deriveVerdict(positionVerdictSource(position));
}

/** `VerdictBadge` props built from the same inputs the verdict used. */
export function positionVerdictBadgeProps(position: PositionVerdictInput) {
    const source = positionVerdictSource(position);
    const verdict = deriveVerdict(source);
    const consensus = source.consensus && source.consensus !== '-' ? source.consensus : undefined;
    return {
        risk: source.risk ?? 0,
        upside: verdict.upside ?? 0,
        downside: verdict.downside ?? 0,
        overallScore: source.overallScore ?? undefined,
        consensus,
        pe: source.pe ?? undefined,
        newsSentiment: source.newsSentiment ?? undefined,
        newsImpact: source.newsImpact ?? undefined,
        currentPrice: source.price,
        fiftyTwoWeekHigh: source.fiftyTwoWeekHigh ?? undefined,
        fiftyTwoWeekLow: source.fiftyTwoWeekLow ?? undefined,
        revenueTTM: source.revenueTTM ?? null,
        analysed: source.risk !== null,
    };
}

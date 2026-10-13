import { Link } from 'react-router-dom';
import { ArrowUp, ArrowDown, Brain, Newspaper, MessageCircle, Star } from 'lucide-react';
import { preloadRoute } from '../../app/routes';
import { Sparkline } from '../ui/Sparkline';
import { RiskBar } from '../ui/RiskBar';
import { cn } from '../../lib/api';
import { TickerLogo } from '../dashboard/TickerLogo';
import { VerdictBadge } from './VerdictBadge';
import { useFavorite } from '../../hooks/useWatchlist';
import type { MarketStatusData } from '../../hooks/useMarketStatus';
import { useCurrency } from '../../context/CurrencyContext';
import { SCORE_TEXT, scoreBand } from '../../lib/ticker-metrics';

export interface TickerCardProps {
    symbol: string;
    name: string;
    logoUrl?: string;
    industry?: string;
    sector?: string;
    price: number;
    change: number;
    risk: number;
    overallScore?: number | null;
    upside: number;
    downside: number;
    /** `downside` is an estimate from the risk score (no bear-case target). */
    downsideEstimated?: boolean;
    pe?: number | null;
    consensus?: string | null;
    researchCount?: number;
    newsCount?: number;
    socialCount?: number;
    newsSentiment?: string;
    newsImpact?: number;
    sparkline?: number[];
    fiftyTwoWeekLow?: number;
    fiftyTwoWeekHigh?: number;
    /** Trailing revenue — a rating input. */
    revenueTTM?: number | null;
    className?: string;
    /** Extra control for the card's footer (e.g. remove from a watchlist). */
    children?: React.ReactNode;
    marketStatus?: MarketStatusData | null; // Allow passing status directly to avoid hook call
    currency?: string;
}

import { FiftyTwoWeekRange } from '../dashboard/FiftyTwoWeekRange';
import { useTickerMarketStatus, getSessionLabel, getSessionColor } from '../../hooks/useMarketStatus';

/** One figure with its caption: the unit of the card's readout row. */
function Readout({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="label-micro truncate">{label}</dt>
            <dd className="mt-1.5 flex h-4 items-center">{children}</dd>
        </div>
    );
}

/** Signed percentage with a real minus sign; one decimal. */
const signedPct = (value: number): string =>
    `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}%`;

/**
 * The full analysis card (desktop grids). One tonal surface, no outline and no
 * rules inside it: the blocks are separated by spacing alone, and the four
 * figures that are read together — upside, downside, risk, risk/reward — sit
 * in one row.
 */
export function TickerCard({
    symbol,
    name,
    logoUrl,
    industry,
    sector,
    price,
    change,
    risk,
    overallScore,
    upside,
    downside,
    downsideEstimated,
    pe,
    consensus,
    researchCount = 0,
    newsCount = 0,
    socialCount = 0,
    newsSentiment,
    newsImpact,
    sparkline,
    fiftyTwoWeekLow,
    fiftyTwoWeekHigh,
    revenueTTM,
    className,
    children,
    marketStatus,
    currency = 'USD'
}: TickerCardProps) {
    const { formatNative } = useCurrency();
    // Use the status passed in; otherwise fetch it per ticker.
    const { data: fetchedStatus } = useTickerMarketStatus(symbol, !marketStatus);
    const status = marketStatus || fetchedStatus;

    const { isFavorite, toggle } = useFavorite(symbol);

    const sessionLabel = status?.session ? getSessionLabel(status.session) : 'Closed';
    const sessionColor = status?.session ? getSessionColor(status.session) : 'text-muted-foreground';

    // Tone for the RGB theme's hover glow.
    let tone = 'primary';
    if (risk > 6.5) tone = 'red';
    else if (risk <= 3.5) tone = 'emerald';
    else if (overallScore && overallScore >= 7) tone = 'yellow';

    const to = `/ticker/${encodeURIComponent(symbol)}`;
    const flat = Math.abs(change) < 0.005;
    const hasScore = typeof overallScore === 'number' && overallScore > 0;
    const counts = [
        { n: researchCount, Icon: Brain, label: 'research reports', tint: 'text-purple-700 dark:text-purple-400 bg-purple-500/10' },
        { n: newsCount, Icon: Newspaper, label: 'news items', tint: 'text-sky-700 dark:text-sky-400 bg-sky-500/10' },
        { n: socialCount, Icon: MessageCircle, label: 'comments', tint: 'text-blue-700 dark:text-blue-400 bg-blue-500/10' },
    ].filter((c) => c.n > 0);

    return (
        <article
            data-tone={tone}
            className={cn(
                'ticker-card group relative flex h-full w-full min-w-0 flex-col gap-4 rounded-md bg-card p-4 transition-colors duration-150 hover:bg-muted/70 focus-within:bg-muted/70',
                className,
            )}
        >
            {/* Identity */}
            <div className="flex items-start gap-3">
                <TickerLogo url={logoUrl} symbol={symbol} className="h-11 w-11 shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        {/* Never squeezed: a ticker that reads "C…" is not a ticker. */}
                        <div className="flex shrink-0 items-center gap-1">
                            {/* The symbol is the card's link; its hit area is the whole card. */}
                            <Link
                                to={to}
                                onMouseEnter={() => preloadRoute(to)}
                                onFocus={() => preloadRoute(to)}
                                className="whitespace-nowrap text-lg font-bold leading-none tracking-tight text-foreground outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring"
                            >
                                {symbol}
                            </Link>
                            <button
                                type="button"
                                onClick={toggle}
                                aria-pressed={isFavorite}
                                aria-label={isFavorite ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
                                title={isFavorite ? 'Remove from Watchlist' : 'Add to Watchlist'}
                                className="relative z-10 -my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <Star
                                    size={16}
                                    className={isFavorite ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground/60 group-hover:text-muted-foreground'}
                                />
                            </button>
                        </div>
                        <VerdictBadge
                            compact
                            risk={risk}
                            upside={upside}
                            downside={downside}
                            overallScore={overallScore}
                            consensus={consensus && consensus !== '-' ? consensus : undefined}
                            pe={pe as number}
                            newsSentiment={newsSentiment}
                            newsImpact={newsImpact}
                            currentPrice={price}
                            fiftyTwoWeekHigh={fiftyTwoWeekHigh}
                            fiftyTwoWeekLow={fiftyTwoWeekLow}
                            revenueTTM={revenueTTM}
                            className="relative z-10 shrink-0"
                        />
                    </div>
                    <p className="mt-1.5 truncate text-sm leading-tight text-muted-foreground">{name}</p>
                    <p className="mt-1 truncate text-xs leading-tight text-muted-foreground/80">
                        {industry || sector || 'Unknown'}
                    </p>
                </div>
            </div>

            {/* Price and 14-day trend */}
            <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                        <span className="num text-[1.375rem] font-bold leading-none text-foreground">
                            {formatNative(price, currency)}
                        </span>
                        <span
                            className={cn(
                                'num flex items-center gap-0.5 text-xs font-semibold',
                                flat ? 'text-muted-foreground' : change > 0 ? 'text-up' : 'text-down',
                            )}
                        >
                            {!flat && (change > 0 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                            <span className="sr-only">{flat ? 'unchanged' : change > 0 ? 'up' : 'down'} </span>
                            {Math.abs(change).toFixed(2)}%
                        </span>
                    </div>
                    <p className={cn('label-micro mt-2', sessionColor)}>{sessionLabel}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                    {sparkline && sparkline.length > 1 ? (
                        <Sparkline
                            data={sparkline}
                            width={104}
                            height={36}
                            className="opacity-90 transition-opacity group-hover:opacity-100"
                        />
                    ) : (
                        <span className="flex h-9 items-center text-[11px] text-muted-foreground">No trend yet</span>
                    )}
                    <span className="label-micro mt-2">14 days</span>
                </div>
            </div>

            {fiftyTwoWeekLow && fiftyTwoWeekHigh ? (
                <FiftyTwoWeekRange
                    low={fiftyTwoWeekLow}
                    high={fiftyTwoWeekHigh}
                    current={price}
                    showLabels
                    className="w-full"
                    currency={currency}
                />
            ) : null}

            {/* The four figures that are read together, side by side. */}
            <dl className="grid grid-cols-[1fr_1fr_1fr_auto] gap-x-3">
                <Readout label="Upside">
                    <span className={cn('num text-[13px] font-semibold leading-none', upside > 0 ? 'text-up' : upside < 0 ? 'text-down' : 'text-muted-foreground')}>
                        {signedPct(upside)}
                    </span>
                </Readout>
                <Readout label="Downside">
                    {downsideEstimated ? (
                        <span
                            className="num text-[13px] font-medium leading-none text-muted-foreground"
                            title="Estimated from the risk score — no bear-case target for this ticker"
                        >
                            ≈ {signedPct(downside)}
                        </span>
                    ) : (
                        <span className={cn('num text-[13px] font-semibold leading-none', downside < 0 ? 'text-down' : 'text-muted-foreground')}>
                            {signedPct(downside)}
                        </span>
                    )}
                </Readout>
                <Readout label="Risk">
                    <RiskBar value={risk} segments={5} size="sm" />
                </Readout>
                <Readout label="R/R">
                    <span
                        title="Risk/reward score, 0–10"
                        className={cn(
                            'num text-[13px] font-semibold leading-none',
                            hasScore ? SCORE_TEXT[scoreBand(overallScore!)] : 'text-muted-foreground',
                        )}
                    >
                        {hasScore ? overallScore!.toFixed(1) : '—'}
                    </span>
                </Readout>
            </dl>

            {(counts.length > 0 || children) && (
                <div className="mt-auto flex min-h-6 items-center gap-2">
                    {counts.map(({ n, Icon, label, tint }) => (
                        <span key={label} className={cn('num flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium', tint)}>
                            <Icon size={12} aria-hidden />
                            {n}
                            <span className="sr-only"> {label}</span>
                        </span>
                    ))}
                    {children && <div className="relative z-10 ml-auto flex items-center gap-1">{children}</div>}
                </div>
            )}
        </article>
    );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, type BadgeProps } from '../ui/badge';
import { RiskBar } from '../ui/RiskBar';
import { Skeleton } from '../ui/skeleton';
import { Sparkline } from '../ui/Sparkline';
import { TickerLogo } from './TickerLogo';
import type { TickerData } from './WatchlistTableView';
import { useCurrency } from '../../context/CurrencyContext';
import { preloadRoute } from '../../app/routes';
import { formatPrice } from '../../lib/format';
import { ratingStamp } from '../../lib/ticker-metrics';
import { cn } from '../../lib/utils';

/**
 * Box of a row — shared with its skeleton, so content never jumps when it
 * replaces the placeholder. 76px tall: 10 + 18 + 16 + 4 + 18 + 10.
 */
const ROW_BOX = 'flex h-[4.75rem] items-center gap-2.5 px-3.5';

export interface TickerListRowProps {
    symbol: string;
    name: string;
    logoUrl?: string;
    price: number;
    /** Day change in percent. */
    change: number;
    currency?: string;
    sparkline?: number[];
    /** Pre-computed rating stamp shown next to the symbol. */
    rating?: { label: string; variant: BadgeProps['variant'] } | null;
    /** One short line under the name (e.g. upside and risk). */
    meta?: ReactNode;
    /**
     * A control that belongs to the row but is not the row's link (e.g.
     * "remove from watchlist"). Rendered beside the link, never inside it.
     */
    action?: ReactNode;
    className?: string;
}

/**
 * A ticker as one compact, tappable "mini card" — the unit for any collection
 * of tickers on a phone (see DESIGN.md §6 "Rows, not cards"). The row is one
 * tonal surface with no outline; the whole of it is a single link.
 *
 *   [logo]  SYMBOL [RATING]               ~~~      $172.30
 *           Company name                           +5.87%
 *           meta line (full width)
 */
export function TickerListRow({
    symbol,
    name,
    logoUrl,
    price,
    change,
    currency = 'USD',
    sparkline,
    rating,
    meta,
    action,
    className,
}: TickerListRowProps) {
    const { formatNative } = useCurrency();
    const to = `/ticker/${encodeURIComponent(symbol)}`;
    // Exactly zero is neutral — never dressed up as a gain.
    const flat = Math.abs(change) < 0.005;
    const up = change > 0;
    const stamp = rating ? (
        <Badge variant={rating.variant} className="h-[18px] shrink-0 px-1.5 text-[10px]">
            {rating.label}
        </Badge>
    ) : null;
    // The stamp sits beside the symbol when both fit the name column (about
    // 136px on a 390px phone); otherwise it leads the meta line. Never
    // squeezed, never over the sparkline.
    const stampInMeta = !!rating && symbol.length * 10 + rating.label.length * 7 + 20 > 136;
    // A row with its own control (edit mode) gives the sparkline's room to it.
    const showSparkline = !action && !!sparkline && sparkline.length > 1;

    return (
        <div className={cn('flex items-stretch overflow-hidden rounded-lg bg-card', className)}>
            <Link
                to={to}
                onTouchStart={() => preloadRoute(to)}
                onMouseEnter={() => preloadRoute(to)}
                className={cn(ROW_BOX, 'min-w-0 flex-1 transition-colors hover:bg-muted/60 active:bg-muted focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring')}
            >
                <TickerLogo url={logoUrl} symbol={symbol} className="h-10 w-10 shrink-0" />

                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2.5">
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                                {/* A symbol is an identifier: it never truncates. */}
                                <span className="shrink-0 text-[15px] font-semibold leading-tight text-foreground">{symbol}</span>
                                {!stampInMeta && stamp}
                            </span>
                            <span className="block truncate text-[13px] leading-tight text-muted-foreground">{name}</span>
                        </span>

                        {showSparkline && (
                            <span className="hidden shrink-0 min-[380px]:block">
                                <Sparkline data={sparkline!} width={48} height={28} label="14-day trend" />
                            </span>
                        )}

                        <span className="flex min-w-[4.75rem] shrink-0 flex-col items-end gap-1">
                            <span className="num text-[15px] font-semibold leading-none text-foreground">
                                {/* Six-figure prices are shortened so the column stays aligned. */}
                                {price <= 0 ? '—' : price >= 100_000 ? formatPrice(price, currency, { compact: true }) : formatNative(price, currency)}
                            </span>
                            <span
                                className={cn(
                                    'num text-[13px] font-medium leading-none',
                                    flat ? 'text-muted-foreground' : up ? 'text-up' : 'text-down',
                                )}
                            >
                                {flat ? '' : up ? '+' : '−'}
                                {Math.abs(change).toFixed(2)}%
                            </span>
                        </span>
                    </span>

                    {/* Full width, so it never wraps around the sparkline and price. */}
                    {/* A fixed-height line: every row is the same height, stamp or not. */}
                    {(meta || (stampInMeta && stamp)) && (
                        <span className="mt-1 flex h-[18px] items-center gap-3 whitespace-nowrap text-xs leading-none text-muted-foreground">
                            {stampInMeta && stamp}
                            {meta}
                        </span>
                    )}
                </span>
            </Link>
            {action}
        </div>
    );
}

/** The standard third line of a row: upside and risk, when the ticker has them. */
export function TickerRowMeta({ item }: { item: TickerData }) {
    const upside = item.potentialUpside;
    const hasUpside = typeof upside === 'number';
    const hasRisk = typeof item.riskScore === 'number';
    if (!hasUpside && !hasRisk) return <span>Not analysed yet</span>;
    return (
        <>
            {hasUpside && (
                <span className={cn('num font-medium', upside > 0 ? 'text-up' : upside < 0 ? 'text-down' : 'text-muted-foreground')}>
                    {upside > 0 ? '+' : upside < 0 ? '−' : ''}
                    {Math.abs(upside).toFixed(1)}% upside
                </span>
            )}
            {hasRisk && (
                <span className="inline-flex items-center gap-1.5">
                    Risk <RiskBar value={item.riskScore} segments={5} size="sm" />
                </span>
            )}
        </>
    );
}

interface TickerRowListProps {
    items: TickerData[];
    /** Optional per-row control, e.g. remove from a watchlist. */
    renderAction?: (item: TickerData) => ReactNode;
    className?: string;
}

/**
 * A collection of tickers as mini cards: separate tonal rows with a small gap
 * between them — no outline around the list and no rules between its rows.
 */
export function TickerRowList({ items, renderAction, className }: TickerRowListProps) {
    return (
        <ul className={cn('space-y-1.5', className)}>
            {items.map((item) => (
                <li key={item.symbol}>
                    <TickerListRow
                        symbol={item.symbol}
                        name={item.company}
                        logoUrl={item.logo}
                        price={item.price}
                        change={item.change ?? 0}
                        currency={item.currency}
                        sparkline={item.sparkline}
                        rating={ratingStamp(item)}
                        meta={<TickerRowMeta item={item} />}
                        action={renderAction?.(item)}
                    />
                </li>
            ))}
        </ul>
    );
}

/** Loading state shaped like the rows it stands in for. */
export function TickerRowListSkeleton({ rows = 6, label = 'Loading tickers' }: { rows?: number; label?: string }) {
    return (
        <div role="status" aria-label={label} className="space-y-1.5">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className={cn(ROW_BOX, 'rounded-lg bg-card')}>
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3 w-36" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="ml-auto h-3.5 w-16" />
                        <Skeleton className="ml-auto h-3 w-12" />
                    </div>
                </div>
            ))}
        </div>
    );
}

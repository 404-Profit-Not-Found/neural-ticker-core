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
 * replaces the placeholder. 80px tall: 11 + 18 + 16 + 6 + 18 + 11.
 */
const ROW_BOX = 'flex h-20 items-center gap-2.5 px-3.5';

/**
 * Fixed tracks. Every row is built from the same columns at the same
 * positions, whatever it holds — a list of rows has to read as a table:
 *
 *   - the price column and the sparkline slot never grow with their content,
 *     so the sparklines line up under each other;
 *   - the rating stamp has a slot of its own at the start of the third line,
 *     so the upside always starts at the same place and the risk always ends
 *     at the right edge.
 */
const PRICE_COL = 'w-[5.75rem]';
const STAMP_SLOT = 'w-[5.5rem]';

export interface TickerListRowProps {
    symbol: string;
    name: string;
    logoUrl?: string;
    price: number;
    /** Day change in percent. */
    change: number;
    currency?: string;
    sparkline?: number[];
    /** Pre-computed rating stamp; it leads the third line. */
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
 *   [logo]  SYMBOL                        ~~~      $172.30
 *           Company name                            +5.87%
 *           [RATING]   +44.0% upside        Risk ▮▮▮▮▯ 8
 *
 * One layout for every ticker: nothing moves to another line because a
 * symbol is long or a price has a currency code in front of it.
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
    // A row with its own control (edit mode) gives the sparkline's room to it.
    const showSparkline = !action && !!sparkline && sparkline.length > 1;
    // Six-figure prices are shortened, and a long figure ("SEK 1,281.40") is
    // set smaller, so the column keeps its width.
    const priceText = price <= 0 ? '—' : price >= 100_000 ? formatPrice(price, currency, { compact: true }) : formatNative(price, currency);
    const longPrice = priceText.length > 9;

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
                            {/* A symbol is an identifier: it never truncates. */}
                            <span className="block whitespace-nowrap text-[15px] font-semibold leading-tight text-foreground">{symbol}</span>
                            <span className="block truncate text-[13px] leading-tight text-muted-foreground">{name}</span>
                        </span>

                        {showSparkline && (
                            <span className="hidden w-12 shrink-0 min-[380px]:block">
                                <Sparkline data={sparkline!} width={48} height={28} label="14-day trend" />
                            </span>
                        )}

                        <span className={cn(PRICE_COL, 'flex shrink-0 flex-col items-end gap-1')}>
                            <span className={cn('num whitespace-nowrap font-semibold leading-none text-foreground', longPrice ? 'text-[13px]' : 'text-[15px]')}>
                                {priceText}
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

                    {/* Third line, full width and of fixed height: rating in its
                        slot, then what `meta` brings (upside, and risk at the
                        right edge). */}
                    {(meta || rating) && (
                        <span className="mt-1.5 flex h-[18px] items-center gap-2 overflow-hidden whitespace-nowrap text-xs leading-none text-muted-foreground [container-type:inline-size]">
                            {rating && (
                                <span className={cn(STAMP_SLOT, 'flex shrink-0')}>
                                    <Badge variant={rating.variant} className="h-[18px] px-1.5 text-[10px]">
                                        {rating.label}
                                    </Badge>
                                </span>
                            )}
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
                    {Math.abs(upside).toFixed(1)}%
                    {/* The words yield to the figures as the line gets shorter
                        (a narrow phone, or a row that also holds a control):
                        "Risk" first, then "upside". Sign and colour stay. */}
                    <span className="[@container(max-width:15.6rem)]:sr-only"> upside</span>
                </span>
            )}
            {hasRisk && (
                // Always at the right edge, under the price.
                <span className="ml-auto inline-flex items-center gap-1.5">
                    <span className="[@container(max-width:17.45rem)]:sr-only">Risk</span>
                    <RiskBar value={item.riskScore} segments={5} size="sm" />
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
                    <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-3.5 w-16" />
                                <Skeleton className="h-3 w-32 max-w-full" />
                            </div>
                            <div className={cn(PRICE_COL, 'shrink-0 space-y-1.5')}>
                                <Skeleton className="ml-auto h-3.5 w-16" />
                                <Skeleton className="ml-auto h-3 w-12" />
                            </div>
                        </div>
                        <div className="mt-1.5 flex h-[18px] items-center gap-2">
                            <Skeleton className={cn(STAMP_SLOT, 'h-[18px]')} />
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="ml-auto h-3 w-14" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

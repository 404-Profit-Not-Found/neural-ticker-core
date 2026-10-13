import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Edit2, MoreVertical, ShoppingCart, Trash2 } from 'lucide-react';
import { TickerLogo } from '../dashboard/TickerLogo';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Skeleton } from '../ui/skeleton';
import { useCurrency } from '../../context/CurrencyContext';
import { preloadRoute } from '../../app/routes';
import { cn } from '../../lib/utils';

/** The fields a position row reads; the Portfolio page has the full shape. */
export interface PositionRowItem {
    id: string;
    symbol: string;
    shares: number;
    buy_price: number;
    current_value: number;
    gain_loss: number;
    gain_loss_percent: number;
    /** Currency the value / gain are expressed in (display currency). */
    currency?: string;
    /** The instrument's own currency when the row was converted. */
    original_currency?: string;
    original_cost_basis?: number;
    original_current_price?: number;
    ticker?: { name?: string; logo_url?: string; currency?: string };
}

interface PositionActions<T> {
    onBuy?: (position: T) => void;
    onSell?: (position: T) => void;
    onEdit?: (position: T) => void;
    onDelete?: (id: string) => void;
}

const signed = (n: number): string => (Math.abs(n) < 0.005 ? '' : n > 0 ? '+' : '−');
const tone = (n: number): string => (Math.abs(n) < 0.005 ? 'text-muted-foreground' : n > 0 ? 'text-up' : 'text-down');

function ActionItem({ icon, label, onSelect, destructive }: { icon: ReactNode; label: string; onSelect: () => void; destructive?: boolean }) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                destructive ? 'text-down' : 'text-foreground',
            )}
        >
            {icon}
            {label}
        </button>
    );
}

/**
 * One holding as a compact "mini card" row (DESIGN.md §6): the phone default
 * for the Portfolio list. Same shape as `TickerListRow` so every collection of
 * tickers reads alike:
 *
 *   [logo]  SYMBOL  CCY                    $9,291.60
 *           Company name                     +35.56%
 *           40 sh · avg $171.35 · +$2,437.60
 *
 * The row is a link to the ticker; buy / sell / edit / delete live in the
 * trailing menu so they are never hidden behind a sideways scroll.
 */
export function PositionListRow<T extends PositionRowItem>({
    position,
    onBuy,
    onSell,
    onEdit,
    onDelete,
}: { position: T } & PositionActions<T>) {
    const { formatNative } = useCurrency();
    const to = `/ticker/${encodeURIComponent(position.symbol)}`;
    const currency = position.currency || 'USD';
    const nativeCurrency = position.original_currency || position.ticker?.currency || currency;
    const shares = Number(position.shares) || 0;
    // Average cost in the instrument's own currency (as the table shows it).
    const rawAvg =
        position.original_current_price && shares > 0
            ? Number(position.original_cost_basis) / shares
            : Number(position.buy_price);
    const avg = Number.isFinite(rawAvg) ? rawAvg : 0;
    const gain = Number(position.gain_loss) || 0;
    const gainPct = Number(position.gain_loss_percent) || 0;
    const hasMenu = !!(onBuy || onSell || onEdit || onDelete);

    return (
        <div className="flex items-stretch overflow-hidden rounded-lg bg-card">
            <Link
                to={to}
                onTouchStart={() => preloadRoute(to)}
                onMouseEnter={() => preloadRoute(to)}
                className="flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-3 py-3 pl-3.5 pr-1 transition-colors hover:bg-muted/60 active:bg-muted focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
                <TickerLogo url={position.ticker?.logo_url} symbol={position.symbol} className="h-10 w-10 shrink-0" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-3">
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                                <span className="shrink-0 text-[15px] font-semibold leading-tight text-foreground">{position.symbol}</span>
                                {nativeCurrency !== currency && (
                                    <span className="num shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">{nativeCurrency}</span>
                                )}
                            </span>
                            <span className="mt-0.5 block truncate text-[13px] leading-snug text-muted-foreground">
                                {position.ticker?.name || position.symbol}
                            </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className="num text-[15px] font-semibold leading-none text-foreground">
                                {formatNative(Number(position.current_value) || 0, currency)}
                            </span>
                            <span className={cn('num text-[13px] font-medium leading-none', tone(gainPct))}>
                                {signed(gainPct)}
                                {Math.abs(gainPct).toFixed(2)}%
                            </span>
                        </span>
                    </span>
                    <span className="mt-1.5 flex items-center gap-2 whitespace-nowrap text-xs leading-none text-muted-foreground">
                        <span className="num truncate">
                            {shares.toLocaleString('en-US', { maximumFractionDigits: 4 })} sh · avg {formatNative(avg, nativeCurrency)}
                        </span>
                        <span className={cn('num ml-auto shrink-0 font-medium', tone(gain))}>
                            {signed(gain)}
                            {formatNative(Math.abs(gain), currency)}
                        </span>
                    </span>
                </span>
            </Link>
            {hasMenu && (
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            aria-label={`Actions for ${position.symbol}`}
                            className="flex w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                            <MoreVertical size={18} aria-hidden />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-48 bg-popover p-1.5 shadow-2xl shadow-black/60">
                        {onBuy && <ActionItem icon={<ShoppingCart size={16} aria-hidden />} label="Buy more" onSelect={() => onBuy(position)} />}
                        {onSell && <ActionItem icon={<Banknote size={16} aria-hidden />} label="Sell" onSelect={() => onSell(position)} />}
                        {onEdit && <ActionItem icon={<Edit2 size={16} aria-hidden />} label="Edit position" onSelect={() => onEdit(position)} />}
                        {onDelete && <ActionItem icon={<Trash2 size={16} aria-hidden />} label="Delete position" destructive onSelect={() => onDelete(position.id)} />}
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}

/** A portfolio as mini-card rows: separate tonal rows, a small gap, no rules. */
export function PositionRowList<T extends PositionRowItem>({
    positions,
    className,
    ...actions
}: { positions: T[]; className?: string } & PositionActions<T>) {
    return (
        <ul className={cn('space-y-1.5', className)} aria-label="Positions">
            {positions.map((position) => (
                <li key={position.id}>
                    <PositionListRow position={position} {...actions} />
                </li>
            ))}
        </ul>
    );
}

/** Loading state shaped like the rows it stands in for. */
export function PositionRowListSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div role="status" aria-label="Loading positions" className="space-y-1.5">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex min-h-[4.5rem] items-center gap-3 rounded-lg bg-card px-3.5 py-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-3 w-32" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="ml-auto h-3.5 w-20" />
                        <Skeleton className="ml-auto h-3 w-12" />
                    </div>
                </div>
            ))}
        </div>
    );
}

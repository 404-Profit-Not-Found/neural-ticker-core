import { Trash2, Edit2, ArrowUp, ArrowDown, Brain, Newspaper, MessageCircle, AlertTriangle, Banknote, ShoppingCart } from 'lucide-react';
import { cn } from '../../lib/utils';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../ui/data-table';
import { TickerLogo } from '../dashboard/TickerLogo';
import { useNavigate } from 'react-router-dom';
import { DownsideCell, UpsideCell } from '../analyzer/table-chrome';
import { positionVerdict, positionVerdictBadgeProps } from './position-verdict';
import { VerdictBadge } from "../ticker/VerdictBadge";
import { FiftyTwoWeekRange } from '../dashboard/FiftyTwoWeekRange';
import { Sparkline } from '../ui/Sparkline';
import { useCurrency } from '../../context/CurrencyContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { EmptyState } from '../ui/empty-state';

export interface Position {
    id: string;
    symbol: string;
    shares: string | number;
    buy_price: string | number;
    current_price: number;
    change_percent: number;
    current_value: number;
    cost_basis: number;
    gain_loss: number;
    gain_loss_percent: number;
    currency?: string; // (e.g. 'USD' or 'EUR')

    // Optional native values (if displayCurrency was used)
    original_currency?: string;
    original_current_price?: number;
    original_current_value?: number;
    original_cost_basis?: number;
    original_gain_loss?: number;

    // Set by the backend when the user requested a displayCurrency but the FX
    // rate from this row's native currency to displayCurrency was unavailable.
    // The values above stay in the native currency in that case.
    conversion_unavailable?: boolean;

    // Sparkline & Range
    sparkline?: number[];
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;

    // Native real-time quote merged from the market snapshot (PortfolioPage).
    // `c` is the latest close in the stock's NATIVE currency (unconverted),
    // unlike `current_price` which the backend converts to displayCurrency.
    quote?: {
        c?: number;
        d?: number;
        dp?: number;
        [key: string]: unknown;
    };

    // Enriched Backend Data
    ticker?: {
        logo_url?: string;
        name?: string;
        sector?: string;
 industry?: string;
        currency?: string; // Add currency to ticker
        news_sentiment?: string | null;
        news_impact_score?: number | string | null;
    };
    fundamentals?: {
        pe_ttm?: number;
        consensus_rating?: string;
        sector?: string;
    };
    aiAnalysis?: {
        financial_risk?: number;
        overall_score?: number;
        upside_percent?: number;
        base_price?: number;
        bear_price?: number;
    };
    counts?: {
        analysts?: number;
        news?: number;
        research?: number;
        social?: number;
    }
}

interface PortfolioTableProps {
    positions: Position[];
    onDelete: (id: string) => void;
    onEdit?: (position: Position) => void;
    onSell?: (position: Position) => void;
    onBuy?: (position: Position) => void;
    loading: boolean;
}

// Helpers
const formatCurrency = (val: number, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);

const formatPct = (val: number) =>
    `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;


export function PortfolioTable({ positions, onDelete, onEdit, onSell, onBuy, loading }: PortfolioTableProps) {
    const navigate = useNavigate();
    // The table is the >= lg view (phones and tablets get rows). Columns are
    // added as the width allows, so it never needs a sideways scroll. The
    // fallbacks keep the full table in unit tests (no matchMedia there).
    const wide = useMediaQuery('(min-width: 1280px)', true);
    // The trend column and the "Buy" / "Sell" words need about 1,390px of
    // page: measured, the full table is 1,360px wide. Below that they would
    // push the table past its container and the sticky Actions column would
    // sit on top of the AI rating.
    const roomy = useMediaQuery('(min-width: 1440px)', true);
    const extraWide = useMediaQuery('(min-width: 1536px)', true);
    const { displayCurrency, formatNative } = useCurrency();
    const columnHelper = createColumnHelper<Position>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const columns: ColumnDef<Position, any>[] = [
        // 1. Asset Column
        columnHelper.accessor('symbol', {
            header: 'Asset',
            cell: (info) => {
                const ticker = info.row.original.ticker;
                const fundamentals = info.row.original.fundamentals;
                const counts = info.row.original.counts;
                const row = info.row.original;
                const currency = row.original_currency || row.ticker?.currency || 'USD';
                const conversionUnavailable = row.conversion_unavailable;
                const showCounts = (counts?.research || 0) + (counts?.news || 0) + (counts?.social || 0) > 0;

                return (
                    <div className="flex items-start gap-3">
                        <TickerLogo
                            url={ticker?.logo_url}
                            symbol={info.getValue()}
                            className="w-10 h-10 rounded-full"
                        />
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-foreground hover:underline cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/ticker/${info.getValue()}`);
                                    }}
                                >{info.getValue()}</span>
                                <span className="num rounded bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                                    {currency}
                                </span>
                                {conversionUnavailable && (
                                    <span
                                        className="inline-flex items-center text-amber-500/80 dark:text-amber-400/80 cursor-help"
                                        title={`Shown in native ${currency} — live FX rate to your display currency is unavailable right now.`}
                                        aria-label={`Shown in native ${currency}; FX conversion unavailable`}
                                    >
                                        <AlertTriangle size={12} strokeWidth={2.25} />
                                    </span>
                                )}

                                {showCounts && wide && (
                                    <div className="flex items-center gap-2">
                                        {counts?.research ? (
                                            <div className="flex items-center gap-0.5 text-purple-400" title={`${counts.research} Reports`}>
                                                <Brain size={12} />
                                                <span className="num text-[11px] font-medium">{counts.research}</span>
                                            </div>
                                        ) : null}
                                        {counts?.news ? (
                                            <div className="flex items-center gap-0.5 text-sky-400" title={`${counts.news} News`}>
                                                <Newspaper size={12} />
                                                <span className="num text-[11px] font-medium">{counts.news}</span>
                                            </div>
                                        ) : null}
                                        {counts?.social ? (
                                            <div className="flex items-center gap-0.5 text-blue-400" title={`${counts.social} Social`}>
                                                <MessageCircle size={12} />
                                                <span className="num text-[11px] font-medium">{counts.social}</span>
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                            <span className="max-w-[100px] truncate text-xs text-muted-foreground xl:max-w-[180px]">
                                {ticker?.name || 'Unknown'}
                            </span>
                            <span className="max-w-[100px] truncate text-[11px] text-muted-foreground xl:max-w-[180px]">
                                {ticker?.industry || ticker?.sector || fundamentals?.sector || 'Unknown Sector'}
                            </span>
                        </div>
                    </div>
                );
            }
        }),

        // 2. Value / Return (Merged)
        columnHelper.accessor('gain_loss_percent', {
            id: 'gain_loss_percent', // Sort by percentage
            header: 'Value / Return',
            cell: (info) => {
                const row = info.row.original;
                // Use converted (Display) values for Value & Return columns
                const val = row.current_value;
                const gainLoss = row.gain_loss;
                const currency = row.currency || displayCurrency || 'USD';
                
                const pct = info.getValue();
                const isProfit = gainLoss >= 0;

                return (
                    <div className="flex flex-col items-start">
                        <span className="num text-sm font-bold text-foreground">
                            {formatCurrency(val, currency)}
                        </span>
                        <div className={cn("num flex items-center gap-1 text-xs font-semibold", isProfit ? "text-up" : "text-down")}>
                            <span>{gainLoss > 0 ? '+' : ''}{formatCurrency(gainLoss, currency)}</span>
                            <span>({formatPct(pct)})</span>
                        </div>
                    </div>
                );
            }
        }),

        // 3. Position (Shares) (Moved Here)
        columnHelper.accessor('shares', {
            header: 'Position',
            cell: (info) => {
                const row = info.row.original;
                // buy_price is stored native; if backend converted the row, native lives in
                // original_currency. Convert to displayCurrency so Avg matches the rest of the row.
                const nativeCurrency = row.original_currency || row.currency || 'USD';
                const shares = Number(row.shares);
                const rawBuyPrice =
                    row.original_current_price && shares > 0
                        ? Number(row.original_cost_basis) / shares
                        : Number(row.buy_price);
                // Guard against NaN/Infinity (missing cost basis, zero shares) so
                // the cell never renders "$NaN".
                const nativeBuyPrice = Number.isFinite(rawBuyPrice) ? rawBuyPrice : 0;

                return (
                    <div className="flex flex-col">
                        <span className="num text-sm font-bold">{Number(info.getValue()).toFixed(2)} sh</span>
                        <span className="num text-xs text-muted-foreground">Avg: {formatNative(nativeBuyPrice, nativeCurrency)}</span>
                    </div>
                );
            }
        }),

        // 4. Price / Change
        columnHelper.accessor('current_price', {
            header: 'Price / Change',
            cell: (info) => {
                const row = info.row.original;
                const price = info.getValue();
                const currency = row.currency || displayCurrency || 'USD';
                const change = row.change_percent || 0;
                const isPositive = change >= 0;

                return (
                    <div className="flex flex-col items-start">
                        <span className="num text-sm font-medium text-foreground">
                            {formatCurrency(price, currency)}
                        </span>
                        <div className={cn("num flex items-center text-xs font-semibold", isPositive ? "text-up" : "text-down")}>
                            {isPositive ? <ArrowUp size={12} className="mr-0.5" /> : <ArrowDown size={12} className="mr-0.5" />}
                            {Math.abs(change).toFixed(2)}%
                        </div>
                    </div>
                );
            }
        }),

        // 5. Trend (14d)
        columnHelper.accessor('sparkline', {
            header: 'Trend (14d)',
            cell: (info) => {
                const data = info.getValue();
                if (!data || data.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
                return (
                    <div className="flex h-8 w-[100px] items-center justify-center">
                        <Sparkline
                            data={data}
                            width={100}
                            height={32}
                            className="opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                    </div>
                );
            }
        }),

        // 6. 52-Week Range
        columnHelper.accessor(row => row.fiftyTwoWeekHigh, { // Accessor key
            id: '52wk',
            header: '52-Week Range',
            cell: (info) => {
                const row = info.row.original;
                if (!row.fiftyTwoWeekHigh || !row.fiftyTwoWeekLow) return <span className="text-xs text-muted-foreground">—</span>;
                return (
                    <div className="w-[140px]">
                        <FiftyTwoWeekRange
                            low={row.fiftyTwoWeekLow}
                            high={row.fiftyTwoWeekHigh}
                            // low/high are NATIVE (from snapshot fundamentals) and the
                            // labels render in native currency, so the marker must be
                            // computed in native units too. `current_price` is backend-
                            // converted to displayCurrency in non-NATIVE mode, which would
                            // skew the dot. Prefer the live native quote close (`quote.c`),
                            // but it is null outside a fresh live quote, so fall back to
                            // `original_current_price` — the backend's NATIVE current price,
                            // present exactly when the row was converted. Only when neither
                            // exists (NATIVE mode / no conversion) is `current_price` itself
                            // already native and safe to use.
                            current={row.quote?.c ?? row.original_current_price ?? row.current_price}
                            showLabels={true} // Small labels
                            className="scale-90 origin-left"
                            currency={row.original_currency || row.currency || 'USD'}
                        />
                    </div>
                );
            }
        }),

        // REMOVED Separate Total Return Column (Merged with Value)

        // REMOVED P/E, Risk, Risk/Reward columns

        // 8. Upside / downside — read together, from the app's one derivation
        columnHelper.accessor((row) => positionVerdict(row).upside ?? undefined, {
            id: 'upside',
            // The short label keeps the table inside a 1024px window.
            header: () => <span title="Upside / downside to the price targets">{wide ? 'Upside / Downside' : 'Up / Down'}</span>,
            cell: (info) => {
                const verdict = positionVerdict(info.row.original);
                return (
                    <div className="flex flex-col items-start gap-0.5">
                        <UpsideCell value={verdict.upside} />
                        <DownsideCell value={verdict.downside} estimated={verdict.downsideEstimated} />
                    </div>
                );
            },
        }),

        // 9. AI Rating — the same inputs every other view gives the badge
        columnHelper.accessor((row) => row.aiAnalysis?.financial_risk, {
            id: 'ai_rating',
            header: 'AI Rating',
            cell: (info) => <VerdictBadge {...positionVerdictBadgeProps(info.row.original)} />,
        }),

        // 10. Actions
        columnHelper.display({
            id: 'actions',
            header: 'Actions',
            cell: (info) => {
                const row = info.row.original;
                const rowAction = "inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
                const iconAction = "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
                return (
                    <div className="flex items-center justify-end gap-1.5">
                        {onBuy && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onBuy(row); }}
                                className={rowAction}
                                title="Buy more shares at the market price"
                                aria-label={`Buy more ${row.symbol}`}
                            >
                                <ShoppingCart size={14} />
                                {roomy && 'Buy'}
                            </button>
                        )}
                        {onSell && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onSell(row); }}
                                className={rowAction}
                                title="Sell shares from this position"
                                aria-label={`Sell ${row.symbol}`}
                            >
                                <Banknote size={14} />
                                {roomy && 'Sell'}
                            </button>
                        )}
                        {onEdit && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                                className={iconAction}
                                title="Edit Position"
                                aria-label={`Edit ${row.symbol} position`}
                            >
                                <Edit2 size={14} />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onDelete(row.id); }}
                            className={cn(iconAction, "hover:bg-down/10 hover:text-down")}
                            title="Delete Position"
                            aria-label={`Delete ${row.symbol} position`}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                );
            }
        })
    ];

    // Trend from 1440px, the 52-week track from 1536px (see the hooks above).
    const visibleColumns = columns.filter((column) => {
        const id = (column as { id?: string; accessorKey?: string }).id ?? (column as { accessorKey?: string }).accessorKey;
        if (id === 'sparkline') return roomy;
        if (id === '52wk') return extraWide;
        return true;
    });

    if (loading && positions.length === 0) {
        return <DataTable columns={visibleColumns} data={[]} isLoading={true} />;
    }

    if (positions.length === 0 && !loading) {
        return (
            <EmptyState
                className="rounded-lg bg-card py-14"
                title="Your portfolio is empty"
                description="Add your first position to start tracking performance and get AI insights."
            />
        );
    }

    return (
        <DataTable
            columns={visibleColumns}
            data={positions}
            stickyLastColumn
            onRowClick={(row) => navigate(`/ticker/${row.symbol}`)}
        />
    );
}

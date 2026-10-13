import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    flexRender,
    createColumnHelper,
    type ColumnFiltersState,
    type SortingState,
    type Table
} from '@tanstack/react-table';
import {
    ArrowUp,
    ArrowDown,
    Brain,
    Newspaper,
    Search,
    MessageCircle,
    Trash2
} from 'lucide-react';
import { RiskBar } from '../ui/RiskBar';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "../ui/tooltip";
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/api';
import { TickerLogo } from './TickerLogo';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { VerdictBadge } from "../ticker/VerdictBadge";
import { FiftyTwoWeekRange } from "./FiftyTwoWeekRange";
import { Sparkline } from "../ui/Sparkline";
import { FavoriteStar } from '../watchlist/FavoriteStar';
import { useCurrency } from '../../context/CurrencyContext';
import type { RatingVariant } from '../../lib/rating-utils';
import { SCORE_TEXT, scoreBand, verdictProps } from '../../lib/ticker-metrics';
import { EmptyState } from '../ui/empty-state';
import { SortableTh, DownsideCell, UpsideCell, bodyCellClass, columnClass, type TickerColumnMeta } from '../analyzer/table-chrome';

// --- Types (Matched from WatchlistTable.tsx) ---
export interface TickerData {
    symbol: string;
    logo?: string;
    company: string;
    sector: string;
    price: number;
    change: number;
    pe: number | null;
    marketCap: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    potentialUpside: number | null;
    riskScore: number | null;
    overallScore: number | null;
    rating: string;
    aiRating: string;
    newsCount: number;
    researchCount: number;
    analystCount: number;
    socialCount: number;
    potentialDownside: number | null;
    itemId?: string;
    sparkline?: number[];
    currency?: string;
    /** `potentialDownside` is an estimate from the risk score (no bear target). */
    downsideEstimated?: boolean;
    /** Badge colour for `aiRating`, set by the shared derivation. */
    aiRatingVariant?: RatingVariant | null;
    newsSentiment?: string | null;
    newsImpact?: number | null;
    /** Trailing revenue — a rating input (see lib/ticker-metrics). */
    revenueTTM?: number | null;
}

interface WatchlistTableViewProps {
    data: TickerData[];
    isLoading: boolean;
    onRemove?: (itemId: string, symbol: string) => void;
    sorting: SortingState;
    setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
    columnFilters: ColumnFiltersState;
    setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
    globalFilter: string;
    setGlobalFilter: React.Dispatch<React.SetStateAction<string>>;
    tableRef: React.MutableRefObject<Table<TickerData> | null>;
}

export function WatchlistTableView({
    data,
    isLoading,
    onRemove,
    sorting,
    setSorting,
    columnFilters,
    setColumnFilters,
    globalFilter,
    setGlobalFilter,
    tableRef
}: WatchlistTableViewProps) {
    const navigate = useNavigate();
    const { formatNative } = useCurrency();

    const columns = useMemo(() => {
        const columnHelper = createColumnHelper<TickerData>();
        return [
            // 1. Asset Column (Logo, Symbol + Star, Company, Industry + Icons)
            columnHelper.accessor('symbol', {
                header: 'Asset',
                size: 232,
                minSize: 200,
                cell: (info) => {
                    const research = info.row.original.researchCount;
                    const news = info.row.original.newsCount;
                    const social = info.row.original.socialCount;
                    const hasInsights = (research || 0) + (news || 0) + (social || 0) > 0;
                    const sector = info.row.original.sector;

                    return (
                        <div className="flex items-center gap-3">
                            <TickerLogo
                                url={info.row.original.logo}
                                symbol={info.getValue()}
                                className="h-10 w-10 shrink-0 rounded-full"
                            />

                            <div className="flex min-w-0 flex-col gap-0.5">
                                {/* Row 1: symbol (the row's keyboard target) + favourite */}
                                <div className="flex items-center gap-1.5">
                                    <Link
                                        to={`/ticker/${info.getValue()}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="rounded-sm text-base font-bold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {info.getValue()}
                                    </Link>
                                    <FavoriteStar symbol={info.getValue()} className="h-6 w-6" />
                                </div>

                                {/* Row 2: Company Name */}
                                <span className="max-w-[150px] truncate text-xs text-muted-foreground" title={info.row.original.company}>
                                    {info.row.original.company}
                                </span>

                                {/* Row 3: Industry + insight counts */}
                                <div className="mt-0.5 flex items-center gap-2">
                                    <span className="max-w-[84px] truncate text-xs text-muted-foreground xl:max-w-[110px]" title={sector}>
                                        {sector || 'Unknown'}
                                    </span>
                                    {hasInsights && (
                                        <div className="num flex items-center gap-1.5 text-[11px] font-medium">
                                            {research ? (
                                                <span className="flex items-center gap-0.5 text-purple-400" title={`${research} AI reports`}>
                                                    <Brain size={11} aria-hidden />
                                                    {research}
                                                </span>
                                            ) : null}
                                            {news ? (
                                                <span className="flex items-center gap-0.5 text-sky-400" title={`${news} news items`}>
                                                    <Newspaper size={11} aria-hidden />
                                                    {news}
                                                </span>
                                            ) : null}
                                            {social ? (
                                                <span className="flex items-center gap-0.5 text-blue-400" title={`${social} comments`}>
                                                    <MessageCircle size={11} aria-hidden />
                                                    {social}
                                                </span>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                },
            }),

            // 2. Price / Change (Merged)
            columnHelper.accessor((row) => row.change, {
                id: 'price_change', // Match sort key if needed, or stick to 'change'
                header: 'Price',
                cell: (info) => {
                    const change = info.getValue();
                    const price = info.row.original.price;
                    const currency = info.row.original.currency;

                    if (!price) return <span className="text-muted-foreground">—</span>;

                    const isPositive = (change || 0) >= 0;
                    const formattedPrice = formatNative(price, currency || 'USD');

                    return (
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-mono font-medium text-foreground/70">
                                {formattedPrice}
                            </span>
                            {change !== undefined && change !== null ? (
                                <div className={cn("num flex items-center text-xs font-semibold", change === 0 ? "text-muted-foreground" : isPositive ? "text-up" : "text-down")}>
                                    {/* Exactly zero is neutral: no arrow, no colour. */}
                                    {change === 0 ? null : isPositive ? <ArrowUp size={12} className="mr-0.5" aria-hidden /> : <ArrowDown size={12} className="mr-0.5" aria-hidden />}
                                    {Math.abs(change).toFixed(2)}%
                                </div>
                            ) : <span className="text-xs text-muted-foreground">-</span>}
                        </div>
                    );
                },
            }),

            // 2.5 Sparkline
            columnHelper.accessor('sparkline', {
                header: 'Trend (14d)',
                enableSorting: false,
                cell: (info) => {
                    const data = info.getValue();
                    if (!data || data.length === 0) return <span className="text-muted-foreground text-xs">-</span>;
                    return (
                        <div className="w-[100px] h-8 flex items-center justify-center">
                            <Sparkline
                                data={data}
                                width={100}
                                height={32}
                                className="opacity-80 group-hover:opacity-100 transition-opacity"
                            />
                        </div>
                    );
                },
            }),

            // 3. 52-Week Range
            columnHelper.accessor((row) => row.price, {
                id: '52_week_range',
                header: '52-week range',
                enableSorting: false,
                meta: { showFrom: 'xl' } satisfies TickerColumnMeta,
                cell: (info) => {
                    const row = info.row.original;
                    if (!row.fiftyTwoWeekHigh || !row.fiftyTwoWeekLow) return <span className="text-muted-foreground text-xs">-</span>;

                    return (
                        <FiftyTwoWeekRange
                            low={row.fiftyTwoWeekLow}
                            high={row.fiftyTwoWeekHigh}
                            current={row.price}
                            showLabels={true}
                            caption={false}
                            currency={row.currency}
                        />
                    );
                },
            }),


            // 4. P/E
            columnHelper.accessor((row) => row.pe, {
                id: 'pe_ttm',
                header: 'P/E',
                meta: { showFrom: 'xl' } satisfies TickerColumnMeta,
                cell: (info) => {
                    const val = info.getValue();
                    return val ? <span className="font-mono text-muted-foreground text-xs">{Number(val).toFixed(2)}</span> : <span className="text-muted-foreground">—</span>;
                },
            }),

            // 5. Financial Risk
            columnHelper.accessor((row) => row.riskScore, {
                id: 'financial_risk',
                header: 'Risk',
                cell: (info) => <RiskBar value={info.getValue()} segments={5} />,
            }),

            // 5.5 Risk/Reward (Overall Score)
            columnHelper.accessor((row) => row.overallScore, {
                id: 'overall_score',
                header: () => <abbr title="Risk / reward score (0–10)" className="no-underline">R/R</abbr>,
                cell: (info) => {
                    const val = info.getValue();
                    if (val === undefined || val === null) return <span className="text-muted-foreground">—</span>;

                    return (
                        <span className={cn('num text-sm font-semibold', SCORE_TEXT[scoreBand(Number(val))])}>
                            {Number(val).toFixed(1)}
                        </span>
                    );
                },
            }),

            // 6. Upside
            columnHelper.accessor((row) => row.potentialUpside, {
                id: 'upside_percent',
                header: 'Upside',
                cell: (info) => {
                    return <UpsideCell value={info.getValue()} />;
                },
            }),

            // 6.5 Downside — sits right next to its partner figure.
            columnHelper.accessor((row) => row.potentialDownside, {
                id: 'downside_percent',
                header: 'Downside',
                cell: (info) => <DownsideCell value={info.getValue()} estimated={info.row.original.downsideEstimated} />,
            }),

            // 7. AI Rating
            columnHelper.accessor((row) => row.aiRating, {
                id: 'ai_rating',
                header: 'AI Rating',
                cell: (info) => {
                    const row = info.row.original;
                    if (row.aiRating === '-') return <span className="text-muted-foreground">—</span>;

                    return (
                        <div onClick={(e) => e.stopPropagation()}>
                            {/* Same inputs as every other view of this ticker. */}
                            <VerdictBadge {...verdictProps(row)} />
                        </div>
                    );
                },
            }),

            // 8. Analyst Rating
            columnHelper.accessor('rating', {
                header: 'Analyst',
                meta: { showFrom: 'wide' } satisfies TickerColumnMeta,
                cell: (info) => {
                    const rawRating = info.getValue();
                    if (!rawRating || rawRating === '-') return <span className="text-muted-foreground">—</span>;

                    const rLower = rawRating.toLowerCase();
                    let displayRating = 'Hold';
                    let variant: 'default' | 'strongBuy' | 'buy' | 'hold' | 'sell' | 'outline' = 'hold';

                    if (rLower.includes('strong buy')) {
                        displayRating = 'Strong Buy';
                        variant = 'strongBuy';
                    } else if (rLower.includes('buy')) {
                        displayRating = 'Buy';
                        variant = 'buy';
                    } else if (rLower.includes('sell')) {
                        displayRating = 'Sell';
                        variant = 'sell';
                    } else {
                        displayRating = 'Hold';
                        variant = 'hold';
                    }

                    const count = info.row.original.analystCount;
                    const label = count > 0 ? `${displayRating} (${count})` : displayRating;

                    return (
                        <Badge variant={variant} className="whitespace-nowrap h-6 px-2">
                            {label}
                        </Badge>
                    );
                }
            }),

            // Actions: only a column when the list allows removing.
            ...(onRemove ? [columnHelper.display({
                id: 'actions',
                header: '',
                cell: (info) => (
                    <div className="flex items-center justify-end">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Remove ${info.row.original.symbol} from watchlist`}
                                        className="h-8 w-8 text-muted-foreground hover:bg-raised hover:text-red-400"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemove(info.row.original.itemId || '', info.row.original.symbol);
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" aria-hidden />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Remove from this list</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                ),
            })] : []),
        ];
    }, [formatNative, onRemove]);

    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        onColumnFiltersChange: setColumnFilters,
        state: { sorting, globalFilter, columnFilters },
        initialState: {
            columnVisibility: {}, // Sector is now visible by default
        }
    });

    if (tableRef) {
        tableRef.current = table;
    }

    return (
        // Columns join by breakpoint (see table-chrome), so this never scrolls
        // sideways in practice; the overflow is only a safety net.
        <div className="overflow-x-auto pb-2">
            <table className="w-full caption-bottom text-sm border-separate border-spacing-y-1.5">
                <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                                <SortableTh key={header.id} header={header} />
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {isLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                            <tr key={i}>
                                {table.getVisibleFlatColumns().map((col) => (
                                    <td key={col.id} className={cn(bodyCellClass, columnClass(col.columnDef.meta))}>
                                        {col.id === 'symbol' ? (
                                            <div className="flex items-center gap-3">
                                                <Skeleton className="h-10 w-10 rounded-full" />
                                                <div className="space-y-1.5">
                                                    <Skeleton className="h-4 w-12" />
                                                    <Skeleton className="h-3 w-24" />
                                                </div>
                                            </div>
                                        ) : (
                                            <Skeleton className="h-4 w-full max-w-[80px]" />
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))
                    ) : table.getRowModel().rows.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} className="rounded-md bg-card">
                                <EmptyState
                                    icon={<Search className="h-5 w-5" />}
                                    title="No tickers to show"
                                    description="Nothing in this list matches the current search and filters."
                                />
                            </td>
                        </tr>
                    ) : (
                        table.getRowModel().rows.map((row) => (
                            <tr
                                key={row.id}
                                className="group cursor-pointer"
                                onClick={() => navigate(`/ticker/${row.original.symbol}`)}
                            >
                                {row.getVisibleCells().map((cell) => (
                                    <td key={cell.id} className={cn(bodyCellClass, columnClass(cell.column.columnDef.meta))}>
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}

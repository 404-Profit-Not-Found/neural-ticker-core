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
    ArrowUpRight,
    ArrowDownRight,
    ArrowUp,
    ArrowDown,
    Brain,
    ShieldCheck,
    AlertTriangle,
    Flame,
    Newspaper,
    Search,
    MessageCircle,
    Trash2
} from 'lucide-react';
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
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { VerdictBadge } from "../ticker/VerdictBadge";
import { FiftyTwoWeekRange } from "./FiftyTwoWeekRange";
import { Sparkline } from "../ui/Sparkline";
import { FavoriteStar } from '../watchlist/FavoriteStar';

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

    const columns = useMemo(() => {
        const columnHelper = createColumnHelper<TickerData>();
        return [
            // 1. Asset Column (Logo, Symbol + Star, Company, Industry + Icons)
            columnHelper.accessor('symbol', {
                header: 'Asset',
                size: 280,
                minSize: 220,
                cell: (info) => {
                    const research = info.row.original.researchCount;
                    const news = info.row.original.newsCount;
                    const social = info.row.original.socialCount;
                    const hasInsights = (research || 0) + (news || 0) + (social || 0) > 0;
                    const sector = info.row.original.sector;

                    return (
                        <div className="flex items-center gap-3">
                            {/* Logo */}
                            <div
                                className="cursor-pointer shrink-0"
                                onClick={() => navigate(`/ticker/${info.getValue()}`)}
                            >
                                <TickerLogo
                                    url={info.row.original.logo}
                                    symbol={info.getValue()}
                                    className="w-10 h-10 rounded-full"
                                />
                            </div>

                            {/* Text Content */}
                            <div className="flex flex-col gap-0.5">
                                {/* Row 1: Symbol + Star next to it */}
                                <div className="flex items-center gap-1.5">
                                    <span
                                        className="text-base font-bold text-foreground hover:underline cursor-pointer"
                                        onClick={() => navigate(`/ticker/${info.getValue()}`)}
                                    >
                                        {info.getValue()}
                                    </span>
                                    {/* Star - Favorite indicator (next to symbol) */}
                                    <FavoriteStar symbol={info.getValue()} />
                                </div>

                                {/* Row 2: Company Name */}
                                <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={info.row.original.company}>
                                    {info.row.original.company}
                                </span>

                                {/* Row 3: Industry + Insight Icons */}
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={sector}>
                                        {sector || 'Unknown'}
                                    </span>
                                    {hasInsights && (
                                        <div className="flex items-center gap-1.5">
                                            {research ? (
                                                <div className="flex items-center gap-0.5 text-purple-400" title={`${research} Reports`}>
                                                    <Brain size={10} />
                                                    <span className="text-[9px] font-medium">{research}</span>
                                                </div>
                                            ) : null}
                                            {news ? (
                                                <div className="flex items-center gap-0.5 text-sky-400" title={`${news} News`}>
                                                    <Newspaper size={10} />
                                                    <span className="text-[9px] font-medium">{news}</span>
                                                </div>
                                            ) : null}
                                            {social ? (
                                                <div className="flex items-center gap-0.5 text-blue-400" title={`${social} Social`}>
                                                    <MessageCircle size={10} />
                                                    <span className="text-[9px] font-medium">{social}</span>
                                                </div>
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
                header: 'Price / Change',
                cell: (info) => {
                    const change = info.getValue();
                    const price = info.row.original.price;

                    if (!price) return '-';

                    const isPositive = (change || 0) >= 0;

                    return (
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-mono font-medium text-foreground/70">
                                ${price.toFixed(2)}
                            </span>
                            {change !== undefined && change !== null ? (
                                <div className={cn("flex items-center text-xs font-bold", isPositive ? "text-emerald-500" : "text-red-500")}>
                                    {isPositive ? <ArrowUp size={12} className="mr-0.5" /> : <ArrowDown size={12} className="mr-0.5" />}
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
                header: '52 Wk Range',
                cell: (info) => {
                    const row = info.row.original;
                    if (!row.fiftyTwoWeekHigh || !row.fiftyTwoWeekLow) return <span className="text-muted-foreground text-xs">-</span>;

                    return (
                        <FiftyTwoWeekRange
                            low={row.fiftyTwoWeekLow}
                            high={row.fiftyTwoWeekHigh}
                            current={row.price}
                            showLabels={true}
                        />
                    );
                },
            }),


            // 4. P/E
            columnHelper.accessor((row) => row.pe, {
                id: 'pe_ttm',
                header: 'P/E',
                cell: (info) => {
                    const val = info.getValue();
                    return val ? <span className="font-mono text-muted-foreground text-xs">{Number(val).toFixed(2)}</span> : '-';
                },
            }),

            // 5. Financial Risk
            columnHelper.accessor((row) => row.riskScore, {
                id: 'financial_risk', // Sort key matching
                header: 'Risk',
                cell: (info) => {
                    const val = info.getValue();
                    if (val === undefined || val === null) return '-';

                    let colorClass = 'text-muted-foreground';
                    let Icon = ShieldCheck;
                    if (val <= 3.5) { colorClass = 'text-emerald-500'; Icon = ShieldCheck; }
                    else if (val <= 6.5) { colorClass = 'text-yellow-500'; Icon = AlertTriangle; }
                    else { colorClass = 'text-red-500'; Icon = Flame; }

                    return (
                        <span className={cn('flex items-center gap-1.5 font-bold', colorClass)}>
                            <Icon size={14} />
                            {Number(val).toFixed(1)}
                        </span>
                    );
                },
            }),

            // 5.5 Risk/Reward (Overall Score)
            columnHelper.accessor((row) => row.overallScore, {
                id: 'overall_score',
                header: 'Risk/Reward',
                cell: (info) => {
                    const val = info.getValue();
                    if (val === undefined || val === null) return '-';

                    let colorClass = 'text-muted-foreground';
                    if (val >= 7.5) colorClass = 'text-emerald-500';
                    else if (val >= 5.0) colorClass = 'text-yellow-500';
                    else colorClass = 'text-red-500';

                    return (
                        <span className={cn('font-bold', colorClass)}>
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
                    const val = info.getValue();
                    if (val === undefined || val === null) return '-';
                    const num = Number(val);
                    const isPositive = num > 0;

                    return (
                        <div className={cn('flex items-center font-bold text-xs', isPositive ? 'text-emerald-500' : 'text-muted-foreground')}>
                            {isPositive && <ArrowUp size={12} className="mr-0.5" />}
                            {num.toFixed(1)}%
                        </div>
                    );
                },
            }),

            // 7. AI Rating
            columnHelper.accessor((row) => row.aiRating, {
                id: 'ai_rating',
                header: 'AI Rating',
                cell: (info) => {
                    const row = info.row.original;
                    // Ensure we have values
                    const risk = row.riskScore ?? 0;
                    const upside = row.potentialUpside ?? 0;
                    const downside = row.potentialDownside ?? 0;

                    return (
                        <div onClick={(e) => e.stopPropagation()}>
                            <VerdictBadge
                                risk={risk}
                                upside={upside}
                                downside={downside}
                                consensus={row.rating}
                                overallScore={row.overallScore}
                                pe={row.pe}
                            />
                        </div>
                    );
                },
            }),

            // 8. Analyst Rating
            columnHelper.accessor('rating', {
                header: 'Analyst',
                cell: (info) => {
                    const rawRating = info.getValue();
                    if (!rawRating || rawRating === '-') return <span className="text-muted-foreground">-</span>;

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

            // Actions: Explicit Remove
            columnHelper.display({
                id: 'actions',
                header: '',
                cell: (info) => {
                    if (!onRemove) return null;
                    return (
                        <div className="flex items-center gap-1 justify-end">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRemove(info.row.original.itemId || '', info.row.original.symbol);
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Remove ticker from the list</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    );
                },
            }),
        ];
    }, [navigate, onRemove]);

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
        <div className="overflow-x-auto px-1 pb-2">
            <table className="w-full caption-bottom text-sm border-separate border-spacing-y-2">
                <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id} className="bg-transparent">
                            {headerGroup.headers.map((header) => (
                                <th
                                    key={header.id}
                                    className="h-10 px-4 text-left align-middle font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap first:pl-6 last:pr-6"
                                    onClick={header.column.getToggleSortingHandler()}
                                    style={{
                                        width: header.column.columnDef.size,
                                        minWidth: header.column.columnDef.minSize
                                    }}
                                >
                                    <div className="flex items-center gap-1 group">
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            {{
                                                asc: <ArrowUpRight className="ml-1 h-3 w-3" />,
                                                desc: <ArrowDownRight className="ml-1 h-3 w-3" />,
                                            }[header.column.getIsSorted() as string] ?? null}
                                        </span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody className="space-y-4">
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i} className="bg-card shadow-sm rounded-lg">
                                {table.getVisibleFlatColumns().map((col, idx) => (
                                    <td key={col.id} className={cn("p-4 border-y border-border/40 first:border-l first:rounded-l-lg last:border-r last:rounded-r-lg bg-card", idx === 0 && "pl-6", idx === table.getVisibleFlatColumns().length - 1 && "pr-6")}>
                                        {col.id === 'symbol' ? (
                                            <div className="flex items-center gap-3">
                                                <Skeleton className="h-8 w-8 rounded-full" />
                                                <div className="space-y-1">
                                                    <Skeleton className="h-4 w-12" />
                                                    <Skeleton className="h-3 w-20" />
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
                            <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                <div className="flex flex-col items-center justify-center max-w-sm mx-auto p-6 text-center">
                                    <div className="w-12 h-12 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                                        <Search className="w-6 h-6 text-muted-foreground/50" />
                                    </div>
                                    <h3 className="font-medium text-foreground mb-1">Watchlist is empty</h3>
                                    <p className="text-sm text-muted-foreground mb-4">Add your first ticker to track its performance.</p>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        table.getRowModel().rows.map((row) => (
                            <tr
                                key={row.id}
                                className="group transition-all hover:bg-accent cursor-pointer relative"
                                onClick={() => navigate(`/ticker/${row.original.symbol}`)}
                            >
                                {row.getVisibleCells().map((cell, idx) => (
                                    <td
                                        key={cell.id}
                                        className={cn(
                                            "p-4 align-middle whitespace-nowrap bg-card border-y border-border/40 group-hover:bg-accent transition-colors first:border-l first:rounded-l-lg last:border-r last:rounded-r-lg shadow-sm",
                                            idx === 0 && "pl-6",
                                            idx === row.getVisibleCells().length - 1 && "pr-6"
                                        )}
                                    >
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

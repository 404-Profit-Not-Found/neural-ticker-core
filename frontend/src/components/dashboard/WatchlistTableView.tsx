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
    Bot,
    Brain,
    ShieldCheck,
    AlertTriangle,
    Flame,
    Newspaper,
    MoreVertical,
    Trash2,
    Search,
    MessageCircle
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/api';
import { TickerLogo } from './TickerLogo';
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';

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
    potentialUpside: number | null;
    riskScore: number | null;
    rating: string;
    aiRating: string;
    newsCount: number;
    researchCount: number;
    analystCount: number;
    socialCount: number;
    itemId?: string;
}

interface WatchlistTableViewProps {
    data: TickerData[];
    isLoading: boolean;
    onRemove: (itemId: string, symbol: string) => void;
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
            columnHelper.accessor('symbol', {
                header: 'Ticker',
                cell: (info) => (
                    <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate(`/ticker/${info.getValue()}`)}>
                        <TickerLogo key={info.getValue()} url={info.row.original.logo} symbol={info.getValue()} className="w-8 h-8" />
                        <div className="flex flex-col">
                            <span className="text-primary font-bold group-hover:underline">{info.getValue()}</span>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider max-w-[150px] truncate" title={info.row.original.company}>
                                {info.row.original.company}
                            </span>
                            <span className="text-[9px] text-muted-foreground/70 truncate max-w-[150px]">
                                {info.row.original.sector}
                            </span>
                        </div>
                    </div>
                ),
            }),
            columnHelper.accessor('sector', {
                id: 'sector',
                header: 'Sector',
                enableHiding: true,
            }),
            columnHelper.accessor('price', {
                header: 'Price',
                cell: (info) => {
                    const val = Number(info.getValue());
                    return <span className="text-foreground font-mono font-medium">${Number.isFinite(val) ? val.toFixed(2) : '0.00'}</span>;
                },
            }),
            columnHelper.accessor('change', {
                header: 'Change %',
                cell: (info) => {
                    const val = Number(info.getValue());
                    if (!Number.isFinite(val)) return <span className="text-muted-foreground">-</span>;
                    const isPositive = val >= 0;
                    return (
                        <div className={cn("flex items-center font-medium", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                            {isPositive ? <ArrowUp size={14} className="mr-1" /> : <ArrowDown size={14} className="mr-1" />}
                            {Math.abs(val).toFixed(2)}%
                        </div>
                    );
                },
            }),
            columnHelper.accessor('potentialUpside', {
                header: 'Potential Upside',
                cell: (info) => {
                    const rawVal = info.getValue();
                    const val = typeof rawVal === 'number' ? rawVal : Number(rawVal);

                    if (rawVal === null || rawVal === undefined || !Number.isFinite(val)) {
                        return <span className="text-muted-foreground">-</span>;
                    }

                    const isPositive = val > 0;
                    return (
                        <div className={cn("flex items-center font-bold", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                            {isPositive && <ArrowUp size={14} className="mr-1" />}
                            {val.toFixed(1)}%
                        </div>
                    );
                },
            }),
            columnHelper.accessor('researchCount', {
                header: 'Research',
                cell: (info) => {
                    const count = info.getValue();
                    if (!count) return <span className="text-muted-foreground">-</span>;
                    return (
                        <div className="flex items-center gap-1.5 text-purple-400 font-semibold">
                            <Brain size={14} className="text-purple-400" />
                            {count}
                        </div>
                    );
                },
            }),
            columnHelper.accessor('newsCount', {
                header: 'News',
                cell: (info) => {
                    const count = info.getValue() || 0;
                    if (!count) return <span className="text-muted-foreground">-</span>;
                    return (
                        <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
                            <Newspaper size={14} className="text-sky-400" />
                            {count}
                        </div>
                    );
                },
            }),
            columnHelper.accessor('socialCount', {
                header: 'Social',
                cell: (info) => {
                    const count = info.getValue() || 0;
                    if (!count) return <span className="text-muted-foreground">-</span>;
                    return (
                        <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
                            <MessageCircle size={14} className="text-blue-400" />
                            {count}
                        </div>
                    );
                },
            }),
            columnHelper.accessor('riskScore', {
                header: 'Risk Score',
                cell: (info) => {
                    const val = info.getValue();
                    const numericVal = typeof val === 'number' ? val : Number(val);
                    if (!Number.isFinite(numericVal)) return <span className="text-muted-foreground">-</span>;

                    let colorClass = "text-muted-foreground";
                    let Icon = ShieldCheck;
                    if (numericVal <= 3.5) {
                        colorClass = "text-emerald-500 font-bold";
                        Icon = ShieldCheck;
                    } else if (numericVal <= 6.5) {
                        colorClass = "text-yellow-500 font-bold";
                        Icon = AlertTriangle;
                    } else {
                        colorClass = "text-red-500 font-bold";
                        Icon = Flame;
                    }

                    return (
                        <span className={cn("flex items-center gap-1.5", colorClass)}>
                            <Icon size={14} />
                            {Math.round(numericVal)}
                        </span>
                    );
                },
            }),
            columnHelper.accessor('rating', {
                header: 'Rating',
                cell: (info) => {
                    const rating = info.getValue();
                    let variant: "default" | "strongBuy" | "buy" | "hold" | "sell" | "outline" = "outline";

                    if (rating && rating !== '-') {
                        if (rating === 'Strong Buy') variant = 'strongBuy';
                        else if (rating === 'Buy') variant = 'buy';
                        else if (rating === 'Hold') variant = 'hold';
                        else if (rating === 'Sell') variant = 'sell';
                        else variant = "default";

                        const count = info.row.original.analystCount;
                        const label = count > 0 ? `${rating} (${count})` : rating;

                        return (
                            <div className="flex items-center gap-2">
                                <Badge variant={variant} className="whitespace-nowrap">{label}</Badge>
                            </div>
                        );
                    }
                    return <span className="text-muted-foreground">-</span>;
                },
            }),
            columnHelper.accessor('aiRating', {
                header: 'AI Rating',
                cell: (info) => {
                    const rating = info.getValue() as string;
                    if (!rating || rating === '-') return <span className="text-muted-foreground">-</span>;

                    let variant: "default" | "strongBuy" | "buy" | "hold" | "sell" | "outline" = "outline";
                    if (rating === 'Strong Buy') variant = 'strongBuy';
                    else if (rating === 'Buy') variant = 'buy';
                    else if (rating === 'Hold') variant = 'hold';
                    else if (rating === 'Sell') variant = 'sell';

                    return (
                        <Badge variant={variant} className="whitespace-nowrap gap-1.5">
                            <Bot size={12} className="opacity-80" />
                            {rating}
                        </Badge>
                    );
                },
            }),
            columnHelper.display({
                id: 'actions',
                header: '',
                cell: (info) => (
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove(info.row.original.itemId || '', info.row.original.symbol);
                            }}
                            title="Remove from watchlist"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ),
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
            columnVisibility: { sector: false },
        }
    });

    if (tableRef) {
        tableRef.current = table;
    }

    return (
        <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                {headerGroup.headers.map((header) => (
                                    <th
                                        key={header.id}
                                        className="h-10 px-4 text-left align-middle font-medium text-muted-foreground hover:text-foreground cursor-pointer select-none whitespace-nowrap"
                                        onClick={header.column.getToggleSortingHandler()}
                                    >
                                        <div className="flex items-center gap-1">
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                            {{
                                                asc: <ArrowUpRight className="ml-1 h-3 w-3" />,
                                                desc: <ArrowDownRight className="ml-1 h-3 w-3" />,
                                            }[header.column.getIsSorted() as string] ?? null}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="border-b">
                                    <td className="p-4"><div className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-full" /><div className="space-y-1"><Skeleton className="h-4 w-12" /><Skeleton className="h-3 w-20" /></div></div></td>
                                    {/* Sector (hidden by default) but if visible needs skeleton? table handles visibility, here we act dumb or map columns */}
                                    {/* Actually simpler to just render generic generic cells matching column count approx or just a few key ones */}
                                    {/* Iterate columns to match layout */}
                                    {table.getVisibleFlatColumns().slice(1).map((col) => (
                                        <td key={col.id} className="p-4"><Skeleton className="h-4 w-full" /></td>
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
                                    className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted cursor-pointer"
                                    onClick={() => navigate(`/ticker/${row.original.symbol}`)}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id} className="p-4 align-middle whitespace-nowrap">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

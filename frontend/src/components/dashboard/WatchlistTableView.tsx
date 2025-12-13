import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    flexRender,
    createColumnHelper,
    type Column,
    type ColumnFiltersState,
    type SortingState,
    type Table
} from '@tanstack/react-table';
import {
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Loader2,
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
import {
    Table as UiTable,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell
} from '../ui/table';
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

const SortableHeader = ({ column, title }: { column: Column<TickerData, unknown>, title: string }) => (
    <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="p-0 hover:bg-transparent font-medium text-xs"
    >
        {title}
        <ArrowUpDown className="ml-2 h-3 w-3" />
    </Button>
);

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
    tableRef: React.MutableRefObject<Table<TickerData> | null>; // To pass table instance back up if needed for sector filter control
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
                header: ({ column }) => <SortableHeader column={column} title="Ticker" />,
                cell: (info) => (
                    <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate(`/ticker/${info.getValue()}`)}>
                        <TickerLogo key={info.getValue()} url={info.row.original.logo} symbol={info.getValue()} />
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
                header: ({ column }) => <SortableHeader column={column} title="Price" />,
                cell: (info) => {
                    const val = Number(info.getValue());
                    return <span className="text-foreground font-mono font-medium">${Number.isFinite(val) ? val.toFixed(2) : '0.00'}</span>;
                },
            }),
            columnHelper.accessor('change', {
                header: ({ column }) => <SortableHeader column={column} title="Change %" />,
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
                header: ({ column }) => <SortableHeader column={column} title="Potential Upside" />,
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
                header: ({ column }) => <SortableHeader column={column} title="Research" />,
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
                header: ({ column }) => <SortableHeader column={column} title="News" />,
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
                header: ({ column }) => <SortableHeader column={column} title="Social" />,
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
                header: ({ column }) => <SortableHeader column={column} title="Risk Score" />,
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
                            {numericVal.toFixed(1)}
                        </span>
                    );
                },
            }),
            columnHelper.accessor('rating', {
                header: ({ column }) => <SortableHeader column={column} title="Rating" />,
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
                header: ({ column }) => <SortableHeader column={column} title="AI Rating" />,
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
                cell: (info) => (
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => onRemove(info.row.original.itemId || '', info.row.original.symbol)}
                            title="Remove from watchlist"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ),
            }),
        ];
    }, [navigate, onRemove]);

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

    // Expose table instance via ref for external filter control
    if (tableRef) {
        tableRef.current = table;
    }

    return (
        <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm overflow-hidden shadow-sm">
            {isLoading ? (
                <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-4 bg-muted/5">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm font-medium animate-pulse">Syncing Market Data...</p>
                </div>
            ) : (
                <UiTable>
                    <TableHeader className="bg-muted/20 hover:bg-muted/20">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} className="hover:bg-transparent border-border">
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id} className="h-10 text-xs uppercase tracking-wider font-bold text-muted-foreground">
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    className="border-border hover:bg-muted/50 transition-colors"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id} className="py-3">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-64 text-center p-0">
                                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto p-6 text-center">
                                        <div className="w-12 h-12 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                                            <Search className="w-6 h-6 text-muted-foreground/50" />
                                        </div>
                                        <h3 className="font-medium text-foreground mb-1">Watchlist is empty</h3>
                                        <p className="text-sm text-muted-foreground mb-4">Add your first ticker to track its performance.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </UiTable>
            )}
        </div>
    );
}

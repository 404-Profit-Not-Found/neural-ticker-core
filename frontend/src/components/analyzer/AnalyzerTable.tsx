import { useState } from 'react';
import {
    createColumnHelper,
    type SortingState,
} from '@tanstack/react-table';
import { 
    Search, ChevronRight, ChevronLeft, LayoutGrid, List,
    ArrowUp, ArrowDown, Bot, Brain, Newspaper, ShieldCheck, AlertTriangle, Flame, MessageCircle 
} from 'lucide-react';
import { useStockAnalyzer, type StockSnapshot } from '../../hooks/useStockAnalyzer';
import { useNavigate } from 'react-router-dom';
import { AnalyzerTableView } from './AnalyzerTableView';
import { AnalyzerGridView } from './AnalyzerGridView';
import { Badge } from '../ui/badge';
import { TickerLogo } from '../dashboard/TickerLogo';
import { cn } from '../../lib/api';

export function AnalyzerTable() {
    const navigate = useNavigate();
    
    // UI State
    const [viewMode, setViewMode] = useState<'table' | 'grid'>(
        () => (window.innerWidth < 768 ? 'grid' : 'table')
    );
    const [page, setPage] = useState(1);
    const [pageSize] = useState(25);
    const [search, setSearch] = useState('');
    const [sorting, setSorting] = useState<SortingState>([{ id: 'market_cap', desc: true }]);

    // Fetch Data
    const { data, isLoading } = useStockAnalyzer({
        page,
        limit: pageSize,
        sortBy: sorting[0]?.id || 'market_cap',
        sortDir: sorting[0]?.desc ? 'DESC' : 'ASC',
        search,
    });

    const items = data?.items || [];
    const meta = data?.meta;

    // Handle Window Resize for default view
    // We strictly follow "mobile defaults to grid" on initial load but preserve user choice if they toggle it manually.
    // No resize listener needed to avoid jarring layout shifts while browsing.

    // Column Definitions (passed to Table View)
    const columnHelper = createColumnHelper<StockSnapshot>();
    const columns = [
        columnHelper.accessor('ticker.symbol', {
            header: 'Ticker',
            cell: (info) => (
                <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate(`/ticker/${info.getValue()}`)}>
                    <TickerLogo key={info.getValue()} url={info.row.original.ticker.logo_url} symbol={info.getValue()} className="w-8 h-8" />
                    <div className="flex flex-col">
                        <span className="text-primary font-bold group-hover:underline">{info.getValue()}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider max-w-[150px] truncate" title={info.row.original.ticker.name}>
                            {info.row.original.ticker.name}
                        </span>
                        <span className="text-[9px] text-muted-foreground/70 truncate max-w-[150px]">
                            {info.row.original.ticker.sector}
                        </span>
                    </div>
                </div>
            ),
        }),
        columnHelper.accessor(row => row.latestPrice?.close, {
            id: 'close',
            header: 'Price',
            cell: (info) =>
                info.getValue() ? (
                    <span className="text-foreground font-mono font-medium">${info.getValue()?.toFixed(2)}</span>
                ) : (
                    '-'
                ),
        }),
        columnHelper.accessor(row => row.latestPrice?.change, {
            id: 'change', 
            header: 'Change %',
            cell: (info) => {
                const val = info.getValue();
                if (val === undefined || val === null) return '-';
                const isPositive = val >= 0;
                return (
                    <div className={cn("flex items-center font-medium", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                         {isPositive ? <ArrowUp size={14} className="mr-1" /> : <ArrowDown size={14} className="mr-1" />}
                        {Math.abs(val).toFixed(2)}%
                    </div>
                );
            },
        }),
        columnHelper.accessor(row => row.aiAnalysis?.upside_percent, {
            id: 'upside_percent',
            header: 'Potential Upside',
            cell: (info) => {
                const rawVal = info.getValue();
                if (rawVal === undefined || rawVal === null) return '-';
                const val = Number(rawVal);
                if (isNaN(val)) return '-';
                const isPositive = val > 0;

                return (
                    <div className={cn("flex items-center font-bold", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                        {isPositive && <ArrowUp size={14} className="mr-1" />}
                        {val.toFixed(1)}%
                    </div>
                );
            },
        }),
        columnHelper.accessor(row => row.counts?.research, {
            id: 'research',
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
        // News (Hidden if 0 usually, but table shows '-' which is fine)
         columnHelper.accessor(row => row.counts?.news, {
            id: 'news',
            header: 'News',
             cell: (info) => {
                const count = info.getValue();
                if (!count) return <span className="text-muted-foreground">-</span>;
                return (
                    <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
                        <Newspaper size={14} className="text-sky-400" />
                        {count}
                    </div>
                );
            },
        }),
        // Social
        columnHelper.accessor(row => row.counts?.social, {
            id: 'social',
            header: 'Social',
             cell: (info) => {
                const count = info.getValue();
                if (!count) return <span className="text-muted-foreground">-</span>;
                return (
                    <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
                        <MessageCircle size={14} className="text-blue-400" />
                        {count}
                    </div>
                );
            },
        }),
        columnHelper.accessor(row => row.aiAnalysis?.overall_score, {
            id: 'overall_score',
            header: 'Risk Score',
            cell: (info) => {
                const rawVal = info.getValue();
                if (rawVal === undefined || rawVal === null) return '-';
                const val = Number(rawVal);
                if (isNaN(val)) return '-';
                
                let colorClass = "text-muted-foreground";
                let Icon = ShieldCheck;
                if (val <= 3.5) {
                    colorClass = "text-emerald-500 font-bold";
                    Icon = ShieldCheck;
                } else if (val <= 6.5) {
                    colorClass = "text-yellow-500 font-bold";
                    Icon = AlertTriangle;
                } else {
                    colorClass = "text-red-500 font-bold";
                    Icon = Flame;
                }

                return (
                    <span className={cn("flex items-center gap-1.5", colorClass)}>
                        <Icon size={14} />
                        {val.toFixed(1)}
                    </span>
                );
            },
        }),
        // Analyst Consensus
         columnHelper.accessor(row => row.fundamentals.consensus_rating, {
            id: 'consensus',
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
                    
                    // We need count if avail
                    const count = info.row.original.counts?.analysts || 0;
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
        // AI Rating
        columnHelper.display({
            id: 'rating',
            header: 'AI Rating',
            cell: (info) => {
                const riskRaw = info.row.original.aiAnalysis?.overall_score;
                const upsideRaw = info.row.original.aiAnalysis?.upside_percent;
                
                if (riskRaw === undefined || upsideRaw === undefined) return <span className="text-muted-foreground">-</span>;
                
                const risk = Number(riskRaw);
                const upside = Number(upsideRaw);

                if (isNaN(risk) || isNaN(upside)) return <span className="text-muted-foreground">-</span>;
                
                let rating = 'Hold';
                let variant: "default" | "strongBuy" | "buy" | "hold" | "sell" | "outline" = "outline";
                
                if (upside > 10 && risk <= 7) { rating = 'Buy'; variant = 'buy'; }
                if (upside > 20 && risk <= 6) { rating = 'Strong Buy'; variant = 'strongBuy'; }
                if (upside < 0 || risk >= 8) { rating = 'Sell'; variant = 'sell'; }
                if (rating === 'Hold') variant = 'hold';

                return (
                    <Badge variant={variant} className="whitespace-nowrap gap-1.5">
                        <Bot size={12} className="opacity-80" />
                        {rating}
                    </Badge>
                );
            },
        }),
    ];

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        placeholder="Search tickers..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        className="pl-8 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                </div>

                {/* View Toggle */}
                <div className="flex items-center space-x-1 border border-border rounded-md p-1 bg-card">
                    <button
                        onClick={() => setViewMode('table')}
                        className={`p-1.5 rounded transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        title="Table View"
                    >
                        <List size={16} />
                    </button>
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        title="Grid View"
                    >
                        <LayoutGrid size={16} />
                    </button>
                </div>
            </div>

            {/* Content Switcher */}
            {viewMode === 'table' ? (
                <AnalyzerTableView 
                    data={items} 
                    columns={columns} 
                    sorting={sorting} 
                    setSorting={setSorting} 
                    navigate={(path) => navigate(path)} 
                    isLoading={isLoading} 
                />
            ) : (
                <AnalyzerGridView 
                    data={items} 
                    isLoading={isLoading} 
                />
            )}

            {/* Pagination Controls */}
            {meta && (
                <div className="flex items-center justify-between px-2">
                    <div className="text-sm text-muted-foreground">
                        Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, meta.total)} of {meta.total} results
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1 || isLoading}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <div className="text-sm font-medium">
                            Page {page} of {meta.totalPages}
                        </div>
                        <button
                            className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                            onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                            disabled={page >= meta.totalPages || isLoading}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

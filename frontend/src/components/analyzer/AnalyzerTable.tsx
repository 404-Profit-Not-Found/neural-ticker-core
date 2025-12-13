import { useState } from 'react';
import {
    createColumnHelper,
    type SortingState,
} from '@tanstack/react-table';
import { ArrowUpRight, ArrowDownRight, Search, ChevronRight, ChevronLeft, LayoutGrid, List } from 'lucide-react';
import { useStockAnalyzer, type StockSnapshot } from '../../hooks/useStockAnalyzer';
import { useNavigate } from 'react-router-dom';
import { AnalyzerTableView } from './AnalyzerTableView';
import { AnalyzerGridView } from './AnalyzerGridView';

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
            header: 'Symbol',
            cell: (info) => (
                <div className="flex items-center gap-3">
                    {info.row.original.ticker.logo_url ? (
                        <img
                            src={info.row.original.ticker.logo_url}
                            alt={info.getValue()}
                            className="w-8 h-8 rounded-full bg-muted object-contain p-1"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                            {info.getValue().substring(0, 2)}
                        </div>
                    )}
                    <div>
                        <div className="font-bold text-foreground">{info.getValue()}</div>
                        <div className="text-xs text-muted-foreground hidden sm:block">
                            {info.row.original.ticker.name}
                        </div>
                    </div>
                </div>
            ),
        }),
        columnHelper.accessor(row => row.latestPrice?.close, {
            id: 'close',
            header: 'Price',
            cell: (info) =>
                info.getValue() ? (
                    <span className="font-mono">${info.getValue()?.toFixed(2)}</span>
                ) : (
                    '-'
                ),
        }),
        columnHelper.accessor(row => row.latestPrice?.change, {
            id: 'change', 
            header: '24h %',
            cell: (info) => {
                const val = info.getValue();
                if (val === undefined || val === null) return '-';
                return (
                    <div
                        className={`flex items-center gap-1 font-mono ${val >= 0 ? 'text-green-500' : 'text-red-500'
                            }`}
                    >
                        {val >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {Math.abs(val).toFixed(2)}%
                    </div>
                );
            },
        }),
        columnHelper.accessor(row => row.fundamentals.market_cap, {
            id: 'market_cap',
            header: 'Market Cap',
            cell: (info) => {
                const rawVal = info.getValue();
                if (!rawVal) return '-';
                const val = Number(rawVal);
                if (isNaN(val)) return '-';

                // Format billions/millions
                if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
                if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
                if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
                return `$${val.toLocaleString()}`;
            },
        }),
        columnHelper.accessor(row => row.fundamentals.pe_ratio, { 
            id: 'pe_ttm', 
            header: 'PE Ratio',
            cell: (info) => {
                 const rawVal = info.row.original.fundamentals.pe_ttm || info.getValue();
                 if (rawVal === undefined || rawVal === null) return '-';
                 
                 const val = Number(rawVal);
                 return isNaN(val) ? '-' : val.toFixed(2);
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
                
                const color = val <= 3 ? 'text-green-500' : val >= 8 ? 'text-red-500' : 'text-yellow-500';
                return <span className={`font-bold ${color}`}>{val.toFixed(1)}</span>;
            },
        }),
        columnHelper.accessor(row => row.aiAnalysis?.upside_percent, {
            id: 'upside_percent',
            header: 'Exp. Upside',
            cell: (info) => {
                const rawVal = info.getValue();
                if (rawVal === undefined || rawVal === null) return '-';
                const val = Number(rawVal);
                if (isNaN(val)) return '-';

                return (
                    <span className={val > 15 ? 'text-green-500 font-bold' : ''}>
                        {val > 0 ? '+' : ''}{val.toFixed(1)}%
                    </span>
                );
            },
        }),
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
                
                let label = 'Hold';
                let style = 'bg-muted text-muted-foreground';

                if (upside > 10 && risk <= 7) {
                    label = 'Buy';
                    style = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
                }
                if (upside > 20 && risk <= 6) {
                    label = 'Strong Buy';
                    style = 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
                }
                if (upside < 0 || risk >= 8) {
                    label = 'Sell';
                    style = 'bg-red-500/10 text-red-500 border-red-500/20';
                }

                return (
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${style}`}>
                        {label}
                    </span>
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

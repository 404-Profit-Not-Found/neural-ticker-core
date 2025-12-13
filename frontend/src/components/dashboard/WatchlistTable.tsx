import { useState, useRef, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    flexRender,
    createColumnHelper,
    type Column,
    type ColumnFiltersState,
    type SortingState
} from '@tanstack/react-table';
import {
    Plus,
    Search,
    RefreshCw,
    Trash2,
    MoreVertical,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Loader2,
    Check,
    Filter,
    X,
    Bot,
    Brain,
    ShieldCheck,
    AlertTriangle,
    Flame,
    Newspaper,
    ChevronDown,
    Pencil,
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
import { useNavigate } from 'react-router-dom';
import { useToast } from '../ui/toast';
import {
    useWatchlists,
    useCreateWatchlist,
    useDeleteWatchlist,
    useRenameWatchlist,
    useAddTickerToWatchlist,
    useRemoveTickerFromWatchlist,
    useMarketSnapshots,
    useTickerSearch,
    type WatchlistItem
} from '../../hooks/useWatchlist';

// --- Types ---

interface TickerSearchResult {
    symbol: string;
    logo_url: string;
    exchange: string;
    name: string;
}

interface TickerData {
    symbol: string;
    logo?: string;
    company: string;
    sector: string;
    price: number;
    change: number;
    pe: number | null;
    marketCap: number | null;
    riskScore: number | null;
    rating: string;
    aiRating: string;
    newsCount: number;
    researchCount: number;
    analystCount: number;
    itemId?: string;
}

import { TickerLogo } from './TickerLogo';

interface MarketSnapshot {
    ticker: { symbol: string; logo_url?: string; name?: string; id: string };
    latestPrice?: { close: number; prevClose?: number };
    fundamentals?: {
        sector?: string;
        pe_ttm?: number;
        market_cap?: number;
        dividend_yield?: number;
        beta?: number;
        consensus_rating?: string;
    };
    aiAnalysis?: {
        overall_score: number;
        upside_percent: number;
    };
    counts?: {
        news: number;
        research: number;
        analysts: number;
    };
}

// Constant empty arrays to prevent reference changes and infinite loops
const EMPTY_SYMBOLS: string[] = [];
const EMPTY_ITEMS: WatchlistItem[] = [];
const EMPTY_TABLE_DATA: TickerData[] = [];
const EMPTY_SECTORS: string[] = [];

// Move SortableHeader outside component to prevent re-creation on every render
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

export function WatchlistTable() {
    const navigate = useNavigate();
    const { showToast } = useToast();

    // -- Query Hooks --
    const { data: watchlists = [], isLoading: isLoadingWatchlists } = useWatchlists();

    // Local State
    const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isSectorFilterOpen, setIsSectorFilterOpen] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    // Debounce search term to avoid excessive API calls
    const deferredSearchTerm = useDeferredValue(searchTerm);

    // Refs
    const searchInputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // -- Mutations --
    const createListMutation = useCreateWatchlist();
    const deleteListMutation = useDeleteWatchlist();
    const renameListMutation = useRenameWatchlist();
    const addTickerMutation = useAddTickerToWatchlist();
    const removeTickerMutation = useRemoveTickerFromWatchlist();
    const searchTickerQuery = useTickerSearch(deferredSearchTerm);

    // -- Derived State --
    // Auto-select first watchlist if none selected
    useEffect(() => {
        if (isLoadingWatchlists) return;

        if (!activeWatchlistId && watchlists.length > 0) {
            setActiveWatchlistId(watchlists[0].id);
        } else if (activeWatchlistId && watchlists.length > 0) {
            // Verify active one still exists
            const exists = watchlists.find(w => w.id === activeWatchlistId);
            if (!exists) {
                setActiveWatchlistId(watchlists[0].id);
            }
        }
    }, [watchlists, activeWatchlistId, isLoadingWatchlists]);

    const activeWatchlist = useMemo(() => {
        if (!watchlists || watchlists.length === 0) return null;
        return watchlists.find(w => w.id === activeWatchlistId) || null;
    }, [watchlists, activeWatchlistId]);

    const watchlistItems = useMemo(() => {
        if (!activeWatchlist || !activeWatchlist.items) return EMPTY_ITEMS;
        return Array.isArray(activeWatchlist.items) ? activeWatchlist.items : EMPTY_ITEMS;
    }, [activeWatchlist]);

    const symbols = useMemo(() => {
        if (!watchlistItems || watchlistItems.length === 0) return EMPTY_SYMBOLS;
        const filtered = watchlistItems
            .filter(i => i && i.ticker && i.ticker.symbol)
            .map(i => i.ticker.symbol);
        // Return EMPTY_SYMBOLS if no symbols to maintain reference stability
        return filtered.length === 0 ? EMPTY_SYMBOLS : filtered;
    }, [watchlistItems]);

    // -- Market Data Query --
    const { data: snapshotData, isLoading: isLoadingSnapshots, refetch: refetchSnapshots, isRefetching } = useMarketSnapshots(symbols);

    // -- Map Data --
    const formatMarketCap = (value: number) => {
        if (!value) return '-';
        if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
        return `$${value.toLocaleString()}`;
    };

    const tableData = useMemo<TickerData[]>(() => {
        if (!activeWatchlist || !snapshotData || !Array.isArray(snapshotData)) return EMPTY_TABLE_DATA;

        return snapshotData
            .filter((s: MarketSnapshot) => s && s.ticker && s.ticker.symbol)
            .map((s: MarketSnapshot) => {
                const price = Number(s.latestPrice?.close || 0);
                const prevClose = Number(s.latestPrice?.prevClose || price);
                const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
                const fundamentals = s.fundamentals || {};
                const rawRiskScore = s.aiAnalysis?.overall_score;
                const parsedRiskScore = typeof rawRiskScore === 'number' ? rawRiskScore : Number(rawRiskScore);
                const safeRiskScore = Number.isFinite(parsedRiskScore) ? parsedRiskScore : null;

                // AI Rating Logic
                let aiRating = '-';
                if (s.aiAnalysis) {
                    const { overall_score, upside_percent } = s.aiAnalysis;
                    // Score 0-10 (0 safe, 10 risky)
                    // Upside %
                    if (upside_percent > 15 && overall_score < 6) aiRating = 'Buy';
                    if (upside_percent > 40 && overall_score < 7) aiRating = 'Strong Buy';
                    if (upside_percent < 0 || overall_score > 8) aiRating = 'Sell';
                    if (aiRating === '-') aiRating = 'Hold'; // Default if data exists but fits no extreme
                }

                return {
                    symbol: s.ticker?.symbol || 'UNKNOWN',
                    logo: s.ticker?.logo_url,
                    company: s.ticker?.name || 'Unknown',
                    sector: fundamentals.sector || 'Others',
                    price: price,
                    change: change,
                    pe: fundamentals.pe_ttm ?? null,
                    marketCap: fundamentals.market_cap ?? null,
                    rating: fundamentals.consensus_rating || '-',
                    itemId: watchlistItems.find(i => i.ticker.symbol === s.ticker?.symbol)?.ticker.id,
                    aiRating: aiRating,
                    riskScore: safeRiskScore,
                    newsCount: s.counts?.news || 0,
                    researchCount: s.counts?.research || 0,
                    analystCount: s.counts?.analysts || 0,
                };
            });
    }, [snapshotData, activeWatchlist, watchlistItems]);

    const uniqueSectors = useMemo(() => {
        if (!tableData || tableData.length === 0) return EMPTY_SECTORS;
        const sectors = new Set(tableData.filter(d => d && d.sector).map(d => d.sector));
        return Array.from(sectors).sort();
    }, [tableData]);

    // -- Handlers --

    const handleCreateList = useCallback(() => {
        const name = prompt("Enter new watchlist name:", "New Watchlist");
        if (name) {
            createListMutation.mutate(name, {
                onSuccess: (newList) => {
                    setActiveWatchlistId(newList.id);
                    showToast("Watchlist created", 'success');
                }
            });
        }
    }, [createListMutation, showToast]);

    const handleRenameList = useCallback(() => {
        if (!activeWatchlistId || !activeWatchlist) return;
        const newName = prompt("Rename watchlist:", activeWatchlist.name);
        if (newName && newName !== activeWatchlist.name) {
            renameListMutation.mutate({ id: activeWatchlistId, name: newName }, {
                onSuccess: () => showToast("Watchlist renamed", 'success')
            });
        }
    }, [activeWatchlistId, activeWatchlist, renameListMutation, showToast]);

    const handleDeleteList = useCallback((watchlistId: string) => {
        const list = watchlists.find((w) => w.id === watchlistId);
        if (!list) return;

        const confirmed = window.confirm(`Delete watchlist "${list.name}"?`);
        if (!confirmed) return;

        deleteListMutation.mutate(watchlistId, {
            onSuccess: () => {
                showToast("Watchlist deleted", 'success');
                // Effect will handle active ID switch
            }
        });
    }, [watchlists, deleteListMutation, showToast]);

    const handleRemoveTicker = useCallback((itemId: string, symbol: string) => {
        if (!activeWatchlistId) return;

        removeTickerMutation.mutate({ watchlistId: activeWatchlistId, itemId }, {
            onSuccess: () => showToast(`${symbol} removed`, 'success'),
            onError: () => showToast("Failed to remove ticker", 'error')
        });
    }, [activeWatchlistId, removeTickerMutation, showToast]);

    const selectSuggestion = useCallback((symbol: string) => {
        if (!activeWatchlistId) {
            showToast("No active watchlist", 'error');
            return;
        }

        // Check duplicates using watchlistItems instead of activeWatchlist
        if (watchlistItems && watchlistItems.some(i => i.ticker.symbol === symbol)) {
            showToast(`${symbol} is already in the watchlist`, 'error');
            setSearchTerm('');
            setShowSuggestions(false);
            return;
        }

        addTickerMutation.mutate({ watchlistId: activeWatchlistId, symbol }, {
            onSuccess: () => {
                showToast(`${symbol} added`, 'success');
                setSearchTerm('');
                setShowSuggestions(false);
            },
            onError: (err: unknown) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const msg = (err as any).response?.data?.message || "Failed to add ticker";
                showToast(msg, 'error');
            }
        });
    }, [activeWatchlistId, watchlistItems, addTickerMutation, showToast]);

    // -- Search & Dropdown Effects --
    useEffect(() => {
        if (searchTickerQuery.data && searchTickerQuery.data.length > 0) {
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    }, [searchTickerQuery.data]);

    // Close handlers
    // Global listeners removed in favor of Backdrop pattern
    const closeAllDropdowns = useCallback(() => {
        setIsDropdownOpen(false);
        setIsSectorFilterOpen(false);
        setShowSuggestions(false);
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const suggestions = searchTickerQuery.data || [];
        if (!showSuggestions || suggestions.length === 0) {
            if (e.key === 'Enter' && searchTerm.trim()) {
                selectSuggestion(searchTerm.toUpperCase());
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                selectSuggestion(suggestions[selectedIndex].symbol);
            } else if (searchTerm.trim()) {
                selectSuggestion(searchTerm.toUpperCase());
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    }, [searchTickerQuery.data, showSuggestions, searchTerm, selectedIndex, selectSuggestion]);


    // -- Table Setup --
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
            // Hidden sector column for filtering
            columnHelper.accessor('sector', {
                id: 'sector',
                header: 'Sector',
                enableHiding: true, // We don't want to show this column, just filter by it? 
                // Actually, we merged it into symbol, but we can still have an accessor for it to filter!
                // But if we don't display it, the table won't show it. Good.
            }),
            columnHelper.accessor('price', {
                header: ({ column }) => <SortableHeader column={column} title="Price" />,
                cell: (info) => <span className="text-foreground font-mono font-medium">${info.getValue().toFixed(2)}</span>,
            }),
            columnHelper.accessor('change', {
                header: ({ column }) => <SortableHeader column={column} title="Change %" />,
                cell: (info) => {
                    const val = info.getValue();
                    const isPositive = val >= 0;
                    return (
                        <div className={cn("flex items-center font-medium", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                            {isPositive ? <ArrowUp size={14} className="mr-1" /> : <ArrowDown size={14} className="mr-1" />}
                            {Math.abs(val).toFixed(2)}%
                        </div>
                    );
                },
            }),
            columnHelper.accessor('marketCap', {
                header: ({ column }) => <SortableHeader column={column} title="Market Cap" />,
                cell: (info) => <span className="text-muted-foreground">{formatMarketCap(info.getValue() || 0)}</span>,
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
            columnHelper.accessor('riskScore', {
                header: ({ column }) => <SortableHeader column={column} title="Risk Score" />,
                cell: (info) => {
                    const val = info.getValue();
                    const numericVal = typeof val === 'number' ? val : Number(val);
                    if (!Number.isFinite(numericVal)) return <span className="text-muted-foreground">-</span>;
                    // Color scale: 0-3 Green, 4-6 Yellow, 7-10 Red
                    let colorClass = "text-muted-foreground";
                    let Icon = ShieldCheck;
                    if (numericVal <= 3.5) {
                        colorClass = "text-emerald-500 font-bold"; // Low risk
                        Icon = ShieldCheck;
                    } else if (numericVal <= 6.5) {
                        colorClass = "text-yellow-500 font-bold"; // Medium risk
                        Icon = AlertTriangle;
                    } else {
                        colorClass = "text-red-500 font-bold"; // High risk
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
                        else variant = "default"; // Fallback for other valid strings

                        const count = info.row.original.analystCount;
                        const label = count > 0 ? `${rating} (${count})` : rating;

                        return (
                            <div className="flex items-center gap-2">
                                <Badge variant={variant} className="whitespace-nowrap">{label}</Badge>
                            </div>
                        );
                    }

                    // Empty state
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
                            onClick={() => handleRemoveTicker(info.row.original.itemId || '', info.row.original.symbol)}
                            title="Remove from watchlist"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ),
            }),
        ];
    }, [navigate, handleRemoveTicker]);

    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({
        data: tableData,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        onColumnFiltersChange: setColumnFilters,
        state: { sorting, globalFilter, columnFilters },
        initialState: {
            columnVisibility: { sector: false }, // Hide the filter column from view
        }
    });

    const isGlobalLoading = isLoadingWatchlists || (isLoadingSnapshots && symbols.length > 0);
    const activeSectorFilter = (table.getColumn('sector')?.getFilterValue() as string) || null;

    return (
        <div className="w-full space-y-4">
            {/* Toolbar Section */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-1">
                {/* Left Side: Watchlist Selector & Add Ticker */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">

                    {/* Watchlist Selector Group */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative w-full sm:w-auto">
                            <Button
                                variant="ghost"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="w-full sm:w-auto justify-start px-2 hover:bg-muted/50 gap-2"
                            >
                                <span className="truncate font-bold text-lg">{activeWatchlist?.name || "Select Watchlist"}</span>
                                <ChevronDown className={`w-4 h-4 opacity-50 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </Button>

                            {isDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-40 bg-transparent" onClick={closeAllDropdowns} />
                                    <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-xl z-50 py-1 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                        {watchlists.map(w => (
                                            <button
                                                key={w.id}
                                                onClick={() => {
                                                    setActiveWatchlistId(w.id);
                                                    setIsDropdownOpen(false);
                                                }}
                                                className={cn(
                                                    "w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors",
                                                    activeWatchlistId === w.id ? "bg-accent/50 text-accent-foreground font-medium" : "text-foreground hover:bg-muted/50"
                                                )}
                                            >
                                                <span className="truncate">{w.name}</span>
                                                {activeWatchlistId === w.id && <Check className="w-3.5 h-3.5 text-primary" />}
                                            </button>
                                        ))}
                                        <div className="border-t border-border mt-1 pt-1 px-1">
                                            <button
                                                onClick={() => {
                                                    setIsDropdownOpen(false);
                                                    handleCreateList();
                                                }}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-sm transition-colors"
                                            >
                                                <Plus className="w-3 h-3" /> Create New List
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* List Actions (Rename/Delete) - Only show when hovering or on mobile? Keeping visible for utility */}
                        {activeWatchlistId && (
                            <div className="flex items-center">
                                <Button variant="ghost" size="icon" onClick={handleRenameList} className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Rename List">
                                    <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteList(activeWatchlistId!)}
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    title="Delete List"
                                    aria-label="Delete watchlist"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="hidden sm:block w-px h-6 bg-border mx-2" />

                    {/* Add Ticker Input - Now close to selector */}
                    <div className="relative flex-1 sm:flex-none w-full sm:w-auto">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Add stock..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={addTickerMutation.isPending}
                            className="h-9 w-full sm:w-[180px] bg-transparent border-none rounded-md pl-9 pr-3 text-sm focus:outline-none focus:ring-0 placeholder:text-muted-foreground hover:bg-muted/50 transition-all"

                        />
                        {/* Suggestions Dropdown */}
                        {showSuggestions && (
                            <>
                                <div className="fixed inset-0 z-40 bg-transparent" onClick={closeAllDropdowns} />
                                <div ref={suggestionsRef} className="absolute top-full left-0 mt-2 w-[300px] bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
                                    <div className="py-1 max-h-[300px] overflow-y-auto">
                                        {searchTickerQuery.data?.map((s: TickerSearchResult, idx: number) => (
                                            <button
                                                key={s.symbol}
                                                onClick={() => selectSuggestion(s.symbol)}
                                                className={cn(
                                                    "w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0",
                                                    selectedIndex === idx && "bg-muted/50"
                                                )}
                                            >
                                                <div className="bg-background p-1.5 rounded-md border border-border/50 shadow-sm">
                                                    <TickerLogo url={s.logo_url} symbol={s.symbol} className="w-6 h-6" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-sm text-foreground">{s.symbol}</span>
                                                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground">{s.exchange}</Badge>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground truncate block mt-0.5">{s.name}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Center: Global Search Filter */}
                <div className="flex-1 px-4 flex justify-center">
                    <div className="relative group w-full max-w-[240px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground group-hover:text-foreground transition-colors w-3.5 h-3.5" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={globalFilter ?? ''}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            className="h-9 w-full bg-transparent border-none rounded-md pl-9 pr-3 text-sm focus:outline-none focus:ring-0 placeholder:text-muted-foreground hover:bg-muted/50 transition-all"
                        />
                    </div>
                </div>

                {/* Right Side: Filtering & View Controls */}
                <div className="flex items-center gap-3 w-full md:w-auto">
                    {/* Clean Sector Filter */}
                    <div className="relative">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsSectorFilterOpen(!isSectorFilterOpen)}
                            className={cn(
                                "h-9 gap-2 text-muted-foreground hover:text-foreground",
                                activeSectorFilter && "text-primary bg-primary/10 hover:bg-primary/20 hover:text-primary"
                            )}
                        >
                            <Filter className="w-3.5 h-3.5" />
                            <span className="text-sm">{activeSectorFilter || "Sector"}</span>
                            {activeSectorFilter && (
                                <div
                                    className="p-0.5 hover:bg-background/20 rounded-full cursor-pointer ml-1"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        table.getColumn('sector')?.setFilterValue(undefined);
                                    }}
                                >
                                    <X className="w-3 h-3" />
                                </div>
                            )}
                        </Button>

                        {isSectorFilterOpen && (
                            <>
                                <div className="fixed inset-0 z-40 bg-transparent" onClick={closeAllDropdowns} />
                                <div className="absolute top-full right-0 mt-1 w-56 bg-popover border border-border rounded-md shadow-lg z-50 py-1 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95">
                                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
                                        Filter by Sector
                                    </div>
                                    <button
                                        onClick={() => {
                                            table.getColumn('sector')?.setFilterValue(undefined);
                                            setIsSectorFilterOpen(false);
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between transition-colors"
                                    >
                                        <span className="text-muted-foreground">All Sectors</span>
                                        {!activeSectorFilter && <Check className="w-3.5 h-3.5 text-primary" />}
                                    </button>
                                    {uniqueSectors.map(sector => (
                                        <button
                                            key={sector}
                                            onClick={() => {
                                                table.getColumn('sector')?.setFilterValue(sector);
                                                setIsSectorFilterOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between transition-colors"
                                        >
                                            <span className="truncate text-foreground">{sector}</span>
                                            {activeSectorFilter === sector && <Check className="w-3.5 h-3.5 text-primary" />}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => refetchSnapshots()}
                        disabled={isRefetching || isLoadingSnapshots}
                        className="h-9 w-9 text-muted-foreground hover:text-foreground"
                        title="Refresh Data"
                    >
                        <RefreshCw size={14} className={isRefetching ? "animate-spin" : ""} />
                    </Button>
                </div>
            </div>

            {/* Table Area - No outer card, just the table */}
            <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm overflow-hidden shadow-sm">
                {isGlobalLoading ? (
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
        </div>
    );
}

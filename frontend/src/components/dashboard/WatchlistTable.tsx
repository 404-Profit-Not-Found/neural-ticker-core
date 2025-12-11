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
    TrendingUp,
    Pencil,
    ChevronDown,
    Check,
    Filter,
    X
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
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
    divYield: string | null;
    beta: number | null;
    rating: string;
    growthRank: number;
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
        className="p-0 hover:bg-transparent font-medium"
    >
        {title}
        <ArrowUpDown className="ml-2 h-4 w-4" />
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
    }, [activeWatchlist?.items]);

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

                return {
                    symbol: s.ticker?.symbol || 'UNKNOWN',
                    logo: s.ticker?.logo_url,
                    company: s.ticker?.name || 'Unknown',
                    sector: fundamentals.sector || 'Others',
                    price: price,
                    change: change,
                    pe: fundamentals.pe_ttm ?? null,
                    marketCap: fundamentals.market_cap ?? null,
                    divYield: fundamentals.dividend_yield ? Number(fundamentals.dividend_yield).toFixed(2) + '%' : '-',
                    beta: fundamentals.beta ?? null,
                    rating: 'Hold',
                    growthRank: 5,
                    itemId: watchlistItems.find(i => i.ticker.symbol === s.ticker?.symbol)?.ticker.id
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
    }, [searchTickerQuery.data?.length]);

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
                    <div className="flex items-center gap-3" onClick={() => navigate(`/ticker/${info.getValue()}`)}>
                        <TickerLogo key={info.getValue()} url={info.row.original.logo} symbol={info.getValue()} />
                        <div className="flex flex-col cursor-pointer">
                            <span className="text-primary font-bold hover:underline">{info.getValue()}</span>
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
                cell: (info) => <span className="text-foreground font-mono">${info.getValue().toFixed(2)}</span>,
            }),
            columnHelper.accessor('change', {
                header: ({ column }) => <SortableHeader column={column} title="Change %" />,
                cell: (info) => {
                    const val = info.getValue();
                    const isPositive = val >= 0;
                    return (
                        <div className={cn("flex items-center font-medium", isPositive ? "text-green-500" : "text-red-500")}>
                            {isPositive ? <ArrowUp size={14} className="mr-1" /> : <ArrowDown size={14} className="mr-1" />}
                            {Math.abs(val).toFixed(2)}%
                        </div>
                    );
                },
            }),
            columnHelper.accessor('pe', {
                header: ({ column }) => <SortableHeader column={column} title="P/E" />,
                cell: (info) => <span className="text-foreground">{info.getValue() ? Number(info.getValue()).toFixed(2) : '-'}</span>,
            }),
            columnHelper.accessor('marketCap', {
                header: ({ column }) => <SortableHeader column={column} title="Market Cap" />,
                cell: (info) => <span className="text-foreground">{formatMarketCap(info.getValue() || 0)}</span>,
            }),
            columnHelper.accessor('divYield', {
                header: ({ column }) => <SortableHeader column={column} title="Div Yield %" />,
                cell: (info) => <span className="text-foreground">{info.getValue() || '-'}</span>,
            }),
            columnHelper.accessor('beta', {
                header: ({ column }) => <SortableHeader column={column} title="Beta" />,
                cell: (info) => <span className="text-foreground">{info.getValue() ? Number(info.getValue()).toFixed(2) : '-'}</span>,
            }),
            columnHelper.accessor('rating', {
                header: ({ column }) => <SortableHeader column={column} title="Rating" />,
                cell: (info) => {
                    const rating = info.getValue();
                    let variant: "default" | "strongBuy" | "buy" | "hold" | "sell" = "default";
                    if (rating === 'Strong Buy') variant = 'strongBuy';
                    else if (rating === 'Buy') variant = 'buy';
                    else if (rating === 'Hold') variant = 'hold';
                    return <Badge variant={variant} className="whitespace-nowrap">{rating}</Badge>;
                },
            }),
            columnHelper.accessor('growthRank', {
                header: ({ column }) => <SortableHeader column={column} title="Growth Rank" />,
                cell: (info) => (
                    <div className="flex items-center text-foreground">
                        {info.getValue()}
                        <TrendingUp size={14} className="ml-1 text-green-500" />
                    </div>
                )
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
                            className="h-8 w-8 text-muted-foreground hover:text-red-500"
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
        <div className="space-y-4">
            {/* Backdrop for closing dropdowns */}
            {(isDropdownOpen || isSectorFilterOpen || showSuggestions) && (
                <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={closeAllDropdowns}
                />
            )}
            {/* Header / Dropdown Control */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    {/* Custom Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-sm font-medium text-foreground transition-colors border border-transparent focus:border-primary outline-none min-w-[150px] justify-between"
                        >
                            <span className="truncate max-w-[200px]">{activeWatchlist?.name || "Select Watchlist"}</span>
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-md shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                                {watchlists.map(w => (
                                    <button
                                        key={w.id}
                                        onClick={() => {
                                            setActiveWatchlistId(w.id);
                                            setIsDropdownOpen(false);
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted/50 flex items-center justify-between group"
                                    >
                                        <span className={activeWatchlistId === w.id ? "font-semibold" : ""}>{w.name}</span>
                                        {activeWatchlistId === w.id && <Check className="w-3 h-3 text-primary" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={handleCreateList} className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Create New List" disabled={createListMutation.isPending}>
                            <Plus className="w-4 h-4" />
                        </Button>
                        {activeWatchlistId && (
                            <>
                                <Button variant="ghost" size="icon" onClick={handleRenameList} className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Rename List" disabled={renameListMutation.isPending}>
                                    <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteList(activeWatchlistId)}
                                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                    title="Delete Watchlist"
                                    disabled={deleteListMutation.isPending}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter & Add Actions */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* Add Ticker */}
                    <div className="relative">
                        {addTickerMutation.isPending ? (
                            <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary w-4 h-4 animate-spin" />
                        ) : (
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        )}
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Add stock..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={addTickerMutation.isPending}
                            className="h-9 w-64 bg-card border border-border rounded-md pl-9 pr-4 text-sm text-foreground focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground disabled:opacity-50"
                        />

                        {/* Autocomplete Dropdown */}
                        {showSuggestions && (
                            <div
                                ref={suggestionsRef}
                                className="absolute top-full left-0 mt-1 w-80 bg-card border border-border rounded-md shadow-lg z-50 py-1 max-h-64 overflow-y-auto"
                            >
                                {searchTickerQuery.data?.map((s: TickerSearchResult, idx: number) => (
                                    <button
                                        key={s.symbol}
                                        onClick={() => selectSuggestion(s.symbol)}
                                        className={cn(
                                            "w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/50 transition-colors",
                                            selectedIndex === idx && "bg-muted/50"
                                        )}
                                    >
                                        <TickerLogo
                                            url={s.logo_url}
                                            symbol={s.symbol}
                                            className="w-6 h-6"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-primary">{s.symbol}</span>
                                                <span className="text-xs text-muted-foreground">{s.exchange}</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground truncate block">{s.name}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetchSnapshots()}
                        disabled={isRefetching || isLoadingSnapshots}
                        className="h-9 gap-2 bg-card border-border text-foreground hover:bg-muted hover:text-foreground"
                    >
                        <RefreshCw size={14} className={isRefetching ? "animate-spin" : ""} />
                        Refresh Data
                    </Button>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2">
                    {/* Sector Filter Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setIsSectorFilterOpen(!isSectorFilterOpen)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border outline-none h-9",
                                activeSectorFilter
                                    ? "bg-primary/20 border-primary text-primary hover:bg-primary/30"
                                    : "bg-card border-border hover:bg-muted text-foreground"
                            )}
                        >
                            <Filter className="w-4 h-4" />
                            <span>{activeSectorFilter || "Sector"}</span>
                            {activeSectorFilter ? (
                                <div onClick={(e) => {
                                    e.stopPropagation();
                                    table.getColumn('sector')?.setFilterValue(undefined);
                                }}>
                                    <X className="w-3 h-3 hover:text-red-500" />
                                </div>
                            ) : (
                                <ChevronDown className="w-3 h-3 text-muted-foreground" />
                            )}
                        </button>

                        {isSectorFilterOpen && (
                            <div className="absolute top-full right-0 mt-1 w-48 bg-card border border-border rounded-md shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                                <button
                                    onClick={() => {
                                        table.getColumn('sector')?.setFilterValue(undefined);
                                        setIsSectorFilterOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted/50 flex items-center justify-between"
                                >
                                    <span>All Sectors</span>
                                    {!activeSectorFilter && <Check className="w-3 h-3 text-primary" />}
                                </button>
                                {uniqueSectors.map(sector => (
                                    <button
                                        key={sector}
                                        onClick={() => {
                                            table.getColumn('sector')?.setFilterValue(sector);
                                            setIsSectorFilterOpen(false);
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted/50 flex items-center justify-between"
                                    >
                                        <span className="truncate">{sector}</span>
                                        {activeSectorFilter === sector && <Check className="w-3 h-3 text-primary" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Global Filter */}
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Filter list..."
                            value={globalFilter ?? ''}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            className="h-9 w-48 bg-card border border-border rounded-md pl-9 pr-4 text-sm text-foreground focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
                        />
                    </div>
                </div>
            </div>

            <div className="rounded-md border border-border bg-card overflow-hidden rgb-border">
                {isGlobalLoading ? (
                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <p>Loading Market Data...</p>
                    </div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/30 border-b border-border text-muted-foreground font-medium">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th key={header.id} className="px-4 py-3 h-10 align-middle [&:has([role=checkbox])]:pr-0 font-medium">
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0 divide-y divide-border">
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        data-state={row.getIsSelected() && "selected"}
                                        className="transition-colors hover:bg-muted/50"
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td key={cell.id} className="px-4 py-3 align-middle [&:has([role=checkbox])]:pr-0">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <span>No stocks in your watchlist.</span>
                                            <span className="text-xs">Add a symbol to get started.</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground px-2">
                <div>Total: {tableData.length} items</div>
            </div>
        </div>
    );
}

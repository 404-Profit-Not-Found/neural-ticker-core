import { useState, useRef, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import {
    type ColumnFiltersState,
    type SortingState,
    type Table
} from '@tanstack/react-table';
import {
    Plus,
    Search,
    Trash2,
    Check,
    Filter,
    X,
    ChevronDown,
    Pencil,
    LayoutGrid,
    List
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/api';
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
import { TickerLogo } from './TickerLogo';
import { WatchlistTableView, type TickerData } from './WatchlistTableView';
import { WatchlistGridView } from './WatchlistGridView';

// --- Types ---
interface TickerSearchResult {
    symbol: string;
    logo_url: string;
    exchange: string;
    name: string;
}

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
        news?: number;
        research?: number;
        analysts?: number;
        social?: number;
    };

}

// Constant empty arrays
const EMPTY_SYMBOLS: string[] = [];
const EMPTY_ITEMS: WatchlistItem[] = [];
const EMPTY_TABLE_DATA: TickerData[] = [];
const EMPTY_SECTORS: string[] = [];

export function WatchlistTable() {
    const { showToast } = useToast();

    // -- Query Hooks --
    const { data: watchlists = [], isLoading: isLoadingWatchlists } = useWatchlists();

    // Local State
    const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>(
        () => (window.innerWidth < 768 ? 'grid' : 'table')
    );

    // Table State (Lifted up to manage filtering/sorting across re-renders of views if needed)
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState('');

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isSectorFilterOpen, setIsSectorFilterOpen] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    // Debounce search term
    const deferredSearchTerm = useDeferredValue(searchTerm);

    // Refs
    const searchInputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const tableInstanceRef = useRef<Table<TickerData> | null>(null);

    // -- Mutations --
    const createListMutation = useCreateWatchlist();
    const deleteListMutation = useDeleteWatchlist();
    const renameListMutation = useRenameWatchlist();
    const addTickerMutation = useAddTickerToWatchlist();
    const removeTickerMutation = useRemoveTickerFromWatchlist();
    const searchTickerQuery = useTickerSearch(deferredSearchTerm);

    // -- Derived State --
    // Use selected ID if valid, otherwise failover to first list
    const activeWatchlistId = useMemo(() => {
        if (!watchlists || watchlists.length === 0) return null;
        if (selectedWatchlistId && watchlists.find(w => w.id === selectedWatchlistId)) {
            return selectedWatchlistId;
        }
        return watchlists[0].id;
    }, [watchlists, selectedWatchlistId]);

    const activeWatchlist = useMemo(() => {
        if (!activeWatchlistId) return null;
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
        return filtered.length === 0 ? EMPTY_SYMBOLS : filtered;
    }, [watchlistItems]);

    // -- Market Data Query --
    const { data: snapshotData, isLoading: isLoadingSnapshots } = useMarketSnapshots(symbols);

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
                    if (upside_percent > 10 && overall_score <= 7) aiRating = 'Buy';
                    if (upside_percent > 20 && overall_score <= 6) aiRating = 'Strong Buy';
                    if (upside_percent < 0 || overall_score >= 8) aiRating = 'Sell';
                    if (aiRating === '-') aiRating = 'Hold';
                }

                // Find corresponding watchlist item to get ID
                const watchlistItem = watchlistItems.find(i => i.ticker.symbol === s.ticker?.symbol);

                return {
                    symbol: s.ticker?.symbol || 'UNKNOWN',
                    logo: s.ticker?.logo_url,
                    company: s.ticker?.name || 'Unknown',
                    sector: fundamentals.sector || 'Others',
                    price: price,
                    change: change,
                    pe: fundamentals.pe_ttm ?? null,
                    marketCap: fundamentals.market_cap ?? null,
                    potentialUpside: s.aiAnalysis?.upside_percent ?? null,
                    riskScore: safeRiskScore,
                    rating: fundamentals.consensus_rating || '-',
                    aiRating: aiRating,
                    newsCount: s.counts?.news || 0,
                    researchCount: s.counts?.research || 0,
                    analystCount: s.counts?.analysts || 0,
                    socialCount: s.counts?.social || 0,
                    itemId: watchlistItem?.id
                };
            });
    }, [snapshotData, activeWatchlist, watchlistItems]);

    const uniqueSectors = useMemo(() => {
        if (!tableData || tableData.length === 0) return EMPTY_SECTORS;
        const sectors = new Set(tableData.filter(d => d && d.sector).map(d => d.sector));
        return Array.from(sectors).sort();
    }, [tableData]);

    const isGlobalLoading = isLoadingWatchlists || (isLoadingSnapshots && symbols.length > 0);
    const activeSectorFilter = useMemo(() => {
        const sectorFilter = columnFilters.find(f => f.id === 'sector');
        return (sectorFilter?.value as string) || null;
    }, [columnFilters]);

    // -- Handlers --
    const handleCreateList = useCallback(() => {
        const name = prompt("Enter new watchlist name:", "New Watchlist");
        if (name) {
            createListMutation.mutate(name, {
                onSuccess: (newList) => {
                    setSelectedWatchlistId(newList.id);
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
            onSuccess: () => showToast("Watchlist deleted", 'success')
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
                const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to add ticker";
                showToast(msg, 'error');
            }
        });
    }, [activeWatchlistId, watchlistItems, addTickerMutation, showToast]);

    // -- Search & Dropdown Effects --
    useEffect(() => {
        const hasData = !!(searchTickerQuery.data && searchTickerQuery.data.length > 0);
        const timer = setTimeout(() => {
            setShowSuggestions(hasData);
        }, 0);
        return () => clearTimeout(timer);
    }, [searchTickerQuery.data]);

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

    const setSectorFilter = (value: string | undefined) => {
        setColumnFilters(prev => {
            const others = prev.filter(f => f.id !== 'sector');
            if (value) {
                return [...others, { id: 'sector', value }];
            }
            return others;
        });
    };

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-col gap-4 p-1">
                {/* Row 1: Header (Left) and Sector Filter (Right) - on mobile this might wrap/stack, but let's try to keep the header line clean */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

                    {/* LEFT GROUP: Watchlist Selector + View Switcher */}
                    <div className="flex items-center gap-3 justify-between sm:justify-start w-full sm:w-auto">

                        {/* Watchlist Selector + Edit Actions */}
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Button
                                    variant="ghost"
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="justify-start px-2 hover:bg-muted/50 gap-2 h-10"
                                >
                                    <span className="truncate font-bold text-xl">{activeWatchlist?.name || "Select Watchlist"}</span>
                                    <ChevronDown className={`w-4 h-4 opacity-50 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                                </Button>

                                {isDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40 bg-transparent" onClick={closeAllDropdowns} />
                                        <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-xl z-50 py-1 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                            {watchlists.map(list => (
                                                <button
                                                    key={list.id}
                                                    onClick={() => {
                                                        setSelectedWatchlistId(list.id);
                                                        setIsDropdownOpen(false);
                                                    }}
                                                    className={cn(
                                                        "w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors",
                                                        activeWatchlistId === list.id ? "bg-accent/50 text-accent-foreground font-medium" : "text-foreground hover:bg-muted/50"
                                                    )}
                                                >
                                                    <span className="truncate">{list.name}</span>
                                                    {activeWatchlistId === list.id && <Check className="w-3.5 h-3.5 text-primary" />}
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

                            {activeWatchlistId && (
                                <div className="flex items-center">
                                    <Button variant="ghost" size="icon" onClick={handleRenameList} className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Rename List" aria-label="Rename watchlist">
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

                        {/* View Switcher - Placed immediately next to selector group */}
                        <div className="flex items-center space-x-1 border border-border rounded-md p-1 bg-card shrink-0">
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
                </div>

                {/* Row 2: Controls (Add, Filter, Sector) */}
                <div className="flex flex-col sm:flex-row gap-3">

                    {/* Add Ticker */}
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Add stock..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={addTickerMutation.isPending}
                            className="h-9 w-full bg-transparent border border-border rounded-md pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground hover:bg-accent/10 transition-all bg-card/50"
                        />
                        {showSuggestions && (
                            <>
                                <div className="fixed inset-0 z-40 bg-transparent" onClick={closeAllDropdowns} />
                                <div ref={suggestionsRef} className="absolute top-full left-0 mt-2 w-full sm:w-[300px] bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
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

                    {/* Global Filter */}
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                        <input
                            type="text"
                            placeholder="Filter watchlist..."
                            value={globalFilter ?? ''}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            className="h-9 w-full bg-transparent border border-border rounded-md pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground hover:bg-accent/10 transition-all bg-card/50"
                        />
                    </div>

                    {/* Sector Filter - Right Aligned on Desktop */}
                    <div className="relative w-full sm:w-auto">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsSectorFilterOpen(!isSectorFilterOpen)}
                            className={cn(
                                "w-full sm:w-auto h-9 gap-2 justify-between sm:justify-center border-border/60",
                                activeSectorFilter && "text-primary border-primary/50 bg-primary/5"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <Filter className="w-3.5 h-3.5" />
                                <span className="text-sm">{activeSectorFilter || "Sector"}</span>
                            </div>
                            {activeSectorFilter ? (
                                <div
                                    className="p-0.5 hover:bg-background/20 rounded-full cursor-pointer ml-1"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSectorFilter(undefined);
                                    }}
                                >
                                    <X className="w-3 h-3" />
                                </div>
                            ) : (
                                <ChevronDown className="w-3.5 h-3.5 opacity-50 block sm:hidden" />
                            )}
                        </Button>

                        {isSectorFilterOpen && (
                            <>
                                <div className="fixed inset-0 z-40 bg-transparent" onClick={closeAllDropdowns} />
                                <div className="absolute top-full right-0 mt-1 w-full sm:w-56 bg-popover border border-border rounded-md shadow-lg z-50 py-1 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95">
                                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
                                        Filter by Sector
                                    </div>
                                    <button
                                        onClick={() => {
                                            setSectorFilter(undefined);
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
                                                setSectorFilter(sector);
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

                </div>
            </div>

            {/* Content Area */}
            {viewMode === 'table' ? (
                <WatchlistTableView
                    data={tableData}
                    isLoading={isGlobalLoading}
                    onRemove={handleRemoveTicker}
                    sorting={sorting}
                    setSorting={setSorting}
                    columnFilters={columnFilters}
                    setColumnFilters={setColumnFilters}
                    globalFilter={globalFilter}
                    setGlobalFilter={setGlobalFilter}
                    tableRef={tableInstanceRef}
                />
            ) : (
                <WatchlistGridView
                    data={tableData.filter(item => {
                        // Apply Sector Filter
                        if (activeSectorFilter && item.sector !== activeSectorFilter) return false;

                        // Apply Global Search Filter
                        if (globalFilter) {
                            const search = globalFilter.toLowerCase();
                            return (
                                item.symbol.toLowerCase().includes(search) ||
                                item.company.toLowerCase().includes(search) ||
                                item.sector.toLowerCase().includes(search)
                            );
                        }

                        return true;
                    })}
                    isLoading={isGlobalLoading}
                    onRemove={handleRemoveTicker}
                />
            )}
        </div>
    );
}

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
    type WatchlistItem,
    type Watchlist,
    watchlistKeys
} from '../../hooks/useWatchlist';
import { useQueryClient } from '@tanstack/react-query';
import { TickerLogo } from './TickerLogo';
import { WatchlistTableView, type TickerData } from './WatchlistTableView';
import { WatchlistGridView } from './WatchlistGridView';
import { calculateAiRating, calculateLiveUpside } from '../../lib/rating-utils';
import { FilterBar, type AnalyzerFilters } from '../analyzer/FilterBar';

// --- Types ---
interface TickerSearchResult {
    symbol: string;
    logo_url: string;
    exchange: string;
    name: string;
}

interface MarketSnapshot {
    ticker: { symbol: string; logo_url?: string; name?: string; id: string; industry?: string; sector?: string; currency?: string };
    latestPrice?: { close: number; prevClose?: number };
    fundamentals?: {
        sector?: string;
        pe_ttm?: number;
        market_cap?: number;
        dividend_yield?: number;
        beta?: number;
        consensus_rating?: string;
        fifty_two_week_high?: number;
        fifty_two_week_low?: number;
    };
    aiAnalysis?: {
        overall_score: number;
        financial_risk?: number;
        upside_percent: number;
        bear_price?: number | null;
        base_price?: number | null;
    };
    counts?: {
        news?: number;
        research?: number;
        analysts?: number;
        social?: number;
    };
    sparkline?: number[];
}

// Constant empty arrays
const EMPTY_SYMBOLS: string[] = [];
const EMPTY_ITEMS: WatchlistItem[] = [];
const EMPTY_TABLE_DATA: TickerData[] = [];

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

    // FilterBar State
    const [filters, setFilters] = useState<AnalyzerFilters>({
        risk: [],
        aiRating: [],
        upside: null,
        sector: [],
        overallScore: null,
    });

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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
            .filter((s: MarketSnapshot) => s && s.ticker && s.ticker.symbol && symbols.includes(s.ticker.symbol))
            .map((s: MarketSnapshot) => {
                const price = Number(s.latestPrice?.close || 0);
                const prevClose = Number(s.latestPrice?.prevClose || price);
                const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
                const fundamentals = s.fundamentals || {};

                // Use financial_risk instead of overall_score if available
                const riskVal = s.aiAnalysis?.financial_risk;
                const parsedRiskScore = typeof riskVal === 'number' ? riskVal : Number(riskVal);
                const safeRiskScore = Number.isFinite(parsedRiskScore) ? parsedRiskScore : null;

                // AI Rating Logic (Strict Financial Risk)
                let aiRating = '-';
                if (s.aiAnalysis && safeRiskScore !== null) {
                    // Fix: Use Standardized Upside for Rating Derivation too
                    const upside = calculateLiveUpside(
                        price,
                        s.aiAnalysis.base_price,
                        s.aiAnalysis.upside_percent
                    );

                    let downside = 0;
                    const bearPrice = s.aiAnalysis.bear_price;
                    if (typeof bearPrice === 'number' && price > 0) {
                        downside = ((bearPrice - price) / price) * 100;
                    } else {
                        downside = -(safeRiskScore * 5);
                    }

                    const { rating } = calculateAiRating({
                        risk: safeRiskScore,
                        upside,
                        downside,
                        consensus: s.fundamentals?.consensus_rating,
                        overallScore: s.aiAnalysis?.overall_score
                    });
                    aiRating = rating;
                } else {
                    aiRating = '-';
                }

                // Find corresponding watchlist item to get ID
                const watchlistItem = watchlistItems.find(i => i.ticker.symbol === s.ticker?.symbol);

                const bearPrice = s.aiAnalysis?.bear_price;
                const basePrice = s.aiAnalysis?.base_price;
                let potentialDownside: number | null = null;

                // Use Standardized Upside Calculation
                const potentialUpside = calculateLiveUpside(
                    price,
                    basePrice,
                    s.aiAnalysis?.upside_percent
                );

                if (typeof bearPrice === 'number' && price > 0) {
                    potentialDownside = ((bearPrice - price) / price) * 100;
                } else if (safeRiskScore !== null) {
                    if (safeRiskScore >= 8) potentialDownside = -100;
                    else if (safeRiskScore > 0) potentialDownside = -(safeRiskScore * 2.5);
                }

                return {
                    symbol: s.ticker?.symbol || 'UNKNOWN',
                    logo: s.ticker?.logo_url,
                    company: s.ticker?.name || 'Unknown',
                    sector: s.ticker?.industry || s.ticker?.sector || fundamentals.sector || 'Others',
                    price: price,
                    change: change,
                    pe: fundamentals.pe_ttm ?? null,
                    marketCap: fundamentals.market_cap ?? null,
                    fiftyTwoWeekHigh: fundamentals.fifty_two_week_high ?? null,
                    fiftyTwoWeekLow: fundamentals.fifty_two_week_low ?? null,
                    potentialUpside: potentialUpside,
                    potentialDownside: potentialDownside,
                    riskScore: safeRiskScore,
                    overallScore: s.aiAnalysis?.overall_score ?? null,
                    rating: fundamentals.consensus_rating || '-',
                    aiRating: aiRating,
                    newsCount: s.counts?.news || 0,
                    researchCount: s.counts?.research || 0,
                    analystCount: s.counts?.analysts || 0,
                    socialCount: s.counts?.social || 0,
                    itemId: watchlistItem?.id,
                    sparkline: s.sparkline,
                    currency: s.ticker?.currency || 'USD'
                };
            });
    }, [snapshotData, activeWatchlist, watchlistItems, symbols]);

    const filteredTableData = useMemo(() => {
        return tableData.filter(item => {
            // 1. Sector
            if (filters.sector.length > 0 && !filters.sector.includes(item.sector)) {
                return false;
            }

            // 2. Risk
            if (filters.risk.length > 0 && item.riskScore !== null) {
                const matchesRisk = filters.risk.some(range => {
                    if (range === 'Low (0-3.5)') return item.riskScore! <= 3.5;
                    if (range === 'Medium (3.5-6.5)') return item.riskScore! > 3.5 && item.riskScore! <= 6.5;
                    if (range === 'High (6.5+)') return item.riskScore! > 6.5;
                    return false;
                });
                if (!matchesRisk) return false;
            }

            // 3. AI Rating
            if (filters.aiRating.length > 0 && !filters.aiRating.includes(item.aiRating)) {
                return false;
            }

            // 4. Upside
            if (filters.upside && item.potentialUpside !== null) {
                if (filters.upside === '> 10%' && item.potentialUpside <= 10) return false;
                if (filters.upside === '> 20%' && item.potentialUpside <= 20) return false;
                if (filters.upside === '> 50%' && item.potentialUpside <= 50) return false;
            }

            // 5. Overall Score (Risk/Reward)
            if (filters.overallScore && item.overallScore !== null) {
                if (filters.overallScore === '> 5.0' && item.overallScore <= 5.0) return false;
                if (filters.overallScore === '> 7.5' && item.overallScore <= 7.5) return false;
                if (filters.overallScore === '> 8.5' && item.overallScore <= 8.5) return false;
            }

            return true;
        });
    }, [tableData, filters]);


    const isGlobalLoading = isLoadingWatchlists || (isLoadingSnapshots && symbols.length > 0);

    const handleFilterChange = (key: keyof AnalyzerFilters, value: AnalyzerFilters[keyof AnalyzerFilters]) => {
        setFilters(prev => ({
            ...prev,
            [key]: value,
        }));
    };

    const handleResetFilters = () => {
        setFilters({
            risk: [],
            aiRating: [],
            upside: null,
            sector: [],
            overallScore: null,
        });
    };

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

    const queryClient = useQueryClient();

    const selectSuggestion = useCallback((symbol: string) => {
        if (!activeWatchlistId) {
            showToast("No active watchlist", 'error');
            return;
        }

        // Get fresh data from cache to avoid stale props during optimistic updates
        const freshWatchlists = queryClient.getQueryData<Watchlist[]>(watchlistKeys.all) || [];
        const freshActiveList = freshWatchlists.find(w => w.id === activeWatchlistId);
        const freshItems = freshActiveList?.items || [];



        if (freshItems.some(i => i.ticker.symbol === symbol)) {
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
    }, [activeWatchlistId, addTickerMutation, showToast, queryClient]);

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

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-col gap-4 p-1">
                {/* Row 1: Header (Left) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

                    {/* LEFT GROUP: Watchlist Selector + Edit Actions + Add Stock */}
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

                            {activeWatchlistId && activeWatchlist?.name !== 'Favourites' && (
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

                        {/* Add Ticker (Compact next to name) */}
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Add ticker..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={addTickerMutation.isPending}
                                className="h-9 w-32 bg-transparent border border-border rounded-md pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground hover:bg-accent/10 transition-all bg-card/50"
                            />
                            {showSuggestions && (
                                <>
                                    <div className="fixed inset-0 z-40 bg-transparent" onClick={closeAllDropdowns} />
                                    <div ref={suggestionsRef} className="absolute top-full left-0 mt-2 w-[300px] bg-[#09090b] !bg-opacity-100 border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-1 !opacity-100">
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
                </div>

                {/* INTEGRATED TOOLBAR (Search Table + Filters + View Mode) */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-card/30 p-2 rounded-lg border border-border/50">
                    <div className="flex flex-wrap flex-1 items-center gap-3">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                            <input
                                type="text"
                                placeholder="Filter watchlist..."
                                value={globalFilter ?? ''}
                                onChange={(e) => setGlobalFilter(e.target.value)}
                                className="h-10 w-full bg-background/50 border border-input rounded-md pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                            />
                        </div>

                        <FilterBar
                            filters={filters}
                            onFilterChange={handleFilterChange}
                            onReset={handleResetFilters}
                        />
                    </div>

                    {/* View Switcher */}
                    <div className="flex items-center space-x-1 border border-border rounded-md p-1 bg-card shrink-0 h-10">
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

            {/* Content Area */}
            {
                viewMode === 'table' ? (
                    <WatchlistTableView
                        data={filteredTableData}
                        isLoading={isGlobalLoading}
                        onRemove={activeWatchlist?.name === 'Favourites' ? undefined : handleRemoveTicker}
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
                        data={filteredTableData.filter(item => {
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
                        onRemove={activeWatchlist?.name === 'Favourites' ? undefined : handleRemoveTicker}
                    />
                )
            }
        </div >
    );
}

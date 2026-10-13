import { useState, useRef, useMemo, useCallback, useDeferredValue, useId } from 'react';
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
    List,
    Loader2,
    Star
} from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { cn } from '../../lib/api';
import { useToast } from '../ui/toast';
import { useConfirm, usePrompt } from '../ui/confirm';
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
import { deriveVerdict } from '../../lib/ticker-metrics';
import { FilterBar, type AnalyzerFilters } from '../analyzer/FilterBar';
import { FavoriteStar } from '../watchlist/FavoriteStar';
import { EmptyState, LoadError } from '../ui/empty-state';
import { Input } from '../ui/input';
import { Skeleton } from '../ui/skeleton';
import { SegmentedControl } from '../ui/segmented';
import { TickerRowList, TickerRowListSkeleton } from './TickerListRow';
import { useCompactLayout } from '../../hooks/useMediaQuery';

// --- Types ---
interface TickerSearchResult {
    symbol: string;
    logo_url: string;
    exchange: string;
    name: string;
}

interface MarketSnapshot {
    ticker: {
        symbol: string; logo_url?: string; name?: string; id: string; industry?: string; sector?: string; currency?: string;
        news_sentiment?: string | null; news_impact_score?: number | null;
    };
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
        revenue_ttm?: number | string | null;
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

// Rows of the list-switcher menu: 44px on touch, 36px with a mouse; tonal hover.
const MENU_ITEM =
    'flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none lg:min-h-9';

// Constant empty arrays
const EMPTY_SYMBOLS: string[] = [];
const EMPTY_WATCHLISTS: Watchlist[] = [];
const EMPTY_ITEMS: WatchlistItem[] = [];
const EMPTY_TABLE_DATA: TickerData[] = [];

export function WatchlistTable() {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const promptText = usePrompt();

    // -- Query Hooks --
    const watchlistsQuery = useWatchlists();
    // A stable empty default: a fresh [] each render would re-run every memo below.
    const watchlists = watchlistsQuery.data ?? EMPTY_WATCHLISTS;
    const isLoadingWatchlists = watchlistsQuery.isLoading;

    // Local State
    const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(null);
    // "table" is the default everywhere; below `lg` it renders as a list of
    // compact rows.
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const compact = useCompactLayout();
    // Phones: rows are plain links; "Edit" reveals a remove control per row.
    const [isEditing, setIsEditing] = useState(false);

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
        region: [],
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
    const addFieldRef = useRef<HTMLDivElement>(null);
    const suggestionsId = useId();
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
    const snapshotsQuery = useMarketSnapshots(symbols);
    const snapshotData = snapshotsQuery.data;
    const isLoadingSnapshots = snapshotsQuery.isLoading;
    // Failed with nothing to show: say so (a failed refresh keeps the old rows).
    const loadFailed = (watchlistsQuery.isError && !watchlistsQuery.data) || (snapshotsQuery.isError && !snapshotsQuery.data);
    const retryLoad = () => { void watchlistsQuery.refetch(); if (symbols.length > 0) void snapshotsQuery.refetch(); };

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

                const revenueTTM = Number(fundamentals.revenue_ttm ?? 0) || null;
                // Upside, downside and rating come from the one shared derivation,
                // fed with the same scenario targets the other views use.
                const verdict = deriveVerdict({
                    price,
                    risk: s.aiAnalysis ? safeRiskScore : null,
                    basePrice: s.aiAnalysis?.base_price,
                    bearPrice: s.aiAnalysis?.bear_price,
                    upsidePercent: s.aiAnalysis?.upside_percent,
                    overallScore: s.aiAnalysis?.overall_score,
                    consensus: fundamentals.consensus_rating,
                    pe: fundamentals.pe_ttm,
                    newsSentiment: s.ticker?.news_sentiment,
                    newsImpact: s.ticker?.news_impact_score,
                    fiftyTwoWeekHigh: fundamentals.fifty_two_week_high,
                    fiftyTwoWeekLow: fundamentals.fifty_two_week_low,
                    revenueTTM,
                });

                // Find corresponding watchlist item to get ID
                const watchlistItem = watchlistItems.find(i => i.ticker.symbol === s.ticker?.symbol);

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
                    potentialUpside: verdict.upside,
                    potentialDownside: verdict.downside,
                    downsideEstimated: verdict.downsideEstimated,
                    riskScore: safeRiskScore,
                    overallScore: s.aiAnalysis?.overall_score ?? null,
                    rating: fundamentals.consensus_rating || '-',
                    aiRating: verdict.rating,
                    aiRatingVariant: verdict.variant,
                    newsSentiment: s.ticker?.news_sentiment ?? null,
                    newsImpact: s.ticker?.news_impact_score ?? null,
                    revenueTTM,
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
            region: [],
        });
    };

    // -- Handlers --
    const handleCreateList = useCallback(async () => {
        const name = await promptText({
            title: 'New watchlist',
            label: 'Name',
            defaultValue: 'New Watchlist',
            confirmLabel: 'Create watchlist',
            maxLength: 60,
        });
        if (name) {
            createListMutation.mutate(name, {
                onSuccess: (newList) => {
                    setSelectedWatchlistId(newList.id);
                    showToast("Watchlist created", 'success');
                }
            });
        }
    }, [createListMutation, showToast, promptText]);

    const handleRenameList = useCallback(async () => {
        if (!activeWatchlistId || !activeWatchlist) return;
        const newName = await promptText({
            title: 'Rename watchlist',
            label: 'Name',
            defaultValue: activeWatchlist.name,
            confirmLabel: 'Rename',
            maxLength: 60,
        });
        if (newName && newName !== activeWatchlist.name) {
            renameListMutation.mutate({ id: activeWatchlistId, name: newName }, {
                onSuccess: () => showToast("Watchlist renamed", 'success')
            });
        }
    }, [activeWatchlistId, activeWatchlist, renameListMutation, showToast, promptText]);

    const handleDeleteList = useCallback(async (watchlistId: string) => {
        const list = watchlists.find((w) => w.id === watchlistId);
        if (!list) return;
        const confirmed = await confirm({
            title: `Delete watchlist “${list.name}”?`,
            description: 'The list and the tickers saved in it will be removed. This can’t be undone.',
            confirmLabel: 'Delete watchlist',
            destructive: true,
        });
        if (!confirmed) return;
        deleteListMutation.mutate(watchlistId, {
            onSuccess: () => showToast("Watchlist deleted", 'success')
        });
    }, [watchlists, deleteListMutation, showToast, confirm]);

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

    const removeHandler = activeWatchlist?.name === 'Favourites' ? undefined : handleRemoveTicker;
    const search = (globalFilter ?? '').trim().toLowerCase();
    const visibleData = search
        ? filteredTableData.filter((item) =>
            item.symbol.toLowerCase().includes(search) ||
            item.company.toLowerCase().includes(search) ||
            item.sector.toLowerCase().includes(search))
        : filteredTableData;

    // Two different kinds of "nothing to show": a list with no tickers yet
    // (offer the add action) versus filters that hide everything (offer a reset).
    const listIsEmpty = !loadFailed && !isGlobalLoading && !!activeWatchlist && watchlistItems.length === 0;
    const nothingMatches = !loadFailed && !isGlobalLoading && !listIsEmpty && tableData.length > 0 && visibleData.length === 0;

    const suggestions = searchTickerQuery.data ?? [];
    const suggestionsOpen = showSuggestions && searchTerm.trim().length > 0;
    const isSearching = searchTickerQuery.isFetching || deferredSearchTerm !== searchTerm;

    return (
        <div className="w-full space-y-3 lg:space-y-4">
            <div className="flex flex-col gap-3">
                {/* Title row: the list name is the page title and the list switcher;
                    list actions live in its menu, "Add ticker" sits beside it. */}
                <div className="flex items-center justify-between gap-3 lg:justify-start lg:gap-4">
                    <h1 className="flex min-w-0 flex-1 text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-[1.75rem] lg:flex-none">
                        <Popover open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    title="Switch or manage watchlists"
                                    className="group -ml-2 flex min-h-11 min-w-0 items-center gap-1.5 rounded-md px-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted lg:min-h-10"
                                >
                                    {isLoadingWatchlists ? (
                                        <Skeleton className="h-6 w-32" />
                                    ) : (
                                        <span className="truncate">{activeWatchlist?.name || 'Watchlist'}</span>
                                    )}
                                    <ChevronDown
                                        className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                                        aria-hidden
                                    />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent
                                align="start"
                                sideOffset={6}
                                collisionPadding={12}
                                aria-label="Watchlists"
                                className="w-[min(18rem,calc(100vw-1.5rem))] p-1.5 text-sm font-normal tracking-normal"
                            >
                                <p className="label-micro px-2.5 pb-1.5 pt-1">Your lists</p>
                                <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                                    {watchlists.map((list) => {
                                        const current = activeWatchlistId === list.id;
                                        return (
                                            <li key={list.id}>
                                                <button
                                                    type="button"
                                                    aria-current={current ? 'true' : undefined}
                                                    onClick={() => {
                                                        setSelectedWatchlistId(list.id);
                                                        setIsDropdownOpen(false);
                                                    }}
                                                    className={cn(MENU_ITEM, current && 'bg-raised font-medium')}
                                                >
                                                    <span className="min-w-0 flex-1 truncate">{list.name}</span>
                                                    <span className="num text-xs text-muted-foreground">{list.items?.length ?? 0}</span>
                                                    <Check className={cn('h-4 w-4 shrink-0 text-signal', !current && 'invisible')} aria-hidden />
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                                <div className="mt-2 space-y-0.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsDropdownOpen(false);
                                            handleCreateList();
                                        }}
                                        className={MENU_ITEM}
                                    >
                                        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                        New watchlist
                                    </button>
                                    {activeWatchlistId && activeWatchlist?.name !== 'Favourites' && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsDropdownOpen(false);
                                                    handleRenameList();
                                                }}
                                                className={MENU_ITEM}
                                            >
                                                <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                                Rename watchlist
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsDropdownOpen(false);
                                                    handleDeleteList(activeWatchlistId);
                                                }}
                                                className={cn(MENU_ITEM, 'text-red-400')}
                                            >
                                                <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                                                Delete watchlist
                                            </button>
                                        </>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </h1>

                    {/* Add ticker: a combobox. Focus stays in the field; the list is
                        a popover so it can never run off the screen. */}
                    <Popover open={suggestionsOpen} onOpenChange={setShowSuggestions}>
                        <PopoverAnchor asChild>
                            <div ref={addFieldRef} className="relative w-36 shrink-0 min-[380px]:w-40 lg:w-56">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    role="combobox"
                                    aria-label="Add ticker to this watchlist"
                                    aria-expanded={suggestionsOpen}
                                    aria-controls={suggestionsOpen ? suggestionsId : undefined}
                                    aria-autocomplete="list"
                                    aria-activedescendant={suggestionsOpen && selectedIndex >= 0 ? `${suggestionsId}-${selectedIndex}` : undefined}
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    spellCheck={false}
                                    placeholder="Add ticker..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setSelectedIndex(-1);
                                        setShowSuggestions(e.target.value.trim().length > 0);
                                    }}
                                    onFocus={() => setShowSuggestions(searchTerm.trim().length > 0)}
                                    onKeyDown={handleKeyDown}
                                    disabled={addTickerMutation.isPending}
                                    className="h-11 w-full rounded-md bg-muted pl-9 pr-3 text-sm placeholder:text-muted-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 lg:h-9"
                                />
                            </div>
                        </PopoverAnchor>
                        <PopoverContent
                            align="end"
                            sideOffset={6}
                            collisionPadding={12}
                            aria-label="Ticker suggestions"
                            onOpenAutoFocus={(e) => e.preventDefault()}
                            onCloseAutoFocus={(e) => e.preventDefault()}
                            onInteractOutside={(e) => {
                                // Clicking back into the field must not dismiss its own list.
                                if (addFieldRef.current?.contains(e.target as Node)) e.preventDefault();
                            }}
                            className="w-[min(20rem,calc(100vw-1.5rem))] p-1.5"
                        >
                            {suggestions.length > 0 ? (
                                <ul id={suggestionsId} role="listbox" aria-label="Matching tickers" className="max-h-[min(20rem,50dvh)] space-y-0.5 overflow-y-auto">
                                    {suggestions.map((s: TickerSearchResult, idx: number) => (
                                        <li
                                            key={s.symbol}
                                            id={`${suggestionsId}-${idx}`}
                                            role="option"
                                            aria-selected={selectedIndex === idx}
                                            // Keep focus in the field while picking with the mouse.
                                            onMouseDown={(e) => e.preventDefault()}
                                            onMouseEnter={() => setSelectedIndex(idx)}
                                            onClick={() => selectSuggestion(s.symbol)}
                                            className={cn(
                                                'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 transition-colors',
                                                selectedIndex === idx ? 'bg-muted' : 'hover:bg-muted',
                                            )}
                                        >
                                            <TickerLogo url={s.logo_url} symbol={s.symbol} className="h-8 w-8 shrink-0" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-bold text-foreground">{s.symbol}</span>
                                                <span className="block truncate text-xs text-muted-foreground">{s.name}</span>
                                            </span>
                                            {s.exchange && (
                                                <span className="label-micro max-w-[7rem] shrink-0 truncate">{s.exchange}</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p id={suggestionsId} role="status" className="flex items-center gap-2 px-2.5 py-3 text-sm text-muted-foreground">
                                    {isSearching ? (
                                        <>
                                            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                                            Searching…
                                        </>
                                    ) : (
                                        <span>
                                            No ticker matches “{searchTerm.trim()}”. Press Enter to add it by symbol.
                                        </span>
                                    )}
                                </p>
                            )}
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Toolbar: filter field and view switch on one line, filter chips
                    on the next (one scrolling row on phones). */}
                <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-3', (listIsEmpty || loadFailed) && 'hidden')}>
                    <div className="relative order-1 min-w-0 flex-1 lg:w-56 lg:flex-none xl:w-72">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                            type="search"
                            aria-label="Filter watchlist"
                            placeholder="Filter watchlist..."
                            value={globalFilter ?? ''}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            className="h-11 pl-9 lg:h-9"
                        />
                    </div>

                    <SegmentedControl
                        className="order-2 shrink-0 lg:order-3"
                        label="View"
                        size="sm"
                        value={viewMode}
                        onChange={setViewMode}
                        options={[
                            { value: 'table', label: <List size={16} aria-hidden />, ariaLabel: compact ? 'List view' : 'Table view' },
                            { value: 'grid', label: <LayoutGrid size={16} aria-hidden />, ariaLabel: 'Card view' },
                        ]}
                    />

                    <div className="order-3 w-full min-w-0 lg:order-2 lg:w-auto lg:flex-1">
                        <FilterBar
                            filters={filters}
                            onFilterChange={handleFilterChange}
                            onReset={handleResetFilters}
                        />
                    </div>
                </div>
            </div>

            {/* Content. Below `lg` the "table" is a list of mini-card rows. */}
            {loadFailed ? (
                <LoadError what="your watchlist" onRetry={retryLoad} className="rounded-md bg-card py-14" />
            ) : listIsEmpty ? (
                <EmptyState
                    className="rounded-md bg-card py-14"
                    icon={<Star className="h-5 w-5" />}
                    title="This watchlist is empty"
                    description="Add the tickers you want to follow — search by symbol or company name."
                    action={
                        <Button onClick={() => searchInputRef.current?.focus()} className="h-11 lg:h-10">
                            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                            Add a ticker
                        </Button>
                    }
                />
            ) : nothingMatches ? (
                <EmptyState
                    className="rounded-md bg-card py-14"
                    icon={<Search className="h-5 w-5" />}
                    title="No tickers match"
                    description="Nothing in this list fits the search and filters you have set."
                    action={
                        <Button
                            variant="outline"
                            className="h-11 lg:h-10"
                            onClick={() => {
                                setGlobalFilter('');
                                handleResetFilters();
                            }}
                        >
                            Clear search and filters
                        </Button>
                    }
                />
            ) : viewMode === 'grid' ? (
                <WatchlistGridView
                    data={visibleData}
                    isLoading={isGlobalLoading}
                    onRemove={removeHandler}
                />
            ) : compact ? (
                isGlobalLoading ? (
                    <TickerRowListSkeleton rows={6} />
                ) : (
                    <div className="space-y-1.5">
                        {/* One slim line: the count and the Edit toggle. The button is
                            28px tall to keep the list close, with a 44px hit area. */}
                        <div className="flex h-7 items-center justify-between">
                            <p className="num text-xs text-muted-foreground">
                                {visibleData.length} {visibleData.length === 1 ? 'ticker' : 'tickers'}
                            </p>
                            <button
                                type="button"
                                aria-pressed={isEditing}
                                onClick={() => setIsEditing((v) => !v)}
                                className={cn(
                                    "relative -mr-2 flex h-7 min-w-11 items-center justify-center rounded-md px-2 text-[13px] font-medium transition-colors before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    isEditing ? 'bg-signal/10 text-signal' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                                )}
                            >
                                {isEditing ? 'Done' : 'Edit'}
                            </button>
                        </div>
                        <TickerRowList
                            items={visibleData}
                            renderAction={isEditing ? (item) => (
                                removeHandler ? (
                                    <button
                                        type="button"
                                        aria-label={`Remove ${item.symbol} from watchlist`}
                                        onClick={() => removeHandler(item.itemId || '', item.symbol)}
                                        className="flex w-12 shrink-0 items-center justify-center text-red-400 transition-colors hover:bg-muted active:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                    >
                                        <Trash2 className="h-4 w-4" aria-hidden />
                                    </button>
                                ) : (
                                    <FavoriteStar symbol={item.symbol} size={18} className="flex w-12 shrink-0 items-center justify-center" />
                                )
                            ) : undefined}
                        />
                    </div>
                )
            ) : (
                <WatchlistTableView
                    data={filteredTableData}
                    isLoading={isGlobalLoading}
                    onRemove={removeHandler}
                    sorting={sorting}
                    setSorting={setSorting}
                    columnFilters={columnFilters}
                    setColumnFilters={setColumnFilters}
                    globalFilter={globalFilter}
                    setGlobalFilter={setGlobalFilter}
                    tableRef={tableInstanceRef}
                />
            )}
        </div >
    );
}

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
    useReactTable, 
    getCoreRowModel, 
    getSortedRowModel, 
    flexRender, 
    createColumnHelper
} from '@tanstack/react-table';
import type { SortingState } from '@tanstack/react-table';
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
    Check
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useToast } from '../ui/toast';

// --- Types ---
interface WatchlistTicker {
    id: string;
    symbol: string;
}

interface WatchlistItem {
    id: string;
    ticker: WatchlistTicker;
    addedAt: string;
}

interface WatchlistData {
    id: string;
    name: string;
    items: WatchlistItem[];
}

interface TickerData {
    symbol: string;
    logo?: string;
    company: string;
    sector: string;
    price: number;
    change: number;
    pe: number | null;
    marketCap: string | null;
    divYield: string | null;
    beta: number | null;
    rating: string;
    growthRank: number;
}

interface Suggestion {
    symbol: string;
    name: string;
    exchange: string;
    type: string;
    logo_url?: string;
}

// --- Logo Component ---
const TickerLogo = ({ url, symbol, className }: { url?: string, symbol: string, className?: string }) => {
    const [error, setError] = useState(false);
    
    if (!url || error) {
        return (
            <div className={cn("w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground", className)}>
                {symbol.slice(0, 2)}
            </div>
        );
    }

    return (
        <img 
            src={url} 
            alt={symbol} 
            className={cn("w-8 h-8 rounded-full object-contain bg-white", className)}
            onError={() => setError(true)}
        />
    );
};

export function WatchlistTable() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [watchlists, setWatchlists] = useState<WatchlistData[]>([]);
    const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);

    const [data, setData] = useState<TickerData[]>([]);
    const [loading, setLoading] = useState(false);
    const [sorting, setSorting] = useState<SortingState>([]);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [adding, setAdding] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const initializationRef = useRef(false);



    const formatMarketCap = useCallback((value: number) => {
        if (!value) return '-';
        if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
        return `$${value.toLocaleString()}`;
    }, []);

    // 1. Fetch Watchlists on Mount
    const fetchWatchlists = useCallback(async () => {
        try {
            const { data: lists } = await api.get('/watchlists');
            if (lists.length > 0) {
                setWatchlists(lists);
                // If no active list, set first one
                setActiveWatchlistId(prev => prev || lists[0].id);
            } else {
                if (initializationRef.current) return;
                initializationRef.current = true;
                // Create default... (existing logic)
                try {
                    const createRes = await api.post('/watchlists', { name: 'My First Watchlist' });
                    setWatchlists([createRes.data]);
                    setActiveWatchlistId(createRes.data.id);
                } catch { setData([]); }
            }
        } catch {
            console.error("Failed to fetch watchlists");
        }
    }, []);

    // 2. Fetch Items when Active ID changes
    const fetchItems = useCallback(async (watchlistId: string | null) => {
        if (!watchlistId) return;
        setLoading(true);
        try {
            const { data: lists } = await api.get('/watchlists');
            setWatchlists(lists);

            const current = lists.find((w: WatchlistData) => w.id === watchlistId);
            if (!current) return;

            const items = current.items || [];
            // Watchlist item type is nested
            interface WatchlistItem {
                ticker: { id: string; symbol: string };
            }

            // Snapshot response shape
            interface SnapshotResponse {
                ticker: {
                    symbol: string;
                    name: string;
                    logo_url?: string;
                };
                latestPrice?: {
                    close: number;
                    prevClose?: number;
                };
                fundamentals?: {
                    sector?: string;
                    pe_ttm?: number;
                    market_cap?: number;
                    dividend_yield?: number;
                    beta?: number;
                };
            }

            const symbols = items.map((item: WatchlistItem) => item.ticker.symbol);
            let results: SnapshotResponse[] = [];
            
            if (symbols.length > 0) {
                try {
                    const { data } = await api.post<SnapshotResponse[]>('/market-data/snapshots', { symbols });
                    results = data || [];
                } catch (e) {
                    console.error("Bulk snapshot fetch failed", e);
                }
            }

            const mappedData = results
                .filter((s) => s && s.ticker) // Filter out errors or nulls
                .map((s) => {
                    const price = Number(s.latestPrice?.close || 0);
                    const prevClose = Number(s.latestPrice?.prevClose || price);
                    const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
                    const fundamentals = s.fundamentals || {};
                    
                    return {
                        symbol: s.ticker.symbol,
                        logo: s.ticker.logo_url,
                        company: s.ticker.name || 'Unknown',
                        sector: fundamentals.sector || 'N/A',
                        price: price,
                        change: change,
                        pe: fundamentals.pe_ttm ?? null,
                        marketCap: formatMarketCap(fundamentals.market_cap || 0),
                        divYield: fundamentals.dividend_yield ? Number(fundamentals.dividend_yield).toFixed(2) + '%' : '-',
                        beta: fundamentals.beta ?? null,
                        rating: 'Hold',
                        growthRank: 5
                    };
                });
            setData(mappedData);

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [formatMarketCap]);

     
    useEffect(() => {
        fetchWatchlists();
    }, [fetchWatchlists]);

     
    useEffect(() => {
        fetchItems(activeWatchlistId);
    }, [fetchItems, activeWatchlistId]);

    const handleRemoveTicker = useCallback(async (symbol: string) => {
        if (!activeWatchlistId) return;
        
        // Find the ticker ID from the current watchlist items
        const currentList = watchlists.find(w => w.id === activeWatchlistId);
        const item = currentList?.items.find(i => i.ticker.symbol === symbol);
        
        if (!item) {
            showToast("Could not find ticker to remove", 'error');
            return;
        }

        try {
            await api.delete(`/watchlists/${activeWatchlistId}/items/${item.ticker.id}`);
            showToast(`${symbol} removed from watchlist`, 'success');
            await fetchItems(activeWatchlistId);
        } catch (err) {
            console.error("Failed to remove ticker", err);
            showToast("Failed to remove ticker", 'error');
        }
    }, [activeWatchlistId, watchlists, showToast, fetchItems]); 

    // Debounced search for autocomplete
    useEffect(() => {
        if (searchTerm.trim().length < 1) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const { data: results } = await api.get(`/tickers?search=${searchTerm}`);
                setSuggestions(results || []);
                setShowSuggestions(results && results.length > 0);
                setSelectedIndex(-1);
            } catch (err) {
                console.error("Failed to fetch suggestions", err);
            }
        }, 200); // 200ms debounce

        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                suggestionsRef.current && 
                !suggestionsRef.current.contains(event.target as Node) &&
                searchInputRef.current &&
                !searchInputRef.current.contains(event.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectSuggestion = async (symbol: string) => {
        setSearchTerm(symbol);
        setShowSuggestions(false);
        
        if (!activeWatchlistId) {
            showToast("No active watchlist found. Please create one first.", 'error');
            return;
        }

        setAdding(true);
        try {
            await api.post(`/watchlists/${activeWatchlistId}/items`, { symbol });
            showToast(`${symbol} added to watchlist`, 'success');
            setSearchTerm('');
            await fetchItems(activeWatchlistId);
        } catch (err: unknown) {
            console.error("Failed to add ticker", err);
            if (err && typeof err === 'object' && 'response' in err) {
                const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
                if (axiosErr.response?.status === 409) {
                    showToast(`${symbol} is already in this watchlist`, 'error');
                } else {
                    showToast(axiosErr.response?.data?.message || "Failed to add ticker", 'error');
                }
            } else {
                showToast("Failed to add ticker. It might not exist.", 'error');
            }
        } finally {
            setAdding(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showSuggestions || suggestions.length === 0) {
            // Original enter handler
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
    };

    const columnHelper = createColumnHelper<TickerData>();

    const columns = useMemo(() => [
        columnHelper.accessor('symbol', {
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                        className="p-0 hover:bg-transparent"
                    >
                        Symbol
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: (info) => {
                return (
                        <div className="flex items-center gap-3" onClick={() => navigate(`/dashboard/ticker/${info.getValue()}`)}>
                        <TickerLogo key={info.getValue()} url={info.row.original.logo} symbol={info.getValue()} />
                        <span className="text-primary font-semibold cursor-pointer hover:underline">{info.getValue()}</span>
                    </div>
                );
            },
        }),
        columnHelper.accessor('company', {
            header: 'Company',
            cell: (info) => <span className="text-foreground font-medium truncate max-w-[200px] block" title={info.getValue()}>{info.getValue()}</span>,
        }),
        columnHelper.accessor('sector', {
            header: 'Sector',
            cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
        }),
        columnHelper.accessor('price', {
            header: 'Price',
            cell: (info) => <span className="text-foreground font-mono">${info.getValue().toFixed(2)}</span>,
        }),
        columnHelper.accessor('change', {
            header: 'Change %',
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
            header: 'P/E',
            cell: (info) => <span className="text-foreground">{info.getValue() ? Number(info.getValue()).toFixed(2) : '-'}</span>,
        }),
        columnHelper.accessor('marketCap', {
            header: 'Market Cap',
            cell: (info) => <span className="text-foreground">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('divYield', {
            header: 'Div Yield %',
            cell: (info) => <span className="text-foreground">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('beta', {
            header: 'Beta',
            cell: (info) => <span className="text-foreground">{info.getValue() ? Number(info.getValue()).toFixed(2) : '-'}</span>,
        }),
        columnHelper.accessor('rating', {
            header: 'Rating',
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
            header: 'Growth Rank',
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
                        onClick={() => handleRemoveTicker(info.row.original.symbol)}
                        title="Remove from watchlist"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            ),
        }),
    ], [navigate, handleRemoveTicker, columnHelper]);

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        state: {
            sorting,
        },
    });

    const handleRenameList = async () => {
        if (!activeWatchlistId) return;
        const currentList = watchlists.find(w => w.id === activeWatchlistId);
        const newName = prompt("Rename watchlist:", currentList?.name);
        if (newName && newName !== currentList?.name) {
            try {
                await api.patch(`/watchlists/${activeWatchlistId}`, { name: newName });
                await fetchWatchlists(); // Refresh names
            } catch (e) {
                console.error(e);
                alert("Failed to rename");
            }
        }
    };

    const handleCreateList = async () => {
        const name = prompt("Enter new watchlist name:", "New Watchlist");
        if (name) {
            try {
                const res = await api.post('/watchlists', { name });
                await fetchWatchlists();
                setActiveWatchlistId(res.data.id);
            } catch (e) {
                console.error(e);
                alert("Failed to create watchlist");
            }
        }
    };

    const handleDeleteList = async (watchlistId: string) => {
        const list = watchlists.find((w) => w.id === watchlistId);
        if (!list) return;

        const confirmed = window.confirm(
            `Delete watchlist "${list.name}"? All tickers in it will be removed.`,
        );
        if (!confirmed) return;

        try {
            await api.delete(`/watchlists/${watchlistId}`);
            showToast('Watchlist deleted', 'success');

            const remaining = watchlists.filter((w) => w.id !== watchlistId);
            setWatchlists(remaining);

            if (activeWatchlistId === watchlistId) {
                const nextActive = remaining[0]?.id || null;
                setActiveWatchlistId(nextActive);
                if (!nextActive) {
                    setData([]);
                }
            }
        } catch (e) {
            console.error('Failed to delete watchlist', e);
            showToast('Failed to delete watchlist', 'error');
        }
    };

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const selectedWatchlist = watchlists.find(w => w.id === activeWatchlistId);

    return (
        <div className="space-y-4">
            {/* Header / Dropdown Control */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    {/* Custom Dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-sm font-medium text-foreground transition-colors border border-transparent focus:border-primary outline-none min-w-[150px] justify-between"
                        >
                            <span className="truncate max-w-[200px]">{selectedWatchlist?.name || "Select Watchlist"}</span>
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
                        <Button variant="ghost" size="icon" onClick={handleCreateList} className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Create New List">
                            <Plus className="w-4 h-4" />
                        </Button>
                        {activeWatchlistId && (
                            <>
                                <Button variant="ghost" size="icon" onClick={handleRenameList} className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Rename List">
                                    <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteList(activeWatchlistId)}
                                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                    title="Delete Watchlist"
                                    aria-label="Delete Watchlist"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        {adding ? (
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
                            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                            disabled={adding}
                            className="h-9 w-64 bg-card border border-border rounded-md pl-9 pr-4 text-sm text-foreground focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground disabled:opacity-50"
                        />
                        
                        {/* Autocomplete Dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div 
                                ref={suggestionsRef}
                                className="absolute top-full left-0 mt-1 w-80 bg-card border border-border rounded-md shadow-lg z-50 py-1 max-h-64 overflow-y-auto"
                            >
                                {suggestions.map((s, idx) => (
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
                        onClick={() => fetchItems(activeWatchlistId)}
                        disabled={loading}
                        className="h-9 gap-2 bg-card border-border text-foreground hover:bg-muted hover:text-foreground"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        Refresh Data
                    </Button>
                </div>
            </div>

            <div className="rounded-md border border-border bg-card overflow-hidden rgb-border">
                {loading && data.length === 0 ? (
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
                <div>Total: {data.length} items</div>
            </div>
        </div>
    );
}

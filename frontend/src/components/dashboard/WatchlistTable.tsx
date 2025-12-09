import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    createColumnHelper,
    getSortedRowModel,
    type SortingState,
} from '@tanstack/react-table';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect, useRef } from 'react';
import {
    ArrowUpDown,
    MoreVertical,
    Search,
    RefreshCw,
    ArrowUp,
    ArrowDown,
    TrendingUp,
    Loader2,
    Plus,
    Pencil,
    ChevronDown,
    Check,
    Trash2,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { useToast } from '../ui/toast';
import { api } from '../../lib/api';
import { cn } from '../../lib/api';

// Define the shape of our table data
interface StockData {
    symbol: string;
    logo?: string;
    company: string;
    sector: string;
    price: number;
    change: number; // Percentage
    pe: number | null;
    marketCap: string;
    divYield: string;
    beta: number | null;
    rating: string;
    growthRank: number;
}

const columnHelper = createColumnHelper<StockData>();

// Logo cache utilities - stores URL to avoid re-fetching on re-renders
const LOGO_CACHE_PREFIX = 'logo_cache_v2_';
const LOGO_CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

const getCachedLogo = (symbol: string): string | null => {
    try {
        const cached = localStorage.getItem(LOGO_CACHE_PREFIX + symbol);
        if (cached) {
            const { url, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < LOGO_CACHE_EXPIRY) {
                return url;
            }
            localStorage.removeItem(LOGO_CACHE_PREFIX + symbol); // Expired
        }
    } catch { /* ignore parse errors */ }
    return null;
};

const setCachedLogo = (symbol: string, url: string) => {
    try {
        localStorage.setItem(LOGO_CACHE_PREFIX + symbol, JSON.stringify({
            url,
            timestamp: Date.now()
        }));
    } catch { /* localStorage full or unavailable */ }
};

// Helper component for Logo with caching
export const TickerLogo = ({ url, symbol }: { url?: string, symbol: string }) => {
    // Use lazy initializer to check cache synchronously on first render
    const [imgSrc] = useState(() => {
        if (!url) return null;
        const cached = getCachedLogo(symbol);
        if (cached) return cached;
        if (url.includes('finnhub.io')) {
            // Use backend proxy to avoid CORS issues
            return `/api/proxy/image?url=${encodeURIComponent(url)}`;
        }
        // Cache the URL for future use (original check)
        setCachedLogo(symbol, url);
        return url;
    });
    
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    if (!url || !imgSrc || error) {
        return (
            <div className="w-8 h-8 rounded-full bg-[#27272a] flex items-center justify-center text-xs font-bold text-[#a1a1aa] shrink-0">
                {symbol.substring(0, 1)}
            </div>
        );
    }

    return (
        <div className="relative w-8 h-8 shrink-0">
            {!loaded && (
                <div className="absolute inset-0 rounded-full bg-[#27272a] animate-pulse" />
            )}
            <img
                src={imgSrc}
                alt="" // Decorative
                className={`w-full h-full rounded-full object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setLoaded(true)}
                onError={() => setError(true)}
            />
        </div>
    );
};

export function WatchlistTable() {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [data, setData] = useState<StockData[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [loading, setLoading] = useState(true);
    const initializationRef = useRef(false); // Ref to track if creation is in progress
    const { showToast } = useToast();
    
    // Autocomplete state
    interface TickerSuggestion {
        symbol: string;
        name: string;
        exchange?: string;
        logo_url?: string;
    }
    const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // Type for watchlist object from API
    interface WatchlistData {
        id: string;
        name: string;
        items: { ticker: { id: string; symbol: string } }[];
    }
    const [watchlists, setWatchlists] = useState<WatchlistData[]>([]);
    const navigate = useNavigate();

    // 1. Initial Load of Watchlists
    const fetchWatchlists = async () => {
        try {
            const { data: lists } = await api.get('/watchlists');
            if (lists && lists.length > 0) {
                setWatchlists(lists);
                // If no active, set first
                if (!activeWatchlistId) {
                    setActiveWatchlistId(lists[0].id);
                }
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
    };

    // 2. Fetch Items when Active ID changes
    const fetchItems = async () => {
        if (!activeWatchlistId) return;
        setLoading(true);
        try {
            // Re-fetch lists to ensure we have items (or fetch single watchlist if API supported it)
            // But getMyWatchlists returns full nested structure.
            // Efficient way: store full lists in state `watchlists` and just filter?
            // Yes, let's trust `watchlists` state if it's kept fresh.
            // Actually, we should pull fresh data.

            const { data: lists } = await api.get('/watchlists');
            setWatchlists(lists);

            const current = lists.find((w: WatchlistData) => w.id === activeWatchlistId);
            if (!current) return;

            const items = current.items || [];
            const promises = items.map((item: { ticker: { symbol: string } }) =>
                api.get(`/tickers/${item.ticker.symbol}/snapshot`).catch(() => null)
            );

            const results = await Promise.all(promises);
            // ... Mapping Logic ...
             
            const mappedData = results
                .filter((r): r is { data: Record<string, unknown> } => r !== null && typeof r === 'object' && 'data' in r)
                .map((r) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const s = r.data as any;
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
                        marketCap: formatMarketCap(fundamentals.market_cap),
                        divYield: fundamentals.dividend_yield ? (fundamentals.dividend_yield).toFixed(2) + '%' : '-',
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
    }

     
    useEffect(() => {
        fetchWatchlists();
    }, []);

     
    useEffect(() => {
        fetchItems();
    }, [activeWatchlistId]);

    const handleRemoveTicker = async (symbol: string) => {
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
            await fetchItems();
        } catch (err) {
            console.error("Failed to remove ticker", err);
            showToast("Failed to remove ticker", 'error');
        }
    };

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
            await fetchItems();
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

    const formatMarketCap = (val: number) => {
        if (!val) return '-';
        if (val > 1000) return `$${(val / 1000).toFixed(2)}B`;
        return `$${val.toFixed(2)}M`;
    };

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
                        <TickerLogo url={info.row.original.logo} symbol={info.getValue()} />
                        <span className="text-blue-500 font-semibold cursor-pointer hover:underline">{info.getValue()}</span>
                    </div>
                );
            },
        }),
        columnHelper.accessor('company', {
            header: 'Company',
            cell: (info) => <span className="text-[#fafafa] font-medium truncate max-w-[200px] block" title={info.getValue()}>{info.getValue()}</span>,
        }),
        columnHelper.accessor('sector', {
            header: 'Sector',
            cell: (info) => <span className="text-[#a1a1aa]">{info.getValue()}</span>,
        }),
        columnHelper.accessor('price', {
            header: 'Price',
            cell: (info) => <span className="text-[#fafafa] font-mono">${info.getValue().toFixed(2)}</span>,
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
            cell: (info) => <span className="text-[#fafafa]">{info.getValue() ? Number(info.getValue()).toFixed(2) : '-'}</span>,
        }),
        columnHelper.accessor('marketCap', {
            header: 'Market Cap',
            cell: (info) => <span className="text-[#fafafa]">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('divYield', {
            header: 'Div Yield %',
            cell: (info) => <span className="text-[#fafafa]">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('beta', {
            header: 'Beta',
            cell: (info) => <span className="text-[#fafafa]">{info.getValue() ? Number(info.getValue()).toFixed(2) : '-'}</span>,
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
                <div className="flex items-center text-[#fafafa]">
                    {info.getValue()}
                    <TrendingUp size={14} className="ml-1 text-green-500" />
                </div>
            )
        }),
        columnHelper.display({
            id: 'actions',
            cell: (info) => (
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[#a1a1aa] hover:text-white">
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-[#a1a1aa] hover:text-red-500"
                        onClick={() => handleRemoveTicker(info.row.original.symbol)}
                        title="Remove from watchlist"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            ),
        }),
    ], [navigate, handleRemoveTicker]);

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
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#27272a] hover:bg-[#3f3f46] text-sm font-medium text-[#fafafa] transition-colors border border-transparent focus:border-blue-500 outline-none min-w-[150px] justify-between"
                        >
                            <span className="truncate max-w-[200px]">{selectedWatchlist?.name || "Select Watchlist"}</span>
                            <ChevronDown className={`w-4 h-4 text-[#a1a1aa] transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1 w-64 bg-[#18181b] border border-[#27272a] rounded-md shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                                {watchlists.map(w => (
                                    <button
                                        key={w.id}
                                        onClick={() => {
                                            setActiveWatchlistId(w.id);
                                            setIsDropdownOpen(false);
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-[#fafafa] hover:bg-[#27272a] flex items-center justify-between group"
                                    >
                                        <span className={activeWatchlistId === w.id ? "font-semibold" : ""}>{w.name}</span>
                                        {activeWatchlistId === w.id && <Check className="w-3 h-3 text-blue-500" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={handleCreateList} className="h-8 w-8 text-[#a1a1aa] hover:text-white" title="Create New List">
                            <Plus className="w-4 h-4" />
                        </Button>
                        {activeWatchlistId && (
                            <Button variant="ghost" size="icon" onClick={handleRenameList} className="h-8 w-8 text-[#a1a1aa] hover:text-white" title="Rename List">
                                <Pencil className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        {adding ? (
                            <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-500 w-4 h-4 animate-spin" />
                        ) : (
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a1a1aa] w-4 h-4" />
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
                            className="h-9 w-64 bg-[#18181b] border border-[#27272a] rounded-md pl-9 pr-4 text-sm text-[#fafafa] focus:outline-none focus:border-blue-500 transition-colors placeholder:text-[#52525b] disabled:opacity-50"
                        />
                        
                        {/* Autocomplete Dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div 
                                ref={suggestionsRef}
                                className="absolute top-full left-0 mt-1 w-80 bg-[#18181b] border border-[#27272a] rounded-md shadow-lg z-50 py-1 max-h-64 overflow-y-auto"
                            >
                                {suggestions.map((s, idx) => (
                                    <button
                                        key={s.symbol}
                                        onClick={() => selectSuggestion(s.symbol)}
                                        className={cn(
                                            "w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[#27272a] transition-colors",
                                            selectedIndex === idx && "bg-[#27272a]"
                                        )}
                                    >
                                        {s.logo_url ? (
                                            <img src={s.logo_url} alt="" className="w-6 h-6 rounded-full object-contain" />
                                        ) : (
                                            <div className="w-6 h-6 rounded-full bg-[#27272a] flex items-center justify-center text-xs font-bold text-[#a1a1aa]">
                                                {s.symbol[0]}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-blue-400">{s.symbol}</span>
                                                <span className="text-xs text-[#52525b]">{s.exchange}</span>
                                            </div>
                                            <span className="text-xs text-[#a1a1aa] truncate block">{s.name}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchItems}
                        disabled={loading}
                        className="h-9 gap-2 bg-[#18181b] border-[#27272a] text-[#fafafa] hover:bg-[#27272a] hover:text-white"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        Refresh Data
                    </Button>
                </div>
            </div>

            <div className="rounded-md border border-[#27272a] bg-[#18181b] overflow-hidden">
                {loading && data.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-[#a1a1aa] gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        <p>Loading Market Data...</p>
                    </div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#18181b] border-b border-[#27272a] text-[#a1a1aa] font-medium">
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
                        <tbody className="[&_tr:last-child]:border-0 divide-y divide-[#27272a]">
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        data-state={row.getIsSelected() && "selected"}
                                        className="transition-colors hover:bg-[#27272a]/50"
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
                                    <td colSpan={columns.length} className="h-24 text-center text-[#a1a1aa]">
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

            <div className="flex items-center justify-between text-sm text-[#a1a1aa] px-2">
                <div>Total: {data.length} items</div>
            </div>
        </div>
    );
}

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    flexRender,
    createColumnHelper,
    type Column
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
import { useToast } from '../ui/toast';
import {
    useWatchlists,
    useCreateWatchlist,
    useDeleteWatchlist,
    useRenameWatchlist,
    useAddTickerToWatchlist,
    useRemoveTickerFromWatchlist,
    useMarketSnapshots,
    useTickerSearch
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
    marketCap: string | null;
    divYield: string | null;
    beta: number | null;
    rating: string;
    growthRank: number;
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
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    // Refs
    const searchInputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // -- Mutations --
    const createListMutation = useCreateWatchlist();
    const deleteListMutation = useDeleteWatchlist();
    const renameListMutation = useRenameWatchlist();
    const addTickerMutation = useAddTickerToWatchlist();
    const removeTickerMutation = useRemoveTickerFromWatchlist();
    const searchTickerQuery = useTickerSearch(searchTerm);

    // -- Derived State --
    // Auto-select first watchlist if none selected
    useEffect(() => {
        if (!activeWatchlistId && watchlists.length > 0) {
            setActiveWatchlistId(watchlists[0].id);
        } else if (activeWatchlistId && watchlists.length > 0) {
            // Verify active one still exists
            const exists = watchlists.find(w => w.id === activeWatchlistId);
            if (!exists) {
                setActiveWatchlistId(watchlists[0].id);
            }
        } else if (watchlists.length === 0 && !isLoadingWatchlists) {
            // Create default if completely empty? Or just let user create one.
            // We'll leave it empty for now, or could trigger a create.
        }
    }, [watchlists, activeWatchlistId, isLoadingWatchlists]);

    const activeWatchlist = useMemo(() =>
        watchlists.find(w => w.id === activeWatchlistId),
        [watchlists, activeWatchlistId]);

    const watchlistItems = useMemo(() => activeWatchlist?.items || [], [activeWatchlist]);
    const symbols = useMemo(() => watchlistItems.map(i => i.ticker.symbol), [watchlistItems]);

    // -- Market Data Query --
    const { data: snapshotData = [], isLoading: isLoadingSnapshots, refetch: refetchSnapshots, isRefetching } = useMarketSnapshots(symbols);

    // -- Map Data --
    const formatMarketCap = (value: number) => {
        if (!value) return '-';
        if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
        return `$${value.toLocaleString()}`;
    };

    const tableData = useMemo<TickerData[]>(() => {
        if (!activeWatchlist) return [];

        return snapshotData
            .filter((s: MarketSnapshot) => s && s.ticker)
            .map((s: MarketSnapshot) => {
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
    }, [snapshotData, activeWatchlist]);

    // -- Handlers --

    const handleCreateList = () => {
        const name = prompt("Enter new watchlist name:", "New Watchlist");
        if (name) {
            createListMutation.mutate(name, {
                onSuccess: (newList) => {
                    setActiveWatchlistId(newList.id);
                    showToast("Watchlist created", 'success');
                }
            });
        }
    };

    const handleRenameList = () => {
        if (!activeWatchlistId || !activeWatchlist) return;
        const newName = prompt("Rename watchlist:", activeWatchlist.name);
        if (newName && newName !== activeWatchlist.name) {
            renameListMutation.mutate({ id: activeWatchlistId, name: newName }, {
                onSuccess: () => showToast("Watchlist renamed", 'success')
            });
        }
    };

    const handleDeleteList = (watchlistId: string) => {
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
    };

    const handleRemoveTicker = useCallback((symbol: string) => {
        if (!activeWatchlistId || !activeWatchlist) return;
        const item = activeWatchlist.items.find(i => i.ticker.symbol === symbol);
        if (!item) return;

        removeTickerMutation.mutate({ watchlistId: activeWatchlistId, itemId: item.ticker.id }, {
            onSuccess: () => showToast(`${symbol} removed`, 'success'),
            onError: () => showToast("Failed to remove ticker", 'error')
        });
    }, [activeWatchlistId, activeWatchlist, removeTickerMutation, showToast]);

    const selectSuggestion = (symbol: string) => {
        if (!activeWatchlistId) {
            showToast("No active watchlist", 'error');
            return;
        }

        // Check duplicates
        if (activeWatchlist && activeWatchlist.items.some(i => i.ticker.symbol === symbol)) {
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
    };

    // -- Search & Dropdown Effects --
    useEffect(() => {
        if (searchTickerQuery.data && searchTickerQuery.data.length > 0) {
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    }, [searchTickerQuery.data]);

    // Close handlers
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) &&
                searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
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
    };


    // -- Table Setup --
    const columnHelper = createColumnHelper<TickerData>();

    const columns = useMemo(() => [
        columnHelper.accessor('symbol', {
            header: ({ column }) => <SortableHeader column={column} title="Symbol" />,
            cell: (info) => (
                <div className="flex items-center gap-3" onClick={() => navigate(`/dashboard/ticker/${info.getValue()}`)}>
                    <TickerLogo key={info.getValue()} url={info.row.original.logo} symbol={info.getValue()} />
                    <span className="text-primary font-semibold cursor-pointer hover:underline">{info.getValue()}</span>
                </div>
            ),
        }),
        columnHelper.accessor('company', {
            header: ({ column }) => <SortableHeader column={column} title="Company" />,
            cell: (info) => <span className="text-foreground font-medium truncate max-w-[200px] block" title={info.getValue()}>{info.getValue()}</span>,
        }),
        columnHelper.accessor('sector', {
            header: ({ column }) => <SortableHeader column={column} title="Sector" />,
            cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
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
            cell: (info) => <span className="text-foreground">{info.getValue() || '-'}</span>,
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
        data: tableData,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        state: { sorting },
    });

    const isGlobalLoading = isLoadingWatchlists || (isLoadingSnapshots && tableData.length === 0);

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

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
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

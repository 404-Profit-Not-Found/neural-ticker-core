import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    createColumnHelper,
    getSortedRowModel,
    type SortingState,
} from '@tanstack/react-table';
import { useState, useMemo, useEffect } from 'react';
import {
    ArrowUpDown,
    MoreVertical,
    Search,
    LayoutGrid,
    List,
    RefreshCw,
    ArrowUp,
    ArrowDown,
    TrendingUp,
    Loader2
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { api } from '../../lib/api';
import { cn } from '../../lib/api';

// Define the shape of our table data
interface StockData {
    symbol: string;
    company: string;
    sector: string;
    price: number;
    change: number; // Percentage
    pe: number;
    marketCap: string;
    divYield: string;
    beta: number;
    rating: string;
    growthRank: number;
}

const columnHelper = createColumnHelper<StockData>();

export function WatchlistTable() {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [data, setData] = useState<StockData[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Watchlists
            let { data: watchlists } = await api.get('/watchlists');

            if (!watchlists || watchlists.length === 0) {
                try {
                    console.log('No watchlists found. Creating default...');
                    const createRes = await api.post('/watchlists', { name: 'My First Watchlist' });
                    const newWatchlist = createRes.data;
                    watchlists = [newWatchlist];
                    console.log('Created default watchlist:', newWatchlist);
                } catch (createErr) {
                    console.error('Failed to create default watchlist', createErr);
                    setData([]);
                    return;
                }
            }

            // 2. Get items from primary watchlist (first one)
            const primaryList = watchlists[0];
            setActiveWatchlistId(primaryList.id);
            const items = primaryList.items || [];

            // 3. Fetch Snapshot for each ticker
            const promises = items.map((item: any) =>
                api.get(`/tickers/${item.ticker.symbol}/snapshot`).catch(() => null)
            );

            const results = await Promise.all(promises);

            // 4. Map Results
            const mappedData = results
                .filter((r: any) => r && r.data)
                .map((r: any) => {
                    const s = r.data;
                    const price = s.latestPrice?.close || 0;
                    const prevClose = s.latestPrice?.prevClose || price;
                    const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

                    return {
                        symbol: s.ticker.symbol,
                        company: s.ticker.name || 'Unknown',
                        sector: s.fundamentals?.sector || 'Technology',
                        price: price,
                        change: change,
                        pe: s.fundamentals?.pe_ratio || 0,
                        marketCap: formatMarketCap(s.fundamentals?.market_cap),
                        divYield: (s.fundamentals?.dividend_yield || 0).toFixed(2) + '%',
                        beta: s.fundamentals?.beta || 0,
                        rating: 'Hold',
                        growthRank: 5
                    };
                });

            setData(mappedData);

        } catch (err) {
            console.error('Failed to fetch watchlist data', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddTicker = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && searchTerm.trim()) {
            if (!activeWatchlistId) {
                alert("No active watchlist found. Please create one first (feature coming soon).");
                return;
            }

            setAdding(true);
            try {
                // 1. Ensure ticker exists (Backend handles this? Controller says addItem calls service.addTickerToWatchlist)
                // The backend controller usually handles finding/creating the ticker.
                await api.post(`/watchlists/${activeWatchlistId}/items`, { symbol: searchTerm.toUpperCase() });

                // 2. Clear and Refresh
                setSearchTerm('');
                await fetchData();
            } catch (err) {
                console.error("Failed to add ticker", err);
                alert("Failed to add ticker. It might not exist in our reliable sources.");
            } finally {
                setAdding(false);
            }
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

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
            cell: (info) => <span className="text-blue-500 font-semibold cursor-pointer hover:underline">{info.getValue()}</span>,
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
            cell: (info) => <span className="text-[#fafafa]">{info.getValue().toFixed(2)}</span>,
        }),
        columnHelper.accessor('marketCap', {
            header: 'Market Cap',
            cell: (info) => <span className="text-[#fafafa]">{info.getValue()}</span>,
        }),
        columnHelper.accessor('divYield', {
            header: 'Div Yield %',
            cell: (info) => <span className="text-[#fafafa]">{info.getValue()}</span>,
        }),
        columnHelper.accessor('beta', {
            header: 'Beta',
            cell: (info) => <span className="text-[#fafafa]">{info.getValue().toFixed(2)}</span>,
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
            cell: () => (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-[#a1a1aa] hover:text-white">
                    <MoreVertical className="h-4 w-4" />
                </Button>
            ),
        }),
    ], []);

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

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#fafafa]">My Watchlist</h2>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        {adding ? (
                            <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-500 w-4 h-4 animate-spin" />
                        ) : (
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a1a1aa] w-4 h-4" />
                        )}
                        <input
                            type="text"
                            placeholder="Add stock to watchlist..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleAddTicker}
                            disabled={adding}
                            className="h-9 w-64 bg-[#18181b] border border-[#27272a] rounded-md pl-9 pr-4 text-sm text-[#fafafa] focus:outline-none focus:border-blue-500 transition-colors placeholder:text-[#52525b] disabled:opacity-50"
                        />
                    </div>
                    <div className="flex items-center bg-[#18181b] border border-[#27272a] rounded-md p-1">
                        <button className="p-1.5 rounded bg-[#27272a] text-white">
                            <List size={16} />
                        </button>
                        <button className="p-1.5 rounded text-[#a1a1aa] hover:text-white transition-colors">
                            <LayoutGrid size={16} />
                        </button>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchData}
                        disabled={loading}
                        className="h-9 gap-2 bg-[#18181b] border-[#27272a] text-[#fafafa] hover:bg-[#27272a] hover:text-white"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        Refresh Data
                    </Button>
                </div>
            </div>

            <div className="rounded-md border border-[#27272a] bg-[#18181b]">
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

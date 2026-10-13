import { useState, useEffect, useCallback } from 'react';
import { AdminService } from '../../services/adminService';
import { Search, EyeOff, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import { useConfirm } from '../ui/confirm';
import { useCompactLayout } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/utils';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../ui/table';

interface HiddenTicker {
    id: string;
    symbol: string;
    name: string;
    exchange: string;
    is_hidden: boolean;
}

export function ShadowBanManager() {
    const [tickers, setTickers] = useState<HiddenTicker[]>([]);
    const [hiddenTickers, setHiddenTickers] = useState<HiddenTicker[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingHidden, setLoadingHidden] = useState(true);
    const [togglingSymbol, setTogglingSymbol] = useState<string | null>(null);
    // The text the last completed search was run for (null = none yet).
    const [searchedTerm, setSearchedTerm] = useState<string | null>(null);
    const compact = useCompactLayout();
    const confirm = useConfirm();

    const loadHiddenTickers = useCallback(async () => {
        setLoadingHidden(true);
        try {
            const data = await AdminService.getHiddenTickers();
            setHiddenTickers(data);
        } catch (error) {
            console.error('Failed to load hidden tickers:', error);
        } finally {
            setLoadingHidden(false);
        }
    }, []);

    useEffect(() => {
        void loadHiddenTickers();
    }, [loadHiddenTickers]);

    const handleSearch = async () => {
        if (!searchTerm.trim()) {
            setTickers([]);
            setSearchedTerm(null);
            return;
        }
        setLoading(true);
        try {
            const term = searchTerm.trim();
            const data = await AdminService.searchTickersAdmin(searchTerm);
            setTickers(data);
            setSearchedTerm(term);
        } catch (error) {
            console.error('Failed to search tickers:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleHidden = async (symbol: string, currentlyHidden: boolean) => {
        setTogglingSymbol(symbol);
        try {
            await AdminService.setTickerHidden(symbol, !currentlyHidden);
            // Update local state
            setTickers(prev =>
                prev.map(t => t.symbol === symbol ? { ...t, is_hidden: !currentlyHidden } : t)
            );
            // Refresh hidden list
            await loadHiddenTickers();
        } catch (error) {
            console.error('Failed to toggle hidden status:', error);
            toast.error('Failed to update ticker visibility');
        } finally {
            setTogglingSymbol(null);
        }
    };

    const requestToggle = async (ticker: HiddenTicker) => {
        // Hiding removes the ticker from every user's suggestions: confirm it.
        if (!ticker.is_hidden) {
            const confirmed = await confirm({
                title: `Hide ${ticker.symbol} from suggestions?`,
                description: `${ticker.name} will no longer be suggested to any user. You can unhide it here at any time.`,
                confirmLabel: 'Hide ticker',
                destructive: true,
            });
            if (!confirmed) return;
        }
        await handleToggleHidden(ticker.symbol, ticker.is_hidden);
    };

    const toggleButton = (ticker: HiddenTicker) => (
        <Button
            size="sm"
            variant="outline"
            onClick={() => void requestToggle(ticker)}
            disabled={togglingSymbol === ticker.symbol}
            className={cn('h-11 shrink-0 gap-1.5 lg:h-8', ticker.is_hidden ? 'text-up hover:bg-up/10 hover:text-up' : 'text-down hover:bg-down/10 hover:text-down')}
            aria-label={`${ticker.is_hidden ? 'Unhide' : 'Hide'} ${ticker.symbol}`}
        >
            {togglingSymbol === ticker.symbol ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : ticker.is_hidden ? (
                <>
                    <Eye className="h-4 w-4" />
                    Unhide
                </>
            ) : (
                <>
                    <EyeOff className="h-4 w-4" />
                    Hide
                </>
            )}
        </Button>
    );

    const statusStamp = (hidden: boolean) => (
        <Badge variant={hidden ? 'statusBanned' : 'active'} className="h-5 gap-1 px-1.5 text-[11px]">
            {hidden ? <EyeOff className="h-3 w-3" aria-hidden /> : <Eye className="h-3 w-3" aria-hidden />}
            {hidden ? 'Hidden' : 'Visible'}
        </Badge>
    );

    return (
        <div className="space-y-8">
            {/* Search */}
            <section className="space-y-3" aria-label="Find a ticker">
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void handleSearch();
                    }}
                >
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                            type="text"
                            placeholder="Search ticker symbol or name..."
                            aria-label="Search tickers to hide or unhide"
                            value={searchTerm}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            className="h-11 pl-9 lg:h-9"
                        />
                    </div>
                    <Button type="submit" disabled={loading} className="h-11 min-w-[5.5rem] lg:h-9">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                    </Button>
                </form>

                {tickers.length > 0 && (
                    compact ? (
                        <ul className="space-y-1.5">
                            {tickers.map((ticker) => (
                                <li key={ticker.symbol} className="flex items-center gap-3 rounded-lg bg-card px-3.5 py-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="text-[15px] font-semibold text-foreground">{ticker.symbol}</span>
                                            {statusStamp(ticker.is_hidden)}
                                        </div>
                                        <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
                                            {ticker.name}{ticker.exchange && <span className="num"> · {ticker.exchange}</span>}
                                        </div>
                                    </div>
                                    {toggleButton(ticker)}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <table className="w-full caption-bottom text-sm border-separate border-spacing-y-1.5">
                            <TableHeader>
                                <TableRow className="bg-transparent hover:bg-transparent">
                                    <TableHead className="pl-6 font-medium text-muted-foreground">Symbol</TableHead>
                                    <TableHead className="font-medium text-muted-foreground">Name</TableHead>
                                    <TableHead className="font-medium text-muted-foreground">Exchange</TableHead>
                                    <TableHead className="font-medium text-muted-foreground">Status</TableHead>
                                    <TableHead className="pr-6 text-right font-medium text-muted-foreground">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tickers.map((ticker) => (
                                    <TableRow key={ticker.symbol} className="bg-card">
                                        <TableCell className="rounded-l-lg py-3 pl-6 text-base font-semibold text-foreground">{ticker.symbol}</TableCell>
                                        <TableCell className="font-medium text-foreground">{ticker.name}</TableCell>
                                        <TableCell className="num text-xs text-muted-foreground">{ticker.exchange}</TableCell>
                                        <TableCell>{statusStamp(ticker.is_hidden)}</TableCell>
                                        <TableCell className="rounded-r-lg pr-6 text-right">{toggleButton(ticker)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </table>
                    )
                )}

                {/* Only after a search has actually run for this text. */}
                {searchedTerm !== null && searchedTerm === searchTerm.trim() && tickers.length === 0 && !loading && (
                    <EmptyState title={`No tickers match “${searchedTerm}”`} description="Check the symbol or try the company name." />
                )}
            </section>

            <section className="space-y-3" aria-labelledby="hidden-tickers-heading">
                <h2 id="hidden-tickers-heading" className="label-micro px-1">
                    Currently hidden <span className="num">({hiddenTickers.length})</span>
                </h2>
                {loadingHidden ? (
                    <div role="status" aria-label="Loading hidden tickers" className="space-y-1.5">
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                    </div>
                ) : hiddenTickers.length === 0 ? (
                    <EmptyState className="rounded-lg bg-card" title="No tickers are hidden" />
                ) : (
                    <ul className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
                        {hiddenTickers.map((ticker) => (
                            <li key={ticker.symbol} className="flex items-center gap-3 rounded-lg bg-card px-3.5 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <span className="text-[15px] font-semibold text-foreground">{ticker.symbol}</span>
                                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{ticker.name}</span>
                                </div>
                                {toggleButton({ ...ticker, is_hidden: true })}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

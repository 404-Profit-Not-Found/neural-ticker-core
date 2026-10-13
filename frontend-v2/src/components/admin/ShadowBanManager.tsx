import { useState, useEffect, useCallback, useRef } from 'react';
import { AdminService } from '../../services/adminService';
import { EyeOff, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { EmptyState, LoadError } from '../ui/empty-state';
import { useConfirm } from '../ui/confirm';
import { TickerLogo } from '../dashboard/TickerLogo';
import { AdminRow, AdminRowsSkeleton, SearchField } from './admin-ui';

interface HiddenTicker {
    id: string;
    symbol: string;
    name: string;
    exchange: string;
    is_hidden: boolean;
}

// Rows share a line from `lg`: two columns of the same mini cards.
const GRID = 'grid grid-cols-1 gap-1.5 lg:grid-cols-2';

export function ShadowBanManager() {
    const [tickers, setTickers] = useState<HiddenTicker[]>([]);
    // null until the list has loaded once: "not loaded" is not "nothing hidden".
    const [hiddenTickers, setHiddenTickers] = useState<HiddenTicker[] | null>(null);
    const [hiddenError, setHiddenError] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState(false);
    const [togglingSymbol, setTogglingSymbol] = useState<string | null>(null);
    // The text the last completed search was run for (null = none yet).
    const [searchedTerm, setSearchedTerm] = useState<string | null>(null);
    const confirm = useConfirm();

    const loadHiddenTickers = useCallback(async () => {
        setHiddenError(false);
        try {
            const data = await AdminService.getHiddenTickers();
            setHiddenTickers(data);
        } catch (error) {
            console.error('Failed to load hidden tickers:', error);
            setHiddenError(true);
        }
    }, []);

    useEffect(() => {
        void loadHiddenTickers();
    }, [loadHiddenTickers]);

    // A new search may start before the last one answered: only the latest counts.
    const searchRun = useRef(0);

    const handleSearch = async () => {
        const run = ++searchRun.current;
        if (!searchTerm.trim()) {
            setTickers([]);
            setSearchedTerm(null);
            setSearchError(false);
            setLoading(false);
            return;
        }
        setLoading(true);
        setSearchError(false);
        try {
            const term = searchTerm.trim();
            const data = await AdminService.searchTickersAdmin(searchTerm);
            if (run !== searchRun.current) return;
            setTickers(data);
            setSearchedTerm(term);
        } catch (error) {
            console.error('Failed to search tickers:', error);
            if (run !== searchRun.current) return;
            setTickers([]);
            setSearchedTerm(null);
            setSearchError(true);
        } finally {
            if (run === searchRun.current) setLoading(false);
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

    const row = (ticker: HiddenTicker) => (
        <li key={ticker.symbol}>
            <AdminRow
                identifier
                leading={<TickerLogo symbol={ticker.symbol} className="h-10 w-10 shrink-0" />}
                title={ticker.symbol}
                // Visible is the normal state and needs no stamp; hidden is the exception.
                stamps={
                    ticker.is_hidden ? (
                        <Badge variant="statusBanned" className="h-5 shrink-0 gap-1 px-1.5 text-[11px]">
                            <EyeOff className="h-3 w-3" aria-hidden />
                            Hidden
                        </Badge>
                    ) : undefined
                }
                subtitle={
                    <>
                        {ticker.name}
                        {ticker.exchange && <span className="num"> · {ticker.exchange}</span>}
                    </>
                }
                action={
                    <div className="flex shrink-0 items-center pr-2.5">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void requestToggle(ticker)}
                            disabled={togglingSymbol === ticker.symbol}
                            className="h-11 min-w-[5.75rem] gap-1.5 px-3 lg:h-8 lg:min-w-[5.25rem] lg:text-xs"
                            aria-label={`${ticker.is_hidden ? 'Unhide' : 'Hide'} ${ticker.symbol}`}
                        >
                            {togglingSymbol === ticker.symbol ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : ticker.is_hidden ? (
                                <>
                                    <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    Unhide
                                </>
                            ) : (
                                <>
                                    <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    Hide
                                </>
                            )}
                        </Button>
                    </div>
                }
            />
        </li>
    );

    // Only once a search has actually run for the text in the field.
    const searchedCurrent = searchedTerm !== null && searchedTerm === searchTerm.trim();
    const showResults = loading || searchError || tickers.length > 0 || searchedCurrent;

    return (
        <div className="space-y-6">
            <SearchField
                className="lg:max-w-md"
                label="Search tickers to hide or unhide"
                placeholder="Search symbol or name…"
                value={searchTerm}
                onChange={setSearchTerm}
                onSubmit={() => void handleSearch()}
                busy={loading}
            />

            {showResults && (
                <section className="space-y-2.5" aria-labelledby="shadowban-results-heading">
                    <h2 id="shadowban-results-heading" className="label-micro flex items-center gap-2">
                        Results
                        {!loading && !searchError && <span className="num text-foreground">{tickers.length}</span>}
                    </h2>
                    {searchError ? (
                        <LoadError what="search results" onRetry={() => void handleSearch()} className="rounded-lg bg-card" />
                    ) : tickers.length > 0 ? (
                        <ul className={GRID}>{tickers.map(row)}</ul>
                    ) : loading ? (
                        <AdminRowsSkeleton rows={4} label="Searching tickers" className={GRID} />
                    ) : (
                        <EmptyState
                            className="rounded-lg bg-card"
                            title={`No tickers match “${searchedTerm}”`}
                            description="Check the symbol or try the company name."
                        />
                    )}
                </section>
            )}

            <section className="space-y-2.5" aria-labelledby="hidden-tickers-heading">
                <h2 id="hidden-tickers-heading" className="label-micro flex items-center gap-2">
                    Currently hidden
                    {hiddenTickers && <span className="num text-foreground">{hiddenTickers.length}</span>}
                </h2>
                {hiddenTickers === null ? (
                    hiddenError ? (
                        <LoadError what="hidden tickers" onRetry={() => void loadHiddenTickers()} className="rounded-lg bg-card" />
                    ) : (
                        <AdminRowsSkeleton rows={2} label="Loading hidden tickers" className={GRID} />
                    )
                ) : hiddenTickers.length === 0 ? (
                    <EmptyState
                        className="rounded-lg bg-card"
                        title="No tickers are hidden"
                        description="Search for a ticker above to hide it from suggestions."
                    />
                ) : (
                    <ul className={GRID}>{hiddenTickers.map((ticker) => row({ ...ticker, is_hidden: true }))}</ul>
                )}
            </section>
        </div>
    );
}

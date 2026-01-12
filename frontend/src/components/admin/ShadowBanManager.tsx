import { useState, useEffect, useCallback } from 'react';
import { AdminService } from '../../services/adminService';
import { Search, EyeOff, Eye, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
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
            return;
        }
        setLoading(true);
        try {
            const data = await AdminService.searchTickersAdmin(searchTerm);
            setTickers(data);
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
            alert('Failed to update ticker visibility');
        } finally {
            setTogglingSymbol(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Search Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                    <EyeOff className="w-5 h-5 text-orange-500" />
                    <div>
                        <h2 className="text-xl font-semibold">Shadow Ban Tickers</h2>
                        <p className="text-sm text-muted-foreground">
                            Hide bankrupt or problematic companies from appearing in suggestions
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        <Input
                            type="text"
                            placeholder="Search ticker symbol or name..."
                            value={searchTerm}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleSearch()}
                            className="pl-9"
                        />
                    </div>
                    <Button onClick={handleSearch} disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                    </Button>
                </div>

                {/* Search Results */}
                {tickers.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full caption-bottom text-sm border-separate border-spacing-y-2">
                            <TableHeader>
                                <TableRow className="bg-transparent hover:bg-transparent border-none">
                                    <TableHead className="font-medium text-muted-foreground pl-6">Symbol</TableHead>
                                    <TableHead className="font-medium text-muted-foreground">Name</TableHead>
                                    <TableHead className="font-medium text-muted-foreground">Exchange</TableHead>
                                    <TableHead className="font-medium text-muted-foreground">Status</TableHead>
                                    <TableHead className="text-right font-medium text-muted-foreground pr-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="space-y-2">
                                {tickers.map((ticker) => (
                                    <TableRow
                                        key={ticker.symbol}
                                        className="bg-card hover:bg-muted/40 transition-colors shadow-sm border-y border-border/40 first:border-l first:rounded-l-lg last:border-r last:rounded-r-lg group"
                                    >
                                        <TableCell className="py-4 pl-6 font-mono font-bold text-lg rounded-l-lg border-l border-y border-border/40 text-foreground">
                                            {ticker.symbol}
                                        </TableCell>
                                        <TableCell className="border-y border-border/40 text-foreground font-medium">
                                            {ticker.name}
                                        </TableCell>
                                        <TableCell className="border-y border-border/40">
                                            <Badge variant="outline" className="text-xs font-mono">
                                                {ticker.exchange}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="border-y border-border/40">
                                            {ticker.is_hidden ? (
                                                <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20 shadow-none">
                                                    <EyeOff className="w-3 h-3 mr-1" />
                                                    Hidden
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20 shadow-none">
                                                    <Eye className="w-3 h-3 mr-1" />
                                                    Visible
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right rounded-r-lg border-r border-y border-border/40 pr-6">
                                            <Button
                                                size="sm"
                                                variant={ticker.is_hidden ? 'outline' : 'destructive'}
                                                onClick={() => handleToggleHidden(ticker.symbol, ticker.is_hidden)}
                                                disabled={togglingSymbol === ticker.symbol}
                                                className={ticker.is_hidden ? "gap-1 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-600" : "gap-1"}
                                            >
                                                {togglingSymbol === ticker.symbol ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : ticker.is_hidden ? (
                                                    <>
                                                        <Eye className="w-3 h-3" />
                                                        Unhide
                                                    </>
                                                ) : (
                                                    <>
                                                        <EyeOff className="w-3 h-3" />
                                                        Hide
                                                    </>
                                                )}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </table>
                    </div>
                )}

                {searchTerm && tickers.length === 0 && !loading && (
                    <p className="text-center text-muted-foreground py-4">
                        No tickers found matching "{searchTerm}"
                    </p>
                )}
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                    <h2 className="text-xl font-semibold">Currently Hidden ({hiddenTickers.length})</h2>
                </div>
                <div className="py-4">
                    {loadingHidden ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : hiddenTickers.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">
                            No tickers are currently hidden
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {hiddenTickers.map((ticker) => (
                                <div
                                    key={ticker.symbol}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20"
                                >
                                    <span className="font-mono font-semibold text-red-400">
                                        {ticker.symbol}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {ticker.name}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 hover:bg-emerald-500/20"
                                        onClick={() => handleToggleHidden(ticker.symbol, true)}
                                        disabled={togglingSymbol === ticker.symbol}
                                    >
                                        {togglingSymbol === ticker.symbol ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Eye className="w-3 h-3 text-emerald-400" />
                                        )}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

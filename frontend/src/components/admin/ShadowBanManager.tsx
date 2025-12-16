import { useState, useEffect, useCallback } from 'react';
import { AdminService } from '../../services/adminService';
import { Search, EyeOff, Eye, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
    Table,
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
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                        <EyeOff className="w-5 h-5 text-orange-500" />
                        Shadow Ban Tickers
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Hide bankrupt or problematic companies from appearing in suggestions
                    </p>
                </CardHeader>
                <CardContent>
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
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Symbol</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Exchange</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tickers.map((ticker) => (
                                    <TableRow key={ticker.symbol}>
                                        <TableCell className="font-mono font-semibold">
                                            {ticker.symbol}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {ticker.name}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-xs">
                                                {ticker.exchange}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {ticker.is_hidden ? (
                                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                                                    <EyeOff className="w-3 h-3 mr-1" />
                                                    Hidden
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                                    <Eye className="w-3 h-3 mr-1" />
                                                    Visible
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                variant={ticker.is_hidden ? 'outline' : 'destructive'}
                                                onClick={() => handleToggleHidden(ticker.symbol, ticker.is_hidden)}
                                                disabled={togglingSymbol === ticker.symbol}
                                                className="gap-1"
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
                        </Table>
                    )}

                    {searchTerm && tickers.length === 0 && !loading && (
                        <p className="text-center text-muted-foreground py-4">
                            No tickers found matching "{searchTerm}"
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Currently Hidden Tickers */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-orange-500" />
                        Currently Hidden ({hiddenTickers.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
            </Card>
        </div>
    );
}

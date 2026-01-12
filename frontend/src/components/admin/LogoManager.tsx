import { useState, useEffect } from 'react';
import { AdminService } from '../../services/adminService';
import { Search, Loader2, Image as ImageIcon, Save, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../ui/table';
import { toast } from 'sonner';

interface TickerResult {
    id: string;
    symbol: string;
    name: string;
    exchange: string;
    logo_url?: string;
}

export function LogoManager() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showMissingLogos, setShowMissingLogos] = useState(false);
    const [tickers, setTickers] = useState<TickerResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [updatingSymbol, setUpdatingSymbol] = useState<string | null>(null);
    const [logoInputs, setLogoInputs] = useState<Record<string, string>>({});

    const handleSearch = async () => {
        setLoading(true);
        try {
            const data = await AdminService.searchTickersAdmin(searchTerm, showMissingLogos) as TickerResult[];
            setTickers(data);

            // We don't clear logoInputs here so user doesn't lose work if they search again

            if (data.length === 0) {
                toast.info('No tickers found');
            }
        } catch (error) {
            console.error('Failed to search tickers:', error);
            toast.error('Search failed');
        } finally {
            setLoading(false);
        }
    };

    // Auto-search when toggling missing logos
    useEffect(() => {
        if (showMissingLogos) {
            handleSearch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showMissingLogos]);

    const handleUpdateLogo = async (symbol: string) => {
        const url = logoInputs[symbol];
        if (!url) return;

        setUpdatingSymbol(symbol);
        try {
            await AdminService.updateTickerLogo(symbol, url);
            toast.success(`Logo updated for ${symbol}`);
            // Optimistically remove if filtering by missing
            if (showMissingLogos) {
                setTickers(prev => prev.filter(t => t.symbol !== symbol));
            }
        } catch (error) {
            console.error('Failed to update logo:', error);
            toast.error('Failed to update logo');
        } finally {
            setUpdatingSymbol(null);
        }
    };

    const handleInputChange = (symbol: string, value: string) => {
        setLogoInputs(prev => ({ ...prev, [symbol]: value }));
    };

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                    <ImageIcon className="w-5 h-5 text-indigo-500" />
                    <div>
                        <h2 className="text-xl font-semibold">Logo Manager</h2>
                        <p className="text-sm text-muted-foreground">
                            Manually assign logo URLs to tickers (e.g. for those missing from Finnhub).
                        </p>
                    </div>
                </div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end mb-6">
                    <div className="flex-1 space-y-2">
                        <Label>Search Tickers</Label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by symbol or name..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            />
                        </div>
                    </div>

                    <div className="flex items-center space-x-2 pb-2.5">
                        <Checkbox
                            id="missing-logos"
                            checked={showMissingLogos}
                            onCheckedChange={(checked) => setShowMissingLogos(checked as boolean)}
                        />
                        <Label htmlFor="missing-logos" className="cursor-pointer">Show Missing Logos Only</Label>
                    </div>

                    <Button onClick={handleSearch} disabled={loading} className="pb-2.5">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                    </Button>
                </div>

                {tickers.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full caption-bottom text-sm border-separate border-spacing-y-2">
                            <TableHeader>
                                <TableRow className="bg-transparent hover:bg-transparent border-none">
                                    <TableHead className="font-medium text-muted-foreground pl-6">Symbol</TableHead>
                                    <TableHead className="font-medium text-muted-foreground">Name</TableHead>
                                    <TableHead className="font-medium text-muted-foreground">Exchange</TableHead>
                                    <TableHead className="font-medium text-muted-foreground">Current Logo</TableHead>
                                    <TableHead className="font-medium text-muted-foreground">New Logo URL</TableHead>
                                    <TableHead className="text-right font-medium text-muted-foreground pr-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="space-y-2">
                                {tickers.map((ticker) => (
                                    <TableRow
                                        key={ticker.id}
                                        className="bg-card hover:bg-muted/40 transition-colors shadow-sm border-y border-border/40 first:border-l first:rounded-l-lg last:border-r last:rounded-r-lg group"
                                    >
                                        <TableCell className="py-4 pl-6 font-medium border-l border-y border-border/40 rounded-l-lg">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-lg">{ticker.symbol}</span>
                                                <a
                                                    href={`/ticker/${ticker.symbol}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-muted-foreground hover:text-primary transition-colors"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-[200px] truncate border-y border-border/40" title={ticker.name}>
                                            {ticker.name}
                                        </TableCell>
                                        <TableCell className="border-y border-border/40">
                                            <Badge variant="outline" className="font-mono text-xs">{ticker.exchange}</Badge>
                                        </TableCell>
                                        <TableCell className="border-y border-border/40">
                                            {ticker.logo_url ? (
                                                <img
                                                    src={ticker.logo_url}
                                                    alt={ticker.symbol}
                                                    className="w-8 h-8 object-contain rounded-sm bg-white/5 p-0.5 border border-border/50"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <Badge variant="outline" className="text-xs bg-muted/50 text-muted-foreground">Missing</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="border-y border-border/40">
                                            <div className="flex flex-col gap-2">
                                                <Input
                                                    placeholder="https://..."
                                                    value={logoInputs[ticker.symbol] || ''}
                                                    onChange={(e) => handleInputChange(ticker.symbol, e.target.value)}
                                                    className="h-8 font-mono text-xs bg-background/50"
                                                />
                                                {/* Live Preview of the Input URL */}
                                                {logoInputs[ticker.symbol] && (
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in slide-in-from-top-1">
                                                        <span className="text-[10px] uppercase tracking-wider font-bold">Preview:</span>
                                                        <img
                                                            src={logoInputs[ticker.symbol]}
                                                            alt="Preview"
                                                            className="w-6 h-6 object-contain rounded-sm bg-black/20 border border-white/10"
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).style.display = 'none';
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right border-y border-r border-border/40 rounded-r-lg pr-6">
                                            <Button
                                                size="sm"
                                                onClick={() => handleUpdateLogo(ticker.symbol)}
                                                disabled={updatingSymbol === ticker.symbol || !logoInputs[ticker.symbol]}
                                                className="h-8 gap-1.5 shadow-sm"
                                            >
                                                {updatingSymbol === ticker.symbol ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Save className="w-3 h-3" />
                                                )}
                                                Save
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </table>
                    </div>
                )}

                {searchTerm && tickers.length === 0 && !loading && (
                    <div className="text-center text-muted-foreground py-8">
                        No tickers found matching "{searchTerm}"
                    </div>
                )}
            </div>
        </div>
    );
}

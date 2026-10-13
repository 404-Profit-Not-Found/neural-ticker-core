import { useState, useEffect } from 'react';
import { appPath } from '../../lib/base';
import { AdminService } from '../../services/adminService';
import { Search, Loader2, Save, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EmptyState } from '../ui/empty-state';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
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
    // True once a search has completed, so "no results" is never shown for text that was only typed.
    const [searched, setSearched] = useState(false);

    const handleSearch = async () => {
        setLoading(true);
        try {
            const data = await AdminService.searchTickersAdmin(searchTerm, showMissingLogos) as TickerResult[];
            setTickers(data);
            setSearched(true);
            // We don't clear logoInputs here so user doesn't lose work if they search again
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
        <div className="space-y-4">
            <form
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                    e.preventDefault();
                    void handleSearch();
                }}
            >
                <div className="flex-1 space-y-2">
                    <Label htmlFor="logo-search">Search tickers</Label>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                            id="logo-search"
                            placeholder="Search by symbol or name..."
                            className="h-11 pl-9 lg:h-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex min-h-11 items-center gap-2 lg:min-h-9">
                    <Checkbox
                        id="missing-logos"
                        checked={showMissingLogos}
                        onCheckedChange={(checked) => setShowMissingLogos(checked as boolean)}
                    />
                    <Label htmlFor="missing-logos" className="cursor-pointer">Missing logos only</Label>
                </div>

                <Button type="submit" disabled={loading} className="h-11 min-w-[5.5rem] lg:h-9">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                </Button>
            </form>

            {tickers.length > 0 && (
                <ul className="space-y-1.5">
                    {tickers.map((ticker) => (
                        <li key={ticker.id} className="flex flex-col gap-3 rounded-lg bg-card px-3.5 py-3 lg:flex-row lg:items-center lg:gap-4">
                            <div className="flex min-w-0 items-center gap-3 lg:w-80 lg:shrink-0">
                                {ticker.logo_url ? (
                                    <img
                                        src={ticker.logo_url}
                                        alt=""
                                        className="h-10 w-10 shrink-0 rounded-full bg-muted object-contain"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                ) : (
                                    <span className="label-micro flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted" title="No logo">
                                        None
                                    </span>
                                )}
                                <div className="min-w-0 flex-1">
                                    <a
                                        href={appPath(`/ticker/${encodeURIComponent(ticker.symbol)}`)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-foreground hover:text-primary"
                                        aria-label={`${ticker.symbol} — open ticker page in a new tab`}
                                    >
                                        {ticker.symbol}
                                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                                    </a>
                                    <div className="truncate text-[13px] text-muted-foreground" title={ticker.name}>
                                        {ticker.name}{ticker.exchange && <span className="num"> · {ticker.exchange}</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                <Input
                                    type="url"
                                    inputMode="url"
                                    placeholder="https://..."
                                    aria-label={`New logo URL for ${ticker.symbol}`}
                                    value={logoInputs[ticker.symbol] || ''}
                                    onChange={(e) => handleInputChange(ticker.symbol, e.target.value)}
                                    className="num h-11 min-w-0 flex-1 text-xs lg:h-9"
                                />
                                {/* Live preview of the typed URL */}
                                {logoInputs[ticker.symbol] && (
                                    <img
                                        src={logoInputs[ticker.symbol]}
                                        alt="Preview"
                                        className="h-9 w-9 shrink-0 rounded-full bg-muted object-contain"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                )}
                                <Button
                                    size="sm"
                                    onClick={() => handleUpdateLogo(ticker.symbol)}
                                    disabled={updatingSymbol === ticker.symbol || !logoInputs[ticker.symbol]}
                                    className="h-11 shrink-0 gap-1.5 lg:h-9"
                                >
                                    {updatingSymbol === ticker.symbol ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    Save
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {/* Only after a search has actually run for this text / filter. */}
            {searched && tickers.length === 0 && !loading && (
                <EmptyState
                    className="rounded-lg bg-card"
                    title={showMissingLogos && !searchTerm.trim() ? 'Every ticker has a logo' : 'No tickers match'}
                    description={showMissingLogos && !searchTerm.trim() ? undefined : 'Check the symbol or try the company name.'}
                />
            )}
            {!searched && !loading && (
                <EmptyState
                    className="rounded-lg bg-card"
                    title="Find a ticker to set its logo"
                    description="Search by symbol or name, or list the tickers that are missing a logo."
                />
            )}
        </div>
    );
}

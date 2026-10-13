import { useState, useEffect, useRef } from 'react';
import { apiErrorMessage } from '../../lib/api-error';
import { appPath } from '../../lib/base';
import { forgetMissingLogo } from '../../lib/missing-logos';
import { AdminService } from '../../services/adminService';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { EmptyState, LoadError } from '../ui/empty-state';
import { Label } from '../ui/label';
import { TickerLogo } from '../dashboard/TickerLogo';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { AdminRow, AdminRowsSkeleton, SearchField } from './admin-ui';

interface TickerResult {
    id: string;
    symbol: string;
    name: string;
    exchange: string;
    logo_url?: string | null;
}

// Rows share a line from `lg`: two columns of the same mini cards.
const GRID = 'grid grid-cols-1 gap-1.5 lg:grid-cols-2';

const hasStoredLogo = (ticker: TickerResult) => !!ticker.logo_url && ticker.logo_url !== 'null';

export function LogoManager() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showMissingLogos, setShowMissingLogos] = useState(false);
    const [tickers, setTickers] = useState<TickerResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState(false);
    const [updatingSymbol, setUpdatingSymbol] = useState<string | null>(null);
    // Drafts are kept per ticker, so a URL typed for one survives a new search.
    const [logoInputs, setLogoInputs] = useState<Record<string, string>>({});
    // Logos saved in this session: the list shows them without a reload.
    const [savedLogos, setSavedLogos] = useState<Record<string, string>>({});
    // True once a search has completed, so "no results" is never shown for text that was only typed.
    const [searched, setSearched] = useState(false);
    // The ticker whose logo is being edited in the sheet.
    const [editing, setEditing] = useState<TickerResult | null>(null);

    // Searches can overlap (the chip, then Enter): only the latest one may answer.
    const searchRun = useRef(0);

    const handleSearch = async (missingOnly = showMissingLogos) => {
        const run = ++searchRun.current;
        setLoading(true);
        setSearchError(false);
        try {
            const data = await AdminService.searchTickersAdmin(searchTerm, missingOnly) as TickerResult[];
            if (run !== searchRun.current) return;
            setTickers(data);
            setSearched(true);
            // We don't clear logoInputs here so user doesn't lose work if they search again
        } catch (error) {
            console.error('Failed to search tickers:', error);
            if (run !== searchRun.current) return;
            setTickers([]);
            setSearched(false);
            setSearchError(true);
        } finally {
            if (run === searchRun.current) setLoading(false);
        }
    };

    // Auto-search when toggling missing logos
    useEffect(() => {
        if (showMissingLogos) {
            handleSearch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showMissingLogos]);

    const toggleMissing = () => {
        const next = !showMissingLogos;
        setShowMissingLogos(next);
        // Switching the filter on searches by itself (above). Switching it off
        // refreshes a list that is on screen, so the chip never contradicts it.
        if (!next && searched) void handleSearch(false);
    };

    const handleUpdateLogo = async (symbol: string) => {
        const url = logoInputs[symbol]?.trim();
        if (!url) return;

        setUpdatingSymbol(symbol);
        try {
            await AdminService.updateTickerLogo(symbol, url);
            forgetMissingLogo(symbol);
            toast.success(`Logo updated for ${symbol}`);
            setSavedLogos(prev => ({ ...prev, [symbol]: url }));
            setLogoInputs(prev => {
                const next = { ...prev };
                delete next[symbol];
                return next;
            });
            setEditing(null);
            // Optimistically remove if filtering by missing
            if (showMissingLogos) {
                setTickers(prev => prev.filter(t => t.symbol !== symbol));
            }
        } catch (error) {
            console.error('Failed to update logo:', error);
            toast.error(apiErrorMessage(error, 'Failed to update logo'));
        } finally {
            setUpdatingSymbol(null);
        }
    };

    const handleInputChange = (symbol: string, value: string) => {
        setLogoInputs(prev => ({ ...prev, [symbol]: value }));
    };

    const logoOf = (ticker: TickerResult, className: string) =>
        savedLogos[ticker.symbol] ? (
            <img src={savedLogos[ticker.symbol]} alt="" className={cn('shrink-0 rounded-full bg-muted object-contain', className)} />
        ) : (
            // A ticker known to have no logo gets the standard placeholder straight
            // away — no request that can only answer 404.
            <TickerLogo
                symbol={ticker.symbol}
                url={ticker.logo_url ?? undefined}
                noLogo={!hasStoredLogo(ticker)}
                className={cn('shrink-0', className)}
            />
        );

    return (
        <div className="space-y-4">
            {/* One line: the search, and the filter as a chip beside it. */}
            <div className="flex items-center gap-2">
                <SearchField
                    className="min-w-0 flex-1 lg:w-96 lg:flex-none"
                    label="Search tickers"
                    placeholder="Symbol or name…"
                    value={searchTerm}
                    onChange={setSearchTerm}
                    onSubmit={() => void handleSearch()}
                    busy={loading}
                />
                <button
                    type="button"
                    aria-pressed={showMissingLogos}
                    onClick={toggleMissing}
                    className={cn(
                        'flex h-11 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9',
                        showMissingLogos
                            ? 'bg-signal/15 text-signal hover:bg-signal/25'
                            : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                >
                    Missing logos
                </button>
            </div>

            {searchError ? (
                <LoadError what="tickers" onRetry={() => void handleSearch()} className="rounded-lg bg-card" />
            ) : tickers.length > 0 ? (
                <ul className={GRID}>
                    {tickers.map((ticker) => {
                        const hasLogo = !!savedLogos[ticker.symbol] || hasStoredLogo(ticker);
                        return (
                            <li key={ticker.id}>
                                <AdminRow
                                    identifier
                                    onClick={() => setEditing(ticker)}
                                    label={`${ticker.symbol}, ${ticker.name} — ${hasLogo ? 'change' : 'add'} logo`}
                                    leading={logoOf(ticker, 'h-10 w-10')}
                                    title={ticker.symbol}
                                    stamps={
                                        hasLogo ? undefined : (
                                            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[11px] text-muted-foreground">
                                                No logo
                                            </Badge>
                                        )
                                    }
                                    subtitle={
                                        <>
                                            {ticker.name}
                                            {ticker.exchange && <span className="num"> · {ticker.exchange}</span>}
                                        </>
                                    }
                                    action={
                                        <a
                                            href={appPath(`/ticker/${encodeURIComponent(ticker.symbol)}`)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={`${ticker.symbol} — open ticker page in a new tab`}
                                            title="Open ticker page in a new tab"
                                            className="flex w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                        >
                                            <ExternalLink className="h-4 w-4" aria-hidden />
                                        </a>
                                    }
                                />
                            </li>
                        );
                    })}
                </ul>
            ) : loading ? (
                <AdminRowsSkeleton rows={6} label="Searching tickers" className={GRID} />
            ) : searched ? (
                // Only after a search has actually run for this text / filter.
                <EmptyState
                    className="rounded-lg bg-card"
                    title={showMissingLogos && !searchTerm.trim() ? 'Every ticker has a logo' : 'No tickers match'}
                    description={showMissingLogos && !searchTerm.trim() ? undefined : 'Check the symbol or try the company name.'}
                />
            ) : (
                <EmptyState
                    className="rounded-lg bg-card"
                    title="Find a ticker to set its logo"
                    description="Search by symbol or name, or list the tickers that are missing a logo."
                />
            )}

            {editing && (
                <LogoDialog
                    ticker={editing}
                    current={logoOf(editing, 'h-12 w-12')}
                    value={logoInputs[editing.symbol] || ''}
                    onChange={(value) => handleInputChange(editing.symbol, value)}
                    saving={updatingSymbol === editing.symbol}
                    onSave={() => void handleUpdateLogo(editing.symbol)}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
}

interface LogoDialogProps {
    ticker: TickerResult;
    /** The logo the ticker has now (or its placeholder). */
    current: React.ReactNode;
    value: string;
    onChange: (value: string) => void;
    saving: boolean;
    onSave: () => void;
    onClose: () => void;
}

/** The logo editor: a bottom sheet on phones, a dialog on desktop. */
function LogoDialog({ ticker, current, value, onChange, saving, onSave, onClose }: LogoDialogProps) {
    const url = value.trim();
    // The address whose image failed to load; a new address gets a new try.
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const failed = !!url && failedUrl === url;

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <form
                noValidate
                onSubmit={(e) => {
                    e.preventDefault();
                    if (url && !saving) onSave();
                }}
            >
                <DialogHeader>
                    <div className="flex items-center gap-3.5">
                        {/* Live preview of the typed address; the current logo until one loads. */}
                        {url && !failed ? (
                            <img
                                key={url}
                                src={url}
                                alt="Preview"
                                className="h-12 w-12 shrink-0 rounded-full bg-muted object-contain"
                                onError={() => setFailedUrl(url)}
                            />
                        ) : (
                            current
                        )}
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-lg leading-snug">Logo for {ticker.symbol}</DialogTitle>
                            <DialogDescription className="truncate">
                                {ticker.name}
                                {ticker.exchange && <span className="num"> · {ticker.exchange}</span>}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                <div className="space-y-2 pb-5">
                    <Label htmlFor="admin-logo-url">Image URL</Label>
                    <Input
                        id="admin-logo-url"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus
                        placeholder="https://…"
                        aria-describedby="admin-logo-hint"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="num h-11 lg:h-10"
                    />
                    <p id="admin-logo-hint" aria-live="polite" className={cn('text-xs', failed ? 'text-down' : 'text-muted-foreground')}>
                        {failed
                            ? 'This address did not load as an image.'
                            : url
                              ? 'Previewed above.'
                              : 'Paste a direct link to the image.'}
                    </p>
                </div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" disabled={!url || saving} className="gap-2">
                        {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        Save logo
                    </Button>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

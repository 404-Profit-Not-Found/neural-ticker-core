import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { TickerLogo } from '../dashboard/TickerLogo';
import { cn } from '../../lib/api';

interface TickerResult {
    symbol: string;
    name: string;
    exchange: string;
    logo_url?: string;
}

export function GlobalSearch({ className = '' }: { className?: string }) {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<TickerResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Keyboard shortcut (CMD/CTRL + K)
    useEffect(() => {
        const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    // Click outside to close
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Debounced Search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.trim().length === 0) {
                setResults([]);
                setIsOpen(false);
                return;
            }

            setIsLoading(true);
            try {
                const { data } = await api.get<TickerResult[]>('/tickers', {
                    params: { search: query },
                });
                setResults(data);
                setIsOpen(true);
                setHighlightedIndex(-1); // Reset highlight on new results
            } catch (error) {
                console.error('Search failed', error);
            } finally {
                setIsLoading(false);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [query]);

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((prev) =>
                prev < results.length - 1 ? prev + 1 : prev
            );
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && results[highlightedIndex]) {
                selectTicker(results[highlightedIndex]);
            } else if (results.length > 0) {
                // If nothing is highlighted, select the first result
                selectTicker(results[0]);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            (e.target as HTMLInputElement).blur();
        }
    };

    const selectTicker = (ticker: TickerResult) => {
        navigate(`/ticker/${ticker.symbol}`);
        setQuery('');
        setIsOpen(false);
    };

    return (
        <div className={cn("relative w-full", className)} ref={wrapperRef}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <input
                    ref={inputRef}
                    type="text"
                    className="w-full bg-[#09090b] border border-input text-sm rounded-full pl-10 pr-16 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-background transition-all placeholder:text-muted-foreground/70"
                    placeholder="Search tickers..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (results.length > 0) setIsOpen(true);
                    }}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                    {isLoading && (
                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    )}
                    <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                        <span className="text-xs">⌘</span>K
                    </kbd>
                </div>
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute top-full mt-2 w-full bg-[#09090b] !bg-opacity-100 border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in slide-in-from-top-2 !opacity-100">
                    <div className="py-1">
                        {results.map((ticker, index) => (
                            <button
                                key={ticker.symbol}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${index === highlightedIndex
                                    ? 'bg-primary/10 text-primary'
                                    : 'hover:bg-muted/50 text-foreground'
                                    }`}
                                onClick={() => selectTicker(ticker)}
                                onMouseEnter={() => setHighlightedIndex(index)}
                            >
                                {/* Logo using TickerLogo */}
                                <TickerLogo
                                    symbol={ticker.symbol}
                                    url={ticker.logo_url}
                                    className="w-8 h-8 rounded-full border border-border flex-shrink-0"
                                />

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-sm">{ticker.symbol}</span>
                                        <span className="text-[10px] text-muted-foreground border border-border px-1.5 rounded bg-background/50">
                                            {ticker.exchange}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate opacity-80">
                                        {ticker.name}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

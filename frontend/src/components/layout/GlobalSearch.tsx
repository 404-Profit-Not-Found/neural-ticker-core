import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

interface TickerResult {
    symbol: string;
    name: string;
    exchange: string;
    logo_url?: string;
}

export function GlobalSearch() {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<TickerResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement>(null);

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
                // Optional: Select first result on Enter if none highlighted?
                // Or trigger a "full search" page?
                // Let's select first item for convenience if typed exact match?
                // For now, only explicit selection via arrows.
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
        <div className="relative w-full max-w-sm" ref={wrapperRef}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <input
                    type="text"
                    className="w-full bg-muted/40 border border-input text-sm rounded-full pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-background transition-all placeholder:text-muted-foreground/70"
                    placeholder="Search tickers..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (results.length > 0) setIsOpen(true);
                    }}
                />
                {isLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-primary w-4 h-4 animate-spin" />
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute top-full mt-2 w-full bg-card/80 backdrop-blur-md border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
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
                                {/* Logo or Fallback Avatar */}
                                <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {ticker.logo_url ? (
                                        <img
                                            src={ticker.logo_url}
                                            alt={ticker.symbol}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <span className="text-[10px] font-bold text-muted-foreground">
                                            {ticker.symbol.substring(0, 2)}
                                        </span>
                                    )}
                                </div>

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

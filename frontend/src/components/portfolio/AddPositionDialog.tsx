import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { Plus, Calendar, Search, Loader2 } from 'lucide-react';
import { api, cn } from '../../lib/api';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { TickerLogo } from '../dashboard/TickerLogo';

interface TickerResult {
  symbol: string;
  name: string;
  exchange: string;
  logo_url?: string;
}

interface AddPositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddPositionDialog({ open, onOpenChange, onSuccess }: AddPositionDialogProps) {
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search States
  const [results, setResults] = useState<TickerResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSymbol('');
      setShares('');
      setPrice('');
      setDate(new Date().toISOString().split('T')[0]);
      setError(null);
      setResults([]);
      setShowResults(false);
      setHighlightedIndex(-1);
    }
  }, [open]);

  // Debounced Search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!symbol.trim()) {
        setResults([]);
        setShowResults(false);
        return;
      }

      setIsLoadingSearch(true);
      try {
        const { data } = await api.get<TickerResult[]>('/tickers', {
          params: { search: symbol },
        });
        setResults(data);
        setShowResults(true);
      } catch (error) {
        console.error('Search failed', error);
      } finally {
        setIsLoadingSearch(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [symbol]);

  // Click Outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectTicker = (ticker: TickerResult) => {
    setSymbol(ticker.symbol);
    setShowResults(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < results.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && showResults) {
      if (highlightedIndex >= 0 && results[highlightedIndex]) {
        e.preventDefault();
        selectTicker(results[highlightedIndex]);
      } else if (results.length > 0) {
        // Optional: auto-select first one or just close
      }
    } else if (e.key === 'Escape') {
      setShowResults(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.post('/portfolio/positions', {
        symbol: symbol.toUpperCase(),
        shares: parseFloat(shares),
        buy_price: parseFloat(price),
        buy_date: date,
      });
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add position';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10 text-primary">
            <Plus size={18} />
          </div>
          Add Position
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        {error && (
          <div className="p-3 bg-red-500/10 text-red-500 text-sm rounded-md border border-red-500/20">
            {error}
          </div>
        )}

        <div className="space-y-1.5 relative" ref={searchRef}>
          <label className="text-sm font-medium text-muted-foreground">Ticker Symbol</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              required
              placeholder="e.g. NVDA"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (results.length > 0) setShowResults(true);
              }}
              className="pl-9 uppercase placeholder:normal-case font-mono font-bold bg-background"
            />
            {isLoadingSearch && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {showResults && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#1c1c1c] border border-border rounded-lg shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="py-1 max-h-[220px] overflow-y-auto custom-scrollbar">
                {results.map((ticker, index) => (
                  <button
                    key={ticker.symbol}
                    type="button"
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                      index === highlightedIndex
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted/50 text-foreground',
                    )}
                    onClick={() => selectTicker(ticker)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <TickerLogo
                      symbol={ticker.symbol}
                      url={ticker.logo_url}
                      className="w-8 h-8 rounded-full border border-border flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">
                          {ticker.symbol}
                        </span>
                        <span className="text-[10px] text-muted-foreground border border-border px-1.5 rounded bg-background/50">
                          {ticker.exchange}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate opacity-80 font-sans">
                        {ticker.name}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Shares</label>
            <Input
              type="number"
              step="any"
              required
              placeholder="0.00"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Buy Price ($)</label>
            <Input
              type="number"
              step="any"
              required
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="bg-background"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Date Purchased</label>
          <div className="relative">
            <Input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-10 [color-scheme:dark] bg-background"
            />
            <Calendar className="absolute left-3 top-2.5 text-muted-foreground pointer-events-none" size={16} />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {loading ? 'Adding...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

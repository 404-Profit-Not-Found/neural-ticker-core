import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Calendar as CalendarIcon, Search, Loader2, Info, AlertCircle, DollarSign, Hash } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, cn } from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { SimpleCalendar } from '../ui/simple-calendar';
import { TickerLogo } from '../dashboard/TickerLogo';
import { PriceRangeSlider } from './PriceRangeSlider';

interface TickerResult {
  symbol: string;
  name: string;
  exchange: string;
  logo_url?: string;
  is_queued?: boolean;
}

interface OhlcDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  median: number;
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
  const [investment, setInvestment] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'shares' | 'investment'>('investment');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<TickerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // OHLC Data
  const [ohlcData, setOhlcData] = useState<OhlcDataPoint[]>([]);
  const [fetchingOhlc, setFetchingOhlc] = useState(false);

  // Derived calculations
  useEffect(() => {
    if (!price) return;
    const priceNum = parseFloat(price);
    if (!priceNum) return;

    if (inputMode === 'investment' && investment) {
      const investNum = parseFloat(investment);
      if (investNum > 0) {
        setShares((investNum / priceNum).toFixed(4));
      }
    } else if (inputMode === 'shares' && shares) {
      const sharesNum = parseFloat(shares);
      if (sharesNum > 0) {
        setInvestment((sharesNum * priceNum).toFixed(2));
      }
    }
  }, [price, shares, investment, inputMode]);

  const handleInvestmentChange = (val: string) => {
    setInvestment(val);
    if (price && parseFloat(price) > 0) {
      setShares((parseFloat(val) / parseFloat(price)).toFixed(4));
    }
  };

  const handleSharesChange = (val: string) => {
    setShares(val);
    if (price && parseFloat(price) > 0) {
      setInvestment((parseFloat(val) * parseFloat(price)).toFixed(2));
    }
  };

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search tickers
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length < 1) {
        setResults([]);
        return;
      }

      setSearching(true);
      try {
        const { data } = await api.get<TickerResult[]>('/tickers', {
          params: { 
            search: searchQuery,
            external: 'false' // Only internal tickers
          },
        });
        // Filter out queued/pending tickers
        const validResults = data.filter(t => !t.is_queued);
        setResults(validResults);
        setShowResults(true);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch OHLC + Snapshot when symbol changes (only if valid symbol selected)
  useEffect(() => {
    if (!symbol) {
      setOhlcData([]);
      return;
    }

    const fetchHistory = async () => {
      setFetchingOhlc(true);
      try {
        // Fetch history
        const historyPromise = api.get<any[]>(`/tickers/${symbol}/history`);
        // Fetch today's snapshot
        const snapshotPromise = api.get<any>(`/tickers/${symbol}/snapshot`).catch(() => ({ data: null }));

        const [historyRes, snapshotRes] = await Promise.all([historyPromise, snapshotPromise]);

        let combinedData = historyRes.data.map((item: any) => ({
          date: item.time, // 'YYYY-MM-DD'
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          median: (item.high + item.low) / 2
        }));

        // Append today if available
        if (snapshotRes.data && snapshotRes.data.latestPrice) {
          const snap = snapshotRes.data.latestPrice;
          const today = new Date().toISOString().split('T')[0];
          
          // Check if today already exists in history (avoid dupe)
          const exists = combinedData.find(d => d.date === today);
          if (!exists) {
            combinedData.push({
              date: today,
              open: snap.open || snap.c, // fallback to close if open missing
              high: snap.high || snap.c,
              low: snap.low || snap.c,
              close: snap.close || snap.c,
              median: ((snap.high || snap.c) + (snap.low || snap.c)) / 2
            });
          }
        }
        
        // Sort by date desc for easier lookup? No, usually charts want asc.
        // But for our "find by date" logic, array find is fine.
        setOhlcData(combinedData);
        
        // Auto-set price if not set or date matches today
        const today = new Date().toISOString().split('T')[0];
        const match = combinedData.find(d => d.date === today);
        if (match) {
           setPrice(prev => {
             if (!prev) return match.close.toString();
             return prev;
           });
        }

      } catch (err) {
        console.error('Failed to fetch history', err);
        setOhlcData([]);
      } finally {
        setFetchingOhlc(false);
      }
    };

    fetchHistory();
  }, [symbol]);

  // Update price when date changes
  useEffect(() => {
    if (!date || ohlcData.length === 0) return;
    const dayData = ohlcData.find(d => d.date === date);
    if (dayData) {
      // If user selected a specific date, default price to close, or median?
      // Let's default to close, but slider allows adjustment.
      // Only overwrite if user hasn't typed a custom price? 
      // Actually, better to just let the slider control it or set a default.
      setPrice(dayData.close.toString());
    } else {
      // No data for this date (e.g. weekend selected manually?)
      // Keep previous or clear?
      // Let's clear to indicate "manual entry needed"
      setPrice(''); 
    }
  }, [date, ohlcData]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!symbol) throw new Error("Please select a ticker");
      
      const payload = {
        symbol,
        shares: parseFloat(shares),
        buy_price: parseFloat(price),
        buy_date: new Date(date).toISOString(), // Fix: send full ISO string
      };

      await api.post('/portfolio/positions', payload);
      onSuccess();
      onOpenChange(false);
      // Reset form
      setSymbol('');
      setShares('');
      setPrice('');
      setInvestment('');
      setDate(new Date().toISOString().split('T')[0]);
    } catch (err: unknown) {
      const errorMessage = (err as any).response?.data?.message || (err as Error).message || 'Failed to add position';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const selectTicker = (t: TickerResult) => {
    setSymbol(t.symbol);
    setSearchQuery(t.symbol); // Show symbol in input
    setShowResults(false);
  };
  
  // Get data for currently selected date
  const selectedDateData = useMemo(() => {
     return ohlcData.find(d => d.date === date);
  }, [ohlcData, date]);

  // Dates with data for calendar disabling
  const validDates = useMemo(() => {
    return new Set(ohlcData.map(d => d.date));
  }, [ohlcData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] overflow-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-full text-primary">
              <Plus size={18} />
            </div>
            Add Position
          </DialogTitle>
          <DialogDescription>
            Manually track an external holding.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {error && (
            <div className="p-3 bg-red-500/10 text-red-500 rounded-md text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Ticker Search */}
          <div className="space-y-1.5 relative" ref={searchRef}>
            <Label>Ticker Symbol</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search symbol (e.g. AAPL)..."
                className="pl-9 font-mono uppercase"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (symbol && e.target.value !== symbol) {
                    setSymbol(''); 
                  }
                }}
                onFocus={() => {
                   if (results.length > 0) setShowResults(true);
                }}
              />
              {searching && (
                <div className="absolute right-3 top-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Results Dropdown */}
            {showResults && results.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground rounded-md border shadow-md max-h-[200px] overflow-y-auto">
                {results.map((r) => (
                  <button
                    key={r.symbol}
                    type="button"
                    onClick={() => selectTicker(r)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <TickerLogo symbol={r.symbol} url={r.logo_url} className="w-6 h-6" />
                      <div>
                        <div className="font-bold flex items-center gap-2">
                            {r.symbol}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{r.name}</div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{r.exchange}</span>
                  </button>
                ))}
              </div>
            )}
            
            {/* Selected Ticker Info */}
            {symbol && !searching && (
                 <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    {fetchingOhlc ? (
                        <>
                            <Loader2 size={10} className="animate-spin" />
                            Fetching market data...
                        </>
                    ) : (
                         <span className="text-primary flex items-center gap-1">
                            <Info size={12} />
                            Market data loaded for range selection
                         </span>
                    )}
                 </div>
            )}
          </div>

          <Tabs 
            value={inputMode} 
            onValueChange={(v) => setInputMode(v as 'shares' | 'investment')}
            className="w-full pt-1"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="investment" className="flex items-center gap-2">
                <DollarSign size={14} /> By Investment
              </TabsTrigger>
              <TabsTrigger value="shares" className="flex items-center gap-2">
                 <Hash size={14} /> By Shares
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Date & Price Row */}
          <div className="space-y-1.5 pt-2">
             <div className="flex flex-col gap-4">
               {/* Date */}
               <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Popover>
                      <PopoverTrigger asChild>
                          <Button
                              variant="outline"
                              className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !date && "text-muted-foreground"
                              )}
                          >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {date ? format(parseISO(date), 'PPP') : <span>Pick a date</span>}
                          </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                          <SimpleCalendar
                              value={parseISO(date)}
                              onChange={(d) => setDate(format(d, 'yyyy-MM-dd'))}
                              enabledDates={ohlcData.length > 0 ? validDates : undefined}
                          />
                      </PopoverContent>
                  </Popover>
               </div>
               
               {/* Price Selection (Slider OR Manual Input) */}
               <div className="space-y-1.5 min-h-[80px]">
                 {selectedDateData ? (
                    <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">
                            Price Selection ({format(parseISO(date), 'MM/dd')})
                        </Label>
                        <PriceRangeSlider
                            low={selectedDateData.low}
                            high={selectedDateData.high}
                            median={selectedDateData.median}
                            value={parseFloat(price) || selectedDateData.close}
                            onChange={(val) => setPrice(val.toFixed(2))}
                        />
                    </div>
                 ) : (
                    <div className="space-y-1.5">
                        <Label>Share Price</Label>
                        <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="font-mono bg-muted/50"
                        />
                        <p className="text-[10px] text-muted-foreground">
                           Manual price entry (No OHLC data found)
                        </p>
                    </div>
                 )}
               </div>
             </div>
          </div>

          {/* Quantity Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                 <DollarSign size={12} />
                 Investment
              </Label>
              <Input
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={investment}
                onChange={(e) => handleInvestmentChange(e.target.value)}
                disabled={inputMode === 'shares' && !!shares && !!price}
                className={cn("font-mono", inputMode === 'shares' && "bg-muted/30 focus-visible:ring-0 opacity-80")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                 <Hash size={12} />
                 Shares
              </Label>
              <Input
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={shares}
                onChange={(e) => handleSharesChange(e.target.value)}
                disabled={inputMode === 'investment' && !!investment && !!price}
                className={cn("font-mono", inputMode === 'investment' && "bg-muted/30 focus-visible:ring-0 opacity-80")}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !symbol || !shares || !price}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add {symbol} Position
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

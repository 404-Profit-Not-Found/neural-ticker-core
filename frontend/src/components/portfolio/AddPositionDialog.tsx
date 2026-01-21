import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Calendar as CalendarIcon, Search, Loader2, Info, AlertCircle, DollarSign, Hash } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, cn } from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
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
      // If query matches selected symbol, don't search again (avoids re-opening dropdown on selection)
      if (symbol && searchQuery === symbol) {
          return;
      }

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
        // Filter out queued/pending tickers and ensure we only show "vetted" (internal) ones with logos
        const validResults = data.filter(t => !t.is_queued && t.logo_url);
        setResults(validResults);
        setShowResults(true);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, symbol]);

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
        const historyPromise = api.get<any[]>(`/tickers/${symbol}/history`, { params: { days: 1825 } });
        // Fetch today's snapshot
        const snapshotPromise = api.get<any>(`/tickers/${symbol}/snapshot`).catch(() => ({ data: null }));

        const [historyRes, snapshotRes] = await Promise.all([historyPromise, snapshotPromise]);

        let combinedData = historyRes.data.map((item: any) => {
          const val = item.ts || item.date || item.time;
          let dateStr = val;
          if (typeof val === 'number') {
            dateStr = new Date(val * 1000).toISOString().split('T')[0];
          } else if (val) {
             // Try to handle direct date objects or strings
             try {
                dateStr = new Date(val).toISOString().split('T')[0];
             } catch { dateStr = val; }
          }
          return {
            date: dateStr, 
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          median: (item.high + item.low) / 2
        };
       });

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
    return new Set(ohlcData.map(d => d.date).filter(Boolean));
  }, [ohlcData]);

  // Fallback data for slider when exact date match fails (e.g. weekend/holiday selected)
  // Find the closest previous trading day
  const effectiveDateData = useMemo(() => {
    if (selectedDateData) return selectedDateData;
    if (ohlcData.length === 0) return null;
    if (!date) return null;
    
    // Find closest date before or equal to selected date
    // Array is likely sorted by date (or we can just sort to be safe, but usually API returns sorted)
    // Assuming API returns descending or ascending. Let's filter dates <= selectedDate and take latest.
    const target = new Date(date).getTime();
    
    // Sort desc to find latest before target
    const sorted = [...ohlcData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return sorted.find(d => {
        const dt = new Date(d.date).getTime();
        return dt <= target;
    }) || sorted[0]; // fallback to most recent if everything is in future?
  }, [ohlcData, date, selectedDateData]);

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
            Add a stock supported by NeuralTicker
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
                className="pl-9 font-mono normal-case"
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
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 bg-muted/30">
              <TabsTrigger value="investment" className="flex items-center gap-2">
                <DollarSign size={14} /> By Investment
              </TabsTrigger>
              <TabsTrigger value="shares" className="flex items-center gap-2">
                 <Hash size={14} /> By Shares
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 space-y-4">
                <TabsContent value="investment" className="space-y-4 m-0 border-0 p-0">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Date Picker (Left) */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground">Buy Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        type="button"
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-muted/10 h-10",
                                            !date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                                        {date ? format(parseISO(date), 'PPP') : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                                    <SimpleCalendar
                                        value={parseISO(date)}
                                        onChange={(d) => setDate(format(d, 'yyyy-MM-dd'))}
                                        enabledDates={ohlcData.length > 0 ? validDates : undefined}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Investment Input (Right) */}
                        <div className="space-y-1.5">
                            <Label htmlFor="investment-input" className="text-xs font-bold text-muted-foreground">Investment Amount</Label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="investment-input"
                                    type="number"
                                    step="any"
                                    required
                                    placeholder="0.00"
                                    value={investment}
                                    onChange={(e) => handleInvestmentChange(e.target.value)}
                                    className="pl-9 font-mono bg-muted/20"
                                    autoFocus={inputMode === 'investment'}
                                />
                            </div>
                            {shares && parseFloat(shares) > 0 && (
                                <p className="text-[11px] text-primary font-medium flex items-center gap-1 mt-1">
                                    <Hash size={12} />
                                    Result: <strong>{shares}</strong> shares
                                </p>
                            )}
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="shares" className="space-y-4 m-0 border-0 p-0">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Date Picker (Left) - Exact same instance */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground">Buy Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        type="button"
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-muted/10 h-10",
                                            !date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                                        {date ? format(parseISO(date), 'PPP') : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                                    <SimpleCalendar
                                        value={parseISO(date)}
                                        onChange={(d) => setDate(format(d, 'yyyy-MM-dd'))}
                                        enabledDates={ohlcData.length > 0 ? validDates : undefined}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Shares Input (Right) */}
                        <div className="space-y-1.5">
                            <Label htmlFor="shares-input" className="text-xs font-bold text-muted-foreground">Number of Shares</Label>
                            <div className="relative">
                                <Hash className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="shares-input"
                                    type="number"
                                    step="any"
                                    required
                                    placeholder="0.00"
                                    value={shares}
                                    onChange={(e) => handleSharesChange(e.target.value)}
                                    className="pl-9 font-mono bg-muted/20"
                                    autoFocus={inputMode === 'shares'}
                                />
                            </div>
                            {investment && parseFloat(investment) > 0 && (
                                <p className="text-[11px] text-primary font-medium flex items-center gap-1 mt-1">
                                    <DollarSign size={12} />
                                    Result: <strong>${parseFloat(investment).toLocaleString()}</strong> total
                                </p>
                            )}
                        </div>
                    </div>
                </TabsContent>

                {/* Price Slider/Input Area - Full Width Below Tabs */}
                <div className="space-y-2 pt-2">
                        <div className="bg-muted/10 px-3 py-1 rounded-lg border border-border/50">
                            {effectiveDateData && !selectedDateData && (
                                <div className="text-[10px] text-orange-500 pt-2 flex items-center gap-1">
                                    <AlertCircle size={10} />
                                    <span>Using data from {effectiveDateData.date}</span>
                                </div>
                            )}
                            <PriceRangeSlider
                                low={effectiveDateData?.low ?? 0}
                                high={effectiveDateData?.high ?? 100}
                                median={effectiveDateData?.median ?? 50}
                                value={parseFloat(price) || effectiveDateData?.close || 0}
                                onChange={(val) => setPrice(val.toFixed(2))}
                                className={cn("pt-0 pb-2", !effectiveDateData && "opacity-50 grayscale")}
                            />
                        </div>
                </div>
            </div>
          </Tabs>

          <DialogFooter className="pt-4 border-t border-border/50">
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)} className="text-muted-foreground">
              Cancel
            </Button>
            <Button 
                type="submit" 
                disabled={loading || !symbol || !shares || !price || parseFloat(shares) <= 0}
                className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[140px]"
            >
              {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                  <Plus className="mr-2 h-4 w-4" />
              )}
              Add {symbol || 'Position'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

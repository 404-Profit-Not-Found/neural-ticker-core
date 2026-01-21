import { useState, useEffect, useMemo } from 'react';
import { Save, Trash2, Calendar as CalendarIcon, Loader2, AlertCircle, DollarSign, Hash, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, cn } from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { SimpleCalendar } from '../ui/simple-calendar';
import { TickerLogo } from '../dashboard/TickerLogo';
import { PriceRangeSlider } from './PriceRangeSlider';
import { Sparkline } from '../ui/Sparkline';
import { toast } from 'sonner';

interface Position {
    id: string;
    symbol: string;
    shares: number;
    buy_price: number;
    buy_date: string;
    current_price?: number;
}

interface OhlcDataPoint {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    median: number;
}

interface EditPositionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    position: Position;
    onSuccess: () => void;
}

export function EditPositionDialog({ open, onOpenChange, position, onSuccess }: EditPositionDialogProps) {
    const [shares, setShares] = useState('');
    const [price, setPrice] = useState('');
    const [investment, setInvestment] = useState('');
    const [date, setDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inputMode, setInputMode] = useState<'shares' | 'investment'>('investment');
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    // OHLC Data
    const [ohlcData, setOhlcData] = useState<OhlcDataPoint[]>([]);
    const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);

    // Initialize state from position
    useEffect(() => {
        if (position && open) {
            setDeleteConfirm(false);
            setShares(String(position.shares));
            setPrice(String(position.buy_price));
            setInvestment((position.shares * position.buy_price).toFixed(2));
            setDate(position.buy_date ? new Date(position.buy_date).toISOString().split('T')[0] : '');
            setError(null);
        }
    }, [position, open]);

    // Fetch OHLC Data
    useEffect(() => {
        if (!position?.symbol || !open) return;

        const fetchHistory = async () => {
            try {
                // Fetch 5 years of history + snapshot
                const historyPromise = api.get<Array<Record<string, unknown>>>(`/tickers/${position.symbol}/history`, { params: { days: 1825 } });
                const snapshotPromise = api.get<Record<string, unknown>>(`/tickers/${position.symbol}/snapshot`).catch(() => ({ data: null }));

                const [historyRes, snapshotRes] = await Promise.all([historyPromise, snapshotPromise]);
                setSnapshot(snapshotRes.data);
                
                const combinedData = historyRes.data.map((item: Record<string, unknown>) => {
                    const val = item.ts || item.date || item.time;
                    let dateStr = val;
                    if (typeof val === 'number') {
                        dateStr = new Date(val * 1000).toISOString().split('T')[0];
                    } else if (val) {
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

                setOhlcData(combinedData);
            } finally {
                // No-op
            }
        };

        fetchHistory();
    }, [position?.symbol, open]);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const payload = {
                shares: parseFloat(shares),
                buy_price: parseFloat(price),
                buy_date: new Date(date).toISOString(),
            };

            await api.patch(`/portfolio/positions/${position.id}`, payload);
            toast.success('Position modified successfully');
            onSuccess();
            onOpenChange(false);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } }; message?: string };
            const errorMessage = error.response?.data?.message || error.message || 'Failed to modify position';
            setError(errorMessage);
            toast.error('Failed to modify position');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        setLoading(true);
        try {
            await api.delete(`/portfolio/positions/${position.id}`);
            toast.success('Position removed');
            onSuccess();
            onOpenChange(false);
        } catch {
            toast.error('Failed to remove position');
        } finally {
            setLoading(false);
        }
    };

    const selectedDateData = useMemo(() => {
        return ohlcData.find(d => d.date === date);
    }, [ohlcData, date]);

    const validDates = useMemo(() => {
        return new Set(ohlcData.map(d => d.date).filter(Boolean));
    }, [ohlcData]);

    const effectiveDateData = useMemo(() => {
        if (selectedDateData) return selectedDateData;
        if (ohlcData.length === 0) return null;
        if (!date) return null;
        const target = new Date(date).getTime();
        const sorted = [...ohlcData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return sorted.find(d => new Date(d.date).getTime() <= target) || sorted[0];
    }, [ohlcData, date, selectedDateData]);

    if (deleteConfirm) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-500">
                            <AlertTriangle size={20} />
                            Delete Position?
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to remove <strong>{position?.symbol}</strong> from your portfolio? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                            {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Trash2 size={16} className="mr-2" />}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] overflow-visible">
                <DialogHeader className="pb-4">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-sm border border-primary/20">
                            <Save className="w-5 h-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold tracking-tight">Manage Position</DialogTitle>
                        </div>
                    </div>

                    {/* PREMIUM SELECTION CARD */}
                    {snapshot && (
                      <div className="bg-muted/30 rounded-xl border border-border/40 p-4 flex items-center justify-between gap-4 mb-2">
                        {/* Left: Company Info */}
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <TickerLogo url={snapshot.ticker?.logo_url} symbol={position.symbol} className="w-12 h-12 rounded-full shadow-lg border-2 border-background flex-shrink-0" />
                          <div className="min-w-0">
                            <h3 className="text-lg font-bold text-foreground leading-none">{position.symbol}</h3>
                            <p className="text-sm text-muted-foreground font-medium truncate">{snapshot.ticker?.name || position.symbol}</p>
                            {snapshot.ticker?.industry && (
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5 uppercase tracking-wider">{snapshot.ticker.industry}</p>
                            )}
                          </div>
                        </div>

                        {/* Center: Sparkline */}
                        {snapshot.sparkline && snapshot.sparkline.length > 0 && (
                          <div className="flex flex-col items-center gap-1 flex-shrink-0">
                            <Sparkline data={snapshot.sparkline} width={100} height={32} />
                            <span className="text-[9px] text-muted-foreground/60 tracking-tighter">Last 14 days</span>
                          </div>
                        )}

                        {/* Right: Price & Change */}
                        <div className="flex flex-col items-end flex-shrink-0">
                          <div className="text-xl font-mono font-bold tracking-tight text-foreground">
                            ${(snapshot.price || snapshot.latestPrice?.close)?.toFixed(2) || '---'}
                          </div>
                          {(snapshot.change_percent !== undefined || snapshot.latestPrice?.change_percent !== undefined) && (
                            <div className={cn("text-xs font-bold flex items-center gap-0.5", (snapshot.change_percent ?? snapshot.latestPrice?.change_percent ?? 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                              {(snapshot.change_percent ?? snapshot.latestPrice?.change_percent ?? 0) >= 0 ? '+' : ''}
                              {(snapshot.change_percent ?? snapshot.latestPrice?.change_percent ?? 0).toFixed(2)}%
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 text-red-500 rounded-md text-sm flex items-center gap-2">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

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
                                                value={date ? parseISO(date) : new Date()}
                                                onChange={(d) => setDate(format(d, 'yyyy-MM-dd'))}
                                                enabledDates={ohlcData.length > 0 ? validDates : undefined}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <TabsContent value="investment" className="space-y-1.5 m-0 border-0 p-0">
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
                                        />
                                    </div>
                                    {shares && parseFloat(shares) > 0 && (
                                        <p className="text-[11px] text-primary font-medium flex items-center gap-1 mt-1">
                                            <Hash size={12} />
                                            Result: <strong>{shares}</strong> shares
                                        </p>
                                    )}
                                </TabsContent>

                                <TabsContent value="shares" className="space-y-1.5 m-0 border-0 p-0">
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
                                        />
                                    </div>
                                    {investment && parseFloat(investment) > 0 && (
                                        <p className="text-[11px] text-primary font-medium flex items-center gap-1 mt-1">
                                            <DollarSign size={12} />
                                            Result: <strong>${parseFloat(investment).toLocaleString()}</strong> total
                                        </p>
                                    )}
                                </TabsContent>
                            </div>

                            {/* Price Slider Area */}
                            <div className="space-y-2 pt-2">
                                <div className="bg-muted/10 px-3 py-1 rounded-lg border border-border/50">
                                    {ohlcData.length === 0 ? (
                                        <div className="p-12 text-center bg-muted/20 rounded-xl border border-dashed border-border/40">
                                            <AlertTriangle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                                            <p className="text-sm text-muted-foreground font-medium">Historical data unavailable</p>
                                            <p className="text-[11px] text-muted-foreground/60 mt-1">Try a different date or ticker</p>
                                        </div>
                                    ) : (
                                        <>
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
                                                className={cn("pt-0 pb-2", (!effectiveDateData) && "opacity-50 grayscale")}
                                            />
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Tabs>

                    <DialogFooter className="pt-4 border-t border-border/50 flex-col sm:flex-row gap-2">
                        <Button
                            type="button"
                            variant="destructive"
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20"
                            onClick={() => setDeleteConfirm(true)}
                        >
                            <Trash2 size={14} className="mr-2" />
                            Delete Position
                        </Button>
                        <div className="flex-1" />
                        <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            disabled={loading || !shares || !price || parseFloat(shares) <= 0}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]"
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

import { useState, useEffect, useMemo } from 'react';
import { Save, Trash2, Calendar as CalendarIcon, Loader2, AlertCircle, DollarSign, Hash, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, cn } from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { useConfirm } from '../ui/confirm';
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
    currency?: string;
    original_currency?: string;
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

interface HistoryItem {
    ts?: number;
    date?: string;
    time?: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

interface SnapshotData {
    ticker?: {
        logo_url?: string;
        name?: string;
        industry?: string;
    };
    sparkline?: number[];
    price?: number;
    latestPrice?: {
        close?: number;
        change_percent?: number;
    };
    change_percent?: number;
}

export function EditPositionDialog({ open, onOpenChange, position, onSuccess }: EditPositionDialogProps) {
    const confirm = useConfirm();
    const [shares, setShares] = useState('');
    const [price, setPrice] = useState('');
    const [investment, setInvestment] = useState('');
    const [date, setDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inputMode, setInputMode] = useState<'shares' | 'investment'>('investment');
    
    // Currency helpers. `currency` tracks the buy_price input, which is stored
    // in the position's (possibly converted) display currency. The live
    // snapshot price, however, comes from /tickers/:symbol/snapshot unconverted,
    // so it must render in the ticker's native currency.
    const currency = position?.currency || 'USD';
    const nativeCurrency = position?.original_currency || position?.currency || 'USD';
    const getCurrencySymbol = (curr: string) => {
        return (0).toLocaleString('en-US', { style: 'currency', currency: curr, minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/\d/g, '').trim();
    };
    const currencySymbol = getCurrencySymbol(currency);
    const formatNativePrice = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: nativeCurrency }).format(val);

    // OHLC Data
    const [ohlcData, setOhlcData] = useState<OhlcDataPoint[]>([]);
    const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);

    // Initialize state from position
    useEffect(() => {
        if (position && open) {
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
                const historyPromise = api.get<HistoryItem[]>(`/tickers/${position.symbol}/history`, { params: { days: 1825 } });
                const snapshotPromise = api.get<SnapshotData>(`/tickers/${position.symbol}/snapshot`).catch(() => ({ data: {} as SnapshotData }));

                const [historyRes, snapshotRes] = await Promise.all([historyPromise, snapshotPromise]);
                setSnapshot(snapshotRes.data);
                
                const combinedData = historyRes.data.map((item) => {
                    const val = item.ts || item.date || item.time;
                    let dateStr = String(val);
                    if (typeof val === 'number') {
                        dateStr = new Date(val * 1000).toISOString().split('T')[0];
                    } else if (val) {
                        try {
                            dateStr = new Date(val as string | number | Date).toISOString().split('T')[0];
                        } catch { dateStr = String(val); }
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
        // Same themed confirmation as deleting from the positions list.
        const confirmed = await confirm({
            title: `Delete ${position.symbol} position?`,
            description: 'This can’t be undone.',
            confirmLabel: 'Delete position',
            destructive: true,
        });
        if (!confirmed) return;
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] overflow-visible">
                <DialogHeader className="pb-4 pr-0">
                    <div className="mb-1 flex items-center gap-3 pr-8">
                        <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                            <Save className="w-5 h-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold tracking-tight">Manage Position</DialogTitle>
                        </div>
                    </div>

                    {/* PREMIUM SELECTION CARD */}
                    {snapshot && (
                      <div className="mb-2 flex items-center justify-between gap-4 rounded-lg bg-muted/60 p-4">
                        {/* Left: Company Info */}
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <TickerLogo url={snapshot.ticker?.logo_url} symbol={position.symbol} className="w-12 h-12 rounded-full shadow-lg flex-shrink-0" />
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-bold leading-tight text-foreground">{position.symbol}</h3>
                            <p className="text-sm text-muted-foreground font-medium truncate">{snapshot.ticker?.name || position.symbol}</p>
                            {snapshot.ticker?.industry && (
                              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{snapshot.ticker.industry}</p>
                            )}
                          </div>
                        </div>

                        {/* Center: Sparkline */}
                        {snapshot.sparkline && snapshot.sparkline.length > 0 && (
                          // Below `sm` there is no room for it beside the name and price.
                          <div className="hidden flex-shrink-0 flex-col items-center gap-1 sm:flex">
                            <Sparkline data={snapshot.sparkline} width={100} height={32} />
                            <span className="text-[11px] text-muted-foreground">Last 14 days</span>
                          </div>
                        )}

                        {/* Right: Price & Change */}
                        <div className="flex flex-col items-end flex-shrink-0">
                          <div className="text-xl font-mono font-bold tracking-tight text-foreground">
                            {formatNativePrice(snapshot.price || snapshot.latestPrice?.close || 0)}
                          </div>
                          {(snapshot.change_percent !== undefined || snapshot.latestPrice?.change_percent !== undefined) && (
                            <div className={cn("num flex items-center gap-0.5 text-xs font-semibold", (snapshot.change_percent ?? snapshot.latestPrice?.change_percent ?? 0) >= 0 ? "text-up" : "text-down")}>
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
                        <div role="alert" className="flex items-center gap-2 rounded-md bg-down/10 p-3 text-sm text-down">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    <Tabs 
                        value={inputMode} 
                        onValueChange={(v) => setInputMode(v as 'shares' | 'investment')}
                        className="w-full"
                    >
                        <TabsList className="grid w-full grid-cols-2">
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
                                                    "w-full min-w-0 justify-start bg-muted px-3 text-left font-normal h-9 [@media(max-width:767px)_and_(pointer:coarse)]:h-11",
                                                    !date && "text-muted-foreground"
                                                )}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                                                <span className="truncate">{date ? format(parseISO(date), 'PP') : 'Pick a date'}</span>
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

                                <TabsContent value="investment" className="space-y-1.5 m-0 p-0">
                                    <Label htmlFor="investment-input" className="text-xs font-bold text-muted-foreground">Investment Amount</Label>
                                    <div className="relative">
                                        <span className="num pointer-events-none absolute left-3 top-1/2 w-4 -translate-y-1/2 text-center text-sm font-bold text-muted-foreground">{currencySymbol}</span>
                                        <Input
                                            id="investment-input"
                                            type="number"
                                            step="any"
                                            required
                                            placeholder="0.00"
                                            value={investment}
                                            onChange={(e) => handleInvestmentChange(e.target.value)}
                                            className="num pl-9 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" inputMode="decimal"
                                        />
                                    </div>
                                    {shares && parseFloat(shares) > 0 && (
                                        <p className="num mt-1 min-w-0 text-xs font-medium text-primary">
                                    <span className="block truncate">= <strong>{Number(shares).toLocaleString('en-US', { maximumFractionDigits: 4 })}</strong> shares</span>
                                        </p>
                                    )}
                                </TabsContent>

                                <TabsContent value="shares" className="space-y-1.5 m-0 p-0">
                                    <Label htmlFor="shares-input" className="text-xs font-bold text-muted-foreground">Number of Shares</Label>
                                    <div className="relative">
                                        <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            id="shares-input"
                                            type="number"
                                            step="any"
                                            required
                                            placeholder="0.00"
                                            value={shares}
                                            onChange={(e) => handleSharesChange(e.target.value)}
                                            className="num pl-9 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" inputMode="decimal"
                                        />
                                    </div>
                                    {investment && parseFloat(investment) > 0 && (
                                        <p className="num mt-1 min-w-0 truncate text-xs font-medium text-primary">
                                            = <strong>{currencySymbol}{parseFloat(investment).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> total
                                        </p>
                                    )}
                                </TabsContent>
                            </div>

                            {/* Price Slider Area */}
                            <div className="space-y-2 pt-2">
                                <div className="rounded-lg bg-muted/60 px-3 py-1">
                                    {ohlcData.length === 0 ? (
                                        <div className="rounded-lg p-10 text-center">
                                            <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                                            <p className="text-sm text-muted-foreground font-medium">Historical data unavailable</p>
                                            <p className="mt-1 text-xs text-muted-foreground">Try a different date or ticker</p>
                                        </div>
                                    ) : (
                                        <>
                                            {effectiveDateData && !selectedDateData && (
                                                <div className="text-[11px] text-orange-500 pt-2 flex items-center gap-1">
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
                                                currency={currency}
                                            />
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Tabs>

                    <DialogFooter sticky className="sm:items-center">
                        <Button
                            type="button"
                            variant="ghost"
                            className="text-down hover:bg-down/10 hover:text-down max-sm:h-11 sm:mr-auto"
                            onClick={() => void handleDelete()}
                            disabled={loading}
                        >
                            <Trash2 size={14} className="mr-2" />
                            Delete Position
                        </Button>
                        <Button variant="ghost" type="button" onClick={() => onOpenChange(false)} className="max-sm:h-11">
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading || !shares || !price || parseFloat(shares) <= 0}
                            className="min-w-[120px] max-sm:h-11"
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

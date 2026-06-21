import { useState, useEffect, useMemo } from 'react';
import {
  TrendingDown,
  Calendar as CalendarIcon,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Hash,
  Coins,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, cn } from '../../lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { SimpleCalendar } from '../ui/simple-calendar';
import { TickerLogo } from '../dashboard/TickerLogo';
import { PriceRangeSlider } from './PriceRangeSlider';
import { Sparkline } from '../ui/Sparkline';
import { toast } from 'sonner';

// The position passed in comes straight from the (possibly currency-converted)
// Portfolio response. Selling always operates in the position's NATIVE currency
// — that's what the backend stores and what the SELL endpoint expects — so we
// deliberately prefer the `original_*` fields (present only when the row was
// converted to a display currency) over the converted ones.
interface SellablePosition {
  id: string;
  symbol: string;
  shares: number | string;
  buy_price: number | string;
  currency?: string;
  original_currency?: string;
  original_buy_price?: number;
  original_current_price?: number;
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
  ticker?: { logo_url?: string; name?: string; industry?: string };
  sparkline?: number[];
  price?: number;
  latestPrice?: { close?: number; change_percent?: number };
  change_percent?: number;
}

interface SellPositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: SellablePosition;
  onSuccess: () => void;
}

export function SellPositionDialog({
  open,
  onOpenChange,
  position,
  onSuccess,
}: SellPositionDialogProps) {
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ohlcData, setOhlcData] = useState<OhlcDataPoint[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);

  // Everything in this dialog is native-currency. `original_*` exist only when
  // the row was converted; fall back to the (then-native) plain fields.
  const nativeCurrency =
    position?.original_currency || position?.currency || 'USD';
  const held = Number(position?.shares) || 0;
  const nativeBuyPrice = Number(position?.original_buy_price ?? position?.buy_price) || 0;
  const nativeCurrentPrice = Number(
    position?.original_current_price ?? position?.current_price ?? 0,
  );

  const formatNative = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: nativeCurrency,
    }).format(val);
  const currencySymbol = (0)
    .toLocaleString('en-US', {
      style: 'currency',
      currency: nativeCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    .replace(/\d/g, '')
    .trim();

  // Initialise from the position each time the dialog opens. Default to selling
  // the entire lot (the most common action) at today's live price.
  useEffect(() => {
    if (position && open) {
      setShares(String(held));
      setFees('');
      setNote('');
      setDate(new Date().toISOString().split('T')[0]);
      setPrice(nativeCurrentPrice ? nativeCurrentPrice.toFixed(2) : '');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.id, open]);

  // Pull live snapshot + history so the slider has a real OHLC range and the
  // default sale price tracks the live market price.
  useEffect(() => {
    if (!position?.symbol || !open) return;

    const fetchHistory = async () => {
      try {
        const historyPromise = api.get<HistoryItem[]>(
          `/tickers/${position.symbol}/history`,
          { params: { days: 1825 } },
        );
        const snapshotPromise = api
          .get<SnapshotData>(`/tickers/${position.symbol}/snapshot`)
          .catch(() => ({ data: {} as SnapshotData }));

        const [historyRes, snapshotRes] = await Promise.all([
          historyPromise,
          snapshotPromise,
        ]);
        setSnapshot(snapshotRes.data);

        const combined = historyRes.data.map((item) => {
          const val = item.ts || item.date || item.time;
          let dateStr = String(val);
          if (typeof val === 'number') {
            dateStr = new Date(val * 1000).toISOString().split('T')[0];
          } else if (val) {
            try {
              dateStr = new Date(val as string | number | Date)
                .toISOString()
                .split('T')[0];
            } catch {
              dateStr = String(val);
            }
          }
          return {
            date: dateStr,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            median: (item.high + item.low) / 2,
          };
        });
        setOhlcData(combined);

        // Prefer the live snapshot close for the default sale price.
        const live = snapshotRes.data?.price || snapshotRes.data?.latestPrice?.close;
        if (live) {
          setPrice((prev) => (prev ? prev : Number(live).toFixed(2)));
        }
      } catch {
        // Non-fatal — the user can still type a price.
      }
    };

    fetchHistory();
  }, [position?.symbol, open]);

  const validDates = useMemo(
    () => new Set(ohlcData.map((d) => d.date).filter(Boolean)),
    [ohlcData],
  );

  const selectedDateData = useMemo(
    () => ohlcData.find((d) => d.date === date),
    [ohlcData, date],
  );

  const effectiveDateData = useMemo(() => {
    if (selectedDateData) return selectedDateData;
    if (ohlcData.length === 0 || !date) return null;
    const target = new Date(date).getTime();
    const sorted = [...ohlcData].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return sorted.find((d) => new Date(d.date).getTime() <= target) || sorted[0];
  }, [ohlcData, date, selectedDateData]);

  // --- Live P&L preview (all native) ---
  const sharesNum = parseFloat(shares) || 0;
  const priceNum = parseFloat(price) || 0;
  const feesNum = parseFloat(fees) || 0;
  const gross = sharesNum * priceNum;
  const proceeds = Math.max(0, gross - feesNum);
  const costBasis = sharesNum * nativeBuyPrice;
  const realizedPnl = proceeds - costBasis;
  const isProfit = realizedPnl >= 0;
  const remainingShares = Math.max(0, held - sharesNum);

  // Allow a tiny epsilon so "sell all" via the Max button isn't blocked by
  // floating-point representation of the held amount.
  const oversold = sharesNum > held + 1e-9;
  const canSubmit =
    !loading && sharesNum > 0 && priceNum > 0 && !oversold;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        shares: sharesNum,
        price: priceNum,
        sell_date: date,
      };
      if (feesNum > 0) payload.fees = feesNum;
      if (note.trim()) payload.note = note.trim();

      const { data } = await api.post(
        `/portfolio/positions/${position.id}/sell`,
        payload,
      );

      const realized = Number(data?.realized_pnl ?? realizedPnl);
      const got = Number(data?.proceeds ?? proceeds);
      toast.success(
        `Sold ${sharesNum} ${position.symbol} for ${formatNative(got)}`,
        {
          description: `Realized P&L ${realized >= 0 ? '+' : ''}${formatNative(realized)} · credited to ${nativeCurrency} cash`,
        },
      );
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const e2 = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      const msg =
        e2.response?.data?.message || e2.message || 'Failed to sell position';
      setError(msg);
      toast.error('Failed to sell position');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] overflow-visible">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shadow-sm border border-rose-500/20">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Sell Position
              </DialogTitle>
              <DialogDescription className="text-xs">
                Proceeds are credited to your {nativeCurrency} cash balance.
              </DialogDescription>
            </div>
          </div>

          {/* Position summary card */}
          <div className="bg-muted/30 rounded-xl border border-border/40 p-4 flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <TickerLogo
                url={snapshot?.ticker?.logo_url}
                symbol={position.symbol}
                className="w-12 h-12 rounded-full shadow-lg border-2 border-background flex-shrink-0"
              />
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-foreground leading-none">
                  {position.symbol}
                </h3>
                <p className="text-sm text-muted-foreground font-medium truncate">
                  {snapshot?.ticker?.name || position.symbol}
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Holding{' '}
                  <strong className="text-foreground/80">{held}</strong> sh · Avg{' '}
                  {formatNative(nativeBuyPrice)}
                </p>
              </div>
            </div>

            {snapshot?.sparkline && snapshot.sparkline.length > 0 && (
              <div className="hidden sm:flex flex-col items-center gap-1 flex-shrink-0">
                <Sparkline data={snapshot.sparkline} width={90} height={30} />
                <span className="text-[9px] text-muted-foreground/60 tracking-tighter">
                  Last 14 days
                </span>
              </div>
            )}

            <div className="flex flex-col items-end flex-shrink-0">
              <div className="text-lg font-mono font-bold tracking-tight text-foreground">
                {formatNative(
                  snapshot?.price || snapshot?.latestPrice?.close || nativeCurrentPrice,
                )}
              </div>
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">
                Live
              </span>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {error && (
            <div className="p-3 bg-red-500/10 text-red-500 rounded-md text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Shares to sell */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="sell-shares" className="text-xs font-bold text-muted-foreground">
                  Shares to Sell
                </Label>
                <button
                  type="button"
                  onClick={() => setShares(String(held))}
                  className="text-[10px] font-bold text-primary hover:underline"
                >
                  MAX {held}
                </button>
              </div>
              <div className="relative">
                <Hash className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="sell-shares"
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="pl-9 font-mono bg-muted/20"
                />
              </div>
              {oversold ? (
                <p className="text-[11px] text-red-500 font-medium flex items-center gap-1">
                  <AlertTriangle size={11} /> Only {held} held
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Remaining: <strong>{remainingShares}</strong> sh
                </p>
              )}
            </div>

            {/* Sale date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">Sale Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    type="button"
                    className={cn(
                      'w-full justify-start text-left font-normal bg-muted/10 h-10',
                      !date && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {date ? format(parseISO(date), 'PP') : <span>Pick a date</span>}
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
          </div>

          {/* Price slider */}
          <div className="bg-muted/10 px-3 py-1 rounded-lg border border-border/50">
            {ohlcData.length === 0 ? (
              <div className="py-2">
                <Label htmlFor="sell-price" className="text-xs font-bold text-muted-foreground">
                  Sale Price
                </Label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3 top-2.5 text-sm text-muted-foreground font-bold font-mono w-4 text-center">
                    {currencySymbol}
                  </span>
                  <Input
                    id="sell-price"
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="pl-9 font-mono bg-muted/20"
                  />
                </div>
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
                  value={priceNum || effectiveDateData?.close || 0}
                  onChange={(val) => setPrice(val.toFixed(2))}
                  className={cn('pt-0 pb-2', !effectiveDateData && 'opacity-50 grayscale')}
                  currency={nativeCurrency}
                />
              </>
            )}
          </div>

          {/* Fees (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="sell-fees" className="text-xs font-bold text-muted-foreground">
              Fees <span className="font-normal text-muted-foreground/60">(optional)</span>
            </Label>
            <div className="relative">
              <Coins className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="sell-fees"
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                className="pl-9 font-mono bg-muted/20"
              />
            </div>
          </div>

          {/* P&L preview */}
          <div className="rounded-xl border border-border/50 bg-card/60 divide-y divide-border/40">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-muted-foreground">Gross proceeds</span>
              <span className="text-sm font-mono font-semibold text-foreground">
                {formatNative(proceeds)}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-muted-foreground">Cost basis</span>
              <span className="text-sm font-mono text-muted-foreground">
                {formatNative(costBasis)}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-muted/20 rounded-b-xl">
              <span className="text-xs font-bold text-foreground">Realized P&amp;L</span>
              <span
                className={cn(
                  'text-base font-mono font-bold',
                  isProfit ? 'text-emerald-500' : 'text-rose-500',
                )}
              >
                {isProfit ? '+' : ''}
                {formatNative(realizedPnl)}
              </span>
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-border/50 flex-col sm:flex-row gap-2">
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="bg-rose-600 hover:bg-rose-700 text-white min-w-[140px]"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TrendingDown className="mr-2 h-4 w-4" />
              )}
              Sell {position.symbol}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useMemo } from 'react';
import {
  ShoppingCart,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Hash,
  Coins,
  Clock,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
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
import { TickerLogo } from '../dashboard/TickerLogo';
import { Sparkline } from '../ui/Sparkline';
import { toast } from 'sonner';
import { useTickerMarketStatus } from '../../hooks/useMarketStatus';
import type { CashBalance } from './CashDialog';

// Buying MORE of a position always executes in the position's NATIVE currency —
// what the backend stores and funds from — so we prefer the `original_*` fields
// (present only when the row was converted to a display currency).
interface BuyablePosition {
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

interface SnapshotData {
  ticker?: { logo_url?: string; name?: string; industry?: string };
  sparkline?: number[];
  price?: number;
  latestPrice?: { close?: number; change_percent?: number };
  change_percent?: number;
}

interface BuyAtMarketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: BuyablePosition;
  onSuccess: () => void;
  /** Simulator cash balances, used to show buying power in the native currency. */
  cashBalances?: CashBalance[];
  /** Opens the cash dialog pre-set to the given currency (deposit shortcut). */
  onRequestDeposit?: (currency: string) => void;
}

const marketLabel = (region?: string): string => {
  if (region === 'EU') return 'The European market';
  if (region === 'ASIA') return 'The Asian market';
  if (region === 'US') return 'The US market';
  return 'The market';
};

export function BuyAtMarketDialog({
  open,
  onOpenChange,
  position,
  onSuccess,
  cashBalances = [],
  onRequestDeposit,
}: BuyAtMarketDialogProps) {
  const [shares, setShares] = useState('');
  const [fees, setFees] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);

  // Everything here is native-currency. `original_*` exist only when the row was
  // converted; fall back to the (then-native) plain fields.
  const nativeCurrency =
    position?.original_currency || position?.currency || 'USD';
  const held = Number(position?.shares) || 0;
  const nativeBuyPrice =
    Number(position?.original_buy_price ?? position?.buy_price) || 0;
  const fallbackPrice = Number(
    position?.original_current_price ?? position?.current_price ?? 0,
  );

  // Live market-hours status for this symbol. Closed → the buy is queued.
  const { data: marketStatus } = useTickerMarketStatus(position?.symbol, open);
  const isClosed = marketStatus ? !marketStatus.isOpen : false;

  const formatNative = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: nativeCurrency,
    }).format(val);

  // The live price the order will execute at (native currency).
  const livePrice = useMemo(() => {
    const live = snapshot?.price || snapshot?.latestPrice?.close;
    return Number(live) || fallbackPrice;
  }, [snapshot, fallbackPrice]);

  const changePct =
    snapshot?.change_percent ?? snapshot?.latestPrice?.change_percent ?? 0;

  // Reset on open.
  useEffect(() => {
    if (position && open) {
      setShares('');
      setFees('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.id, open]);

  // Pull the live snapshot so the displayed price + cost track the market.
  useEffect(() => {
    if (!position?.symbol || !open) return;
    let cancelled = false;
    api
      .get<SnapshotData>(`/tickers/${position.symbol}/snapshot`)
      .then(({ data }) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch(() => {
        /* Non-fatal — fall back to the position's last known price. */
      });
    return () => {
      cancelled = true;
    };
  }, [position?.symbol, open]);

  const sharesNum = parseFloat(shares) || 0;
  const feesNum = parseFloat(fees) || 0;
  const estCost = sharesNum > 0 ? sharesNum * livePrice + feesNum : 0;

  const buyingPower = useMemo(
    () => cashBalances.find((b) => b.currency === nativeCurrency)?.amount ?? 0,
    [cashBalances, nativeCurrency],
  );
  const insufficientCash = estCost > buyingPower + 1e-9;
  const errorIsInsufficient = !!error && /insufficient|deposit cash/i.test(error);

  const canSubmit =
    !loading && sharesNum > 0 && livePrice > 0 && !insufficientCash;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { shares: sharesNum };
      if (feesNum > 0) payload.fees = feesNum;

      const { data } = await api.post(
        `/portfolio/positions/${position.id}/buy`,
        payload,
      );

      if (data?.status === 'pending') {
        toast.success(`Buy order queued for ${position.symbol}`, {
          description: `${sharesNum} sh will fill at the market price when ${marketLabel(
            marketStatus?.region,
          ).toLowerCase()} reopens.`,
        });
      } else {
        const cost = Number(data?.cost ?? estCost);
        toast.success(
          `Bought ${sharesNum} ${position.symbol} for ${formatNative(cost)}`,
          { description: `Funded from your ${nativeCurrency} cash balance.` },
        );
      }
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const e2 = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      const msg =
        e2.response?.data?.message || e2.message || 'Failed to buy shares';
      setError(msg);
      toast.error('Failed to buy shares');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] overflow-visible">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm border border-blue-500/20">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Buy at Market
              </DialogTitle>
              <DialogDescription className="text-xs">
                Funded from your {nativeCurrency} cash balance at the live price.
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
                  Holding <strong className="text-foreground/80">{held}</strong>{' '}
                  sh · Avg {formatNative(nativeBuyPrice)}
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
                {formatNative(livePrice)}
              </div>
              <span
                className={cn(
                  'text-[10px] font-bold flex items-center gap-0.5',
                  changePct >= 0 ? 'text-emerald-500' : 'text-red-500',
                )}
              >
                {changePct >= 0 ? (
                  <TrendingUp size={10} />
                ) : (
                  <TrendingDown size={10} />
                )}
                {changePct >= 0 ? '+' : ''}
                {changePct.toFixed(2)}%
              </span>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {error && (
            <div className="p-3 bg-red-500/10 text-red-500 rounded-md text-sm flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p>{error}</p>
                {errorIsInsufficient && onRequestDeposit && (
                  <button
                    type="button"
                    onClick={() => onRequestDeposit(nativeCurrency)}
                    className="mt-1 font-bold text-blue-500 hover:underline"
                  >
                    Deposit {nativeCurrency} cash →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Market-closed → queued order notice */}
          {isClosed && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
              <Clock size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                {marketLabel(marketStatus?.region)} is closed. This buy will be{' '}
                <strong>queued</strong> and filled automatically at the market
                price when it reopens.
              </span>
            </div>
          )}

          {/* Shares to buy */}
          <div className="space-y-1.5">
            <Label
              htmlFor="buy-shares"
              className="text-xs font-bold text-muted-foreground"
            >
              Shares to Buy
            </Label>
            <div className="relative">
              <Hash className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="buy-shares"
                type="number"
                step="any"
                required
                autoFocus
                placeholder="0.00"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className="pl-9 font-mono bg-muted/20"
              />
            </div>
          </div>

          {/* Fees (optional) */}
          <div className="space-y-1.5">
            <Label
              htmlFor="buy-fees"
              className="text-xs font-bold text-muted-foreground"
            >
              Fees{' '}
              <span className="font-normal text-muted-foreground/60">
                (optional)
              </span>
            </Label>
            <div className="relative">
              <Coins className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="buy-fees"
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

          {/* Cost preview */}
          <div className="rounded-xl border border-border/50 bg-card/60 divide-y divide-border/40">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-muted-foreground">
                {isClosed ? 'Est. cost' : 'Estimated cost'}
              </span>
              <span className="text-sm font-mono font-semibold text-foreground">
                {formatNative(estCost)}
              </span>
            </div>
            <div
              className={cn(
                'flex items-center justify-between px-4 py-2.5',
                insufficientCash && 'bg-amber-500/5',
              )}
            >
              <span className="text-xs text-muted-foreground">
                {nativeCurrency} buying power
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-sm font-mono',
                    insufficientCash
                      ? 'text-amber-500 font-semibold'
                      : 'text-muted-foreground',
                  )}
                >
                  {formatNative(buyingPower)}
                </span>
                {insufficientCash && onRequestDeposit && (
                  <button
                    type="button"
                    onClick={() => onRequestDeposit(nativeCurrency)}
                    className="text-xs font-bold text-blue-500 hover:underline"
                  >
                    Deposit
                  </button>
                )}
              </span>
            </div>
          </div>

          {insufficientCash && estCost > 0 && (
            <p className="text-[11px] text-amber-500 font-medium flex items-center gap-1 -mt-2">
              <AlertTriangle size={11} /> Not enough {nativeCurrency} cash —
              deposit {formatNative(estCost - buyingPower)} more.
            </p>
          )}

          <DialogFooter className="pt-2 border-t border-border/50 flex-col sm:flex-row gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="bg-blue-600 hover:bg-blue-700 text-white min-w-[150px]"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isClosed ? (
                <Clock className="mr-2 h-4 w-4" />
              ) : (
                <ShoppingCart className="mr-2 h-4 w-4" />
              )}
              {isClosed ? 'Queue Buy' : `Buy ${position.symbol}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

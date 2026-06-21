import { useEffect, useState, useCallback } from 'react';
import {
  History,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Inbox,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { api, cn } from '../../lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';

// Trade rows come straight off the entity; Postgres decimal columns arrive as
// strings, so every numeric field is coerced with Number() before display.
interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  shares: string | number;
  price: string | number;
  total_value: string | number;
  fees: string | number;
  realized_pnl: string | number | null;
  currency: string;
  trade_date: string;
  source: string;
  note?: string | null;
}

interface TradeHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Restrict history to a single symbol when provided. */
  symbol?: string;
}

const fmt = (val: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);

const fmtDate = (d: string) => {
  try {
    const parsed = parseISO(d);
    return isValid(parsed) ? format(parsed, 'PP') : d;
  } catch {
    return d;
  }
};

export function TradeHistoryDialog({
  open,
  onOpenChange,
  symbol,
}: TradeHistoryDialogProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Trade[]>('/portfolio/trades', {
        params: { ...(symbol ? { symbol } : {}), limit: 200 },
      });
      setTrades(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load trade history');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-sm border border-primary/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Trade History{symbol ? ` — ${symbol}` : ''}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Every buy and sell, including trades consolidated from other apps.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : error ? (
          <div className="py-16 text-center text-red-500 text-sm">{error}</div>
        ) : trades.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center text-muted-foreground">
            <Inbox className="h-8 w-8 mb-3 opacity-40" />
            <p className="text-sm font-medium">No trades yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Buy or sell a position to start your trade ledger.
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
                  <th className="text-left font-semibold px-3 py-2.5">Date</th>
                  <th className="text-left font-semibold px-3 py-2.5">Symbol</th>
                  <th className="text-left font-semibold px-3 py-2.5">Side</th>
                  <th className="text-right font-semibold px-3 py-2.5">Shares</th>
                  <th className="text-right font-semibold px-3 py-2.5 hidden sm:table-cell">Price</th>
                  <th className="text-right font-semibold px-3 py-2.5">Total</th>
                  <th className="text-right font-semibold px-3 py-2.5">P&amp;L</th>
                  <th className="text-right font-semibold px-3 py-2.5 hidden md:table-cell">Source</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => {
                  const isBuy = t.side === 'buy';
                  const pnl = t.realized_pnl == null ? null : Number(t.realized_pnl);
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                        {fmtDate(t.trade_date)}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-foreground">{t.symbol}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold',
                            isBuy
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-rose-500/10 text-rose-500',
                          )}
                        >
                          {isBuy ? <ArrowDownToLine size={11} /> : <ArrowUpFromLine size={11} />}
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {Number(t.shares)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground hidden sm:table-cell">
                        {fmt(Number(t.price), t.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-medium">
                        {fmt(Number(t.total_value), t.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {pnl == null ? (
                          <span className="text-muted-foreground/50">—</span>
                        ) : (
                          <span className={pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                            {pnl >= 0 ? '+' : ''}
                            {fmt(pnl, t.currency)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right hidden md:table-cell">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 bg-muted/40 px-1.5 py-0.5 rounded">
                          {t.source}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

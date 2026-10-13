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
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { EmptyState } from '../ui/empty-state';
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

function SideStamp({ isBuy }: { isBuy: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold',
        isBuy ? 'bg-up/10 text-up' : 'bg-down/10 text-down',
      )}
    >
      {isBuy ? <ArrowDownToLine size={11} aria-hidden /> : <ArrowUpFromLine size={11} aria-hidden />}
      {isBuy ? 'BUY' : 'SELL'}
    </span>
  );
}

export function TradeHistoryDialog({
  open,
  onOpenChange,
  symbol,
}: TradeHistoryDialogProps) {
  // Below `sm` the dialog is a phone sheet: rows instead of a table.
  const phone = useMediaQuery('(max-width: 639.98px)');
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
    <Dialog open={open} onOpenChange={onOpenChange} className="sm:max-w-[820px]">
      <DialogContent>
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
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
          <EmptyState role="alert" className="py-12" title={error} />
        ) : trades.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={<Inbox className="h-5 w-5" />}
            title="No trades yet"
            description="Buy or sell a position to start your trade ledger."
          />
        ) : phone ? (
          // Phones: each trade is a two-line row — no sideways-scrolling table.
          <ul className="space-y-1.5">
            {trades.map((t) => {
              const isBuy = t.side === 'buy';
              const pnl = t.realized_pnl == null ? null : Number(t.realized_pnl);
              return (
                <li key={t.id} className="rounded-md bg-muted/60 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <SideStamp isBuy={isBuy} />
                      <span className="truncate text-sm font-semibold text-foreground">{t.symbol}</span>
                    </span>
                    <span className="num shrink-0 text-sm font-semibold text-foreground">
                      {fmt(Number(t.total_value), t.currency)}
                    </span>
                  </div>
                  <div className="num mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">
                      {fmtDate(t.trade_date)} · {Number(t.shares)} sh @ {fmt(Number(t.price), t.currency)}
                    </span>
                    {pnl != null && (
                      <span className={cn('shrink-0 font-medium', pnl >= 0 ? 'text-up' : 'text-down')}>
                        {pnl >= 0 ? '+' : '−'}
                        {fmt(Math.abs(pnl), t.currency)}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-popover">
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
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
                      className="transition-colors hover:bg-muted/60"
                    >
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                        {fmtDate(t.trade_date)}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-foreground">{t.symbol}</td>
                      <td className="px-3 py-2.5">
                        <SideStamp isBuy={isBuy} />
                      </td>
                      <td className="px-3 py-2.5 text-right num">
                        {Number(t.shares)}
                      </td>
                      <td className="px-3 py-2.5 text-right num text-muted-foreground hidden sm:table-cell">
                        {fmt(Number(t.price), t.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right num font-medium">
                        {fmt(Number(t.total_value), t.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right num">
                        {pnl == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={pnl >= 0 ? 'text-up' : 'text-down'}>
                            {pnl >= 0 ? '+' : ''}
                            {fmt(pnl, t.currency)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right hidden md:table-cell">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
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

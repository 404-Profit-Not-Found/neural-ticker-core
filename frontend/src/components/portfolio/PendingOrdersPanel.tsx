import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  Clock,
  X,
  AlertTriangle,
  ShoppingCart,
  Banknote,
  Loader2,
} from 'lucide-react';
import { TickerLogo } from '../dashboard/TickerLogo';

export interface PendingOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  shares: number | string;
  currency: string;
  status: 'pending' | 'filled' | 'cancelled' | 'failed';
  region?: string | null;
  requested_price?: number | string | null;
  fees?: number | string;
  note?: string | null;
  attempts?: number;
  filled_at?: string | null;
  filled_price?: number | string | null;
  error?: string | null;
  created_at: string;
}

interface PendingOrdersPanelProps {
  /** Called after a successful cancel so the page can refetch holdings/cash. */
  onChanged?: () => void;
}

const PENDING_ORDERS_KEY = ['portfolio-pending-orders'];

const fmt = (val: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(val);
  } catch {
    return `${val.toFixed(2)} ${currency}`;
  }
};

const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
};

function OrderRow({
  order,
  onChanged,
}: {
  order: PendingOrder;
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);

  const isBuy = order.side === 'buy';
  const isPending = order.status === 'pending';
  const isFailed = order.status === 'failed';
  const shares = Number(order.shares) || 0;
  const reqPrice =
    order.requested_price != null ? Number(order.requested_price) : null;

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.delete(`/portfolio/pending-orders/${order.id}`);
      toast.success(`Cancelled queued ${order.side} of ${order.symbol}`);
      void queryClient.invalidateQueries({ queryKey: PENDING_ORDERS_KEY });
      onChanged?.();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40 bg-card/40">
      <TickerLogo
        symbol={order.symbol}
        className="w-8 h-8 rounded-full border border-border/50 flex-shrink-0"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide',
              isBuy
                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
            )}
          >
            {isBuy ? <ShoppingCart size={10} /> : <Banknote size={10} />}
            {order.side}
          </span>
          <span className="font-bold text-sm text-foreground">
            {order.symbol}
          </span>
          <span className="text-xs text-muted-foreground">
            {shares} sh
            {reqPrice != null && (
              <span className="text-muted-foreground/60">
                {' '}
                · ≈ {fmt(reqPrice, order.currency)}
              </span>
            )}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground/70">
          {relativeTime(order.created_at)}
          {isFailed && order.error && (
            <span className="text-red-500"> · {order.error}</span>
          )}
        </div>
      </div>

      {isPending ? (
        <>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex-shrink-0">
            <Clock size={11} />
            Queued
          </span>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0 disabled:opacity-50"
            title="Cancel queued order"
          >
            {cancelling ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <X size={14} />
            )}
          </button>
        </>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-red-500/10 text-red-500 border border-red-500/30 flex-shrink-0">
          <AlertTriangle size={11} />
          Failed
        </span>
      )}
    </div>
  );
}

/**
 * Surfaces market-hours-queued orders (placed while the market was closed) plus
 * recently failed ones. Filled/cancelled orders fall off — their outcome lives in
 * the position + trade history. Self-polls so a queued order visibly flips once
 * the cron filler runs at the next market open.
 */
export function PendingOrdersPanel({ onChanged }: PendingOrdersPanelProps) {
  const { data: orders = [] } = useQuery<PendingOrder[]>({
    queryKey: PENDING_ORDERS_KEY,
    queryFn: async () => {
      const { data } = await api.get('/portfolio/pending-orders');
      return data;
    },
    refetchInterval: 20000,
    staleTime: 10000,
  });

  // Only the actionable/important states: still-queued + recently failed.
  const visible = useMemo(
    () =>
      orders.filter((o) => o.status === 'pending' || o.status === 'failed'),
    [orders],
  );

  const pendingCount = useMemo(
    () => visible.filter((o) => o.status === 'pending').length,
    [visible],
  );

  if (visible.length === 0) return null;

  return (
    <div className="border border-amber-500/20 rounded-xl bg-amber-500/[0.03] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-500/15">
        <Clock size={15} className="text-amber-500" />
        <h3 className="text-sm font-bold text-foreground">Queued Orders</h3>
        {pendingCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {pendingCount} waiting for market open
          </span>
        )}
      </div>
      <div className="p-3 space-y-2">
        {visible.map((order) => (
          <OrderRow key={order.id} order={order} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

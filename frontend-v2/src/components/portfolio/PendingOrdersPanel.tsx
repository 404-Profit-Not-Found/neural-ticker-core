import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import {
  Clock,
  X,
  AlertTriangle,
  ShoppingCart,
  Banknote,
  Loader2,
} from 'lucide-react';
import { TickerLogo } from '../dashboard/TickerLogo';
import { Badge } from '../ui/badge';
import { Panel, PanelBody, PanelHeader } from '../ui/panel';
import { useConfirm } from '../ui/confirm';

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
  const confirm = useConfirm();
  const [cancelling, setCancelling] = useState(false);

  const isBuy = order.side === 'buy';
  const isPending = order.status === 'pending';
  const isFailed = order.status === 'failed';
  const shares = Number(order.shares) || 0;
  const reqPrice =
    order.requested_price != null ? Number(order.requested_price) : null;

  const handleCancel = async () => {
    const confirmed = await confirm({
      title: `Cancel queued ${order.side} of ${order.symbol}?`,
      description: 'The order is removed from the queue and will not be filled.',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      destructive: true,
    });
    if (!confirmed) return;
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
    <li className="flex items-start gap-3 rounded-md bg-muted/60 px-3 py-2.5">
      <TickerLogo symbol={order.symbol} className="mt-0.5 h-8 w-8 shrink-0" />

      {/* Two lines, each free to wrap: nothing here can run into the status. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant={isBuy ? 'invited' : 'success'} className="h-5 gap-1 px-1.5 text-[11px] uppercase">
            {isBuy ? <ShoppingCart size={11} aria-hidden /> : <Banknote size={11} aria-hidden />}
            {order.side}
          </Badge>
          <span className="text-sm font-semibold text-foreground">{order.symbol}</span>
        </div>
        {/* Whole facts wrap as units — never "5 sh ·" with the rest on the next line. */}
        <p className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs leading-snug text-muted-foreground">
          <span className="whitespace-nowrap">{shares} sh</span>
          {reqPrice != null && <span className="whitespace-nowrap">≈ {fmt(reqPrice, order.currency)}</span>}
          <span className="whitespace-nowrap font-sans">{relativeTime(order.created_at)}</span>
        </p>
        {isFailed && order.error && (
          <p className="mt-1 text-xs leading-snug text-down">{order.error}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isPending ? (
          <>
            <Badge variant="waitlist" className="h-6 gap-1 px-2 text-[11px]">
              <Clock size={11} aria-hidden />
              Queued
            </Badge>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="-my-1.5 -mr-2 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-down/10 hover:text-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              title="Cancel queued order"
              aria-label={`Cancel queued ${order.side} of ${order.symbol}`}
            >
              {cancelling ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
            </button>
          </>
        ) : (
          <Badge variant="statusBanned" className="h-6 gap-1 px-2 text-[11px]">
            <AlertTriangle size={11} aria-hidden />
            Failed
          </Badge>
        )}
      </div>
    </li>
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
      (Array.isArray(orders) ? orders : []).filter((o) => o.status === 'pending' || o.status === 'failed'),
    [orders],
  );

  const pendingCount = useMemo(
    () => visible.filter((o) => o.status === 'pending').length,
    [visible],
  );

  if (visible.length === 0) return null;

  return (
    <Panel>
      <PanelHeader
        title="Queued orders"
        led={pendingCount > 0 ? 'signal' : 'down'}
        actions={
          pendingCount > 0 ? (
            <span className="text-xs text-muted-foreground">{pendingCount} waiting for market open</span>
          ) : undefined
        }
      />
      <PanelBody className="pt-0">
        <ul className="space-y-1.5">
          {visible.map((order) => (
            <OrderRow key={order.id} order={order} onChanged={onChanged} />
          ))}
        </ul>
      </PanelBody>
    </Panel>
  );
}

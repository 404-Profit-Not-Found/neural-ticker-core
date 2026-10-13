import { Link } from 'react-router-dom';
import { usePriceAlerts, useDeletePriceAlert, useTogglePriceAlert } from '../../hooks/usePriceAlerts';
import type { PriceAlert } from '../../hooks/usePriceAlerts';
import { useCurrency } from '../../context/CurrencyContext';
import { toast } from 'sonner';
import { Bell, BellOff, Trash2, TrendingUp, TrendingDown, Percent } from 'lucide-react';
import { TickerLogo } from '../dashboard/TickerLogo';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import { useConfirm } from '../ui/confirm';
import { formatRelative } from '../../lib/datetime';
import { cn } from '../../lib/utils';

const ALERT_TYPE_CONFIG: Record<PriceAlert['alert_type'], { label: string; icon: typeof TrendingUp; color: string }> = {
  price_above: { label: 'Above', icon: TrendingUp, color: 'text-up' },
  price_below: { label: 'Below', icon: TrendingDown, color: 'text-down' },
  percent_change_up: { label: 'Up', icon: Percent, color: 'text-up' },
  percent_change_down: { label: 'Down', icon: Percent, color: 'text-down' },
};

function cooldownLabel(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

interface PriceAlertsListProps {
  /** Opens the "new alert" flow; shown in the empty state. */
  onCreate?: () => void;
}

export function PriceAlertsList({ onCreate }: PriceAlertsListProps) {
  const { data: alerts, isLoading, isError, refetch } = usePriceAlerts();
  const deleteAlert = useDeletePriceAlert();
  const toggleAlert = useTogglePriceAlert();
  const { formatNative } = useCurrency();
  const confirm = useConfirm();

  const describe = (alert: PriceAlert): string => {
    const config = ALERT_TYPE_CONFIG[alert.alert_type];
    const isPercent = alert.alert_type.startsWith('percent');
    return isPercent
      ? `${config.label} ${Number(alert.target_value).toFixed(1)}%`
      : `${config.label} ${formatNative(alert.target_value, alert.ticker?.currency || 'USD')}`;
  };

  const handleDelete = async (alert: PriceAlert) => {
    const confirmed = await confirm({
      title: `Delete this ${alert.symbol} alert?`,
      description: `“${describe(alert)}” will stop notifying you.`,
      confirmLabel: 'Delete alert',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteAlert.mutateAsync(alert.id);
      toast.success(`Alert for ${alert.symbol} deleted`);
    } catch {
      toast.error('Failed to delete alert');
    }
  };

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    try {
      await toggleAlert.mutateAsync({ id, enabled: !currentEnabled });
      toast.success(currentEnabled ? 'Alert paused' : 'Alert resumed');
    } catch {
      toast.error('Failed to update alert');
    }
  };

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading alerts" className="space-y-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex min-h-[4.5rem] items-center gap-3 rounded-lg bg-card px-3.5 py-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // A failed load is not "no alerts".
  if (isError && !alerts) {
    return (
      <EmptyState
        role="alert"
        className="rounded-lg bg-card py-14"
        title="Couldn’t load your alerts"
        description="We couldn’t reach the server. Your alerts are still active."
        action={<Button className="h-11 lg:h-10" onClick={() => void refetch()}>Try again</Button>}
      />
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <EmptyState
        className="rounded-lg bg-card py-14"
        icon={<Bell size={18} />}
        title="No price alerts"
        description="Get notified when a price hits your target or moves by a percentage."
        action={onCreate ? <Button className="h-11 lg:h-10" onClick={onCreate}>New alert</Button> : undefined}
      />
    );
  }

  return (
    <ul className="space-y-1.5" aria-label="Price alerts">
      {alerts.map((alert) => {
        const config = ALERT_TYPE_CONFIG[alert.alert_type];
        const Icon = config.icon;
        const isPercent = alert.alert_type.startsWith('percent');
        const currency = alert.ticker?.currency || 'USD';
        const to = `/ticker/${encodeURIComponent(alert.symbol)}`;

        return (
          <li key={alert.id} className="flex items-stretch overflow-hidden rounded-lg bg-card">
            <Link
              to={to}
              className="flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-3 py-3 pl-3.5 pr-1 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <TickerLogo url={alert.ticker?.logo_url} symbol={alert.symbol} className="h-10 w-10 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[15px] font-semibold leading-tight text-foreground">{alert.symbol}</span>
                  {/* State is a labelled stamp — never a dimmed row. */}
                  {!alert.enabled && <Badge variant="outline" className="h-5 px-1.5 text-[11px]">Paused</Badge>}
                  {alert.triggered_at && (
                    <Badge variant="waitlist" className="h-5 px-1.5 text-[11px]">Fired {formatRelative(alert.triggered_at)}</Badge>
                  )}
                </span>
                <span className="num mt-1 flex items-center gap-1.5 text-[13px] leading-snug text-foreground">
                  <Icon size={14} className={cn('shrink-0', config.color)} aria-hidden />
                  <span className="truncate">{describe(alert)}</span>
                </span>
                <span className="mt-1 block truncate text-xs leading-none text-muted-foreground">
                  {isPercent && alert.reference_price != null && (
                    <>from <span className="num">{formatNative(alert.reference_price, currency)}</span> · </>
                  )}
                  at most every <span className="num">{cooldownLabel(alert.cooldown_minutes)}</span>
                </span>
              </span>
            </Link>

            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => handleToggle(alert.id, alert.enabled)}
                className="flex h-full min-h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                title={alert.enabled ? 'Pause alert' : 'Resume alert'}
                aria-label={`${alert.enabled ? 'Pause' : 'Resume'} ${alert.symbol} alert: ${describe(alert)}`}
                aria-pressed={!alert.enabled}
              >
                {alert.enabled ? <Bell size={16} /> : <BellOff size={16} />}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(alert)}
                className="flex h-full min-h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-down/10 hover:text-down focus-visible:bg-down/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                title="Delete alert"
                aria-label={`Delete ${alert.symbol} alert: ${describe(alert)}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

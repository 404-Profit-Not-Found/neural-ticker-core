import { usePriceAlerts, useDeletePriceAlert, useTogglePriceAlert } from '../../hooks/usePriceAlerts';
import type { PriceAlert } from '../../hooks/usePriceAlerts';
import { toast } from 'sonner';
import {
  Bell,
  BellOff,
  Trash2,
  TrendingUp,
  TrendingDown,
  Percent,
  Clock,
} from 'lucide-react';
import { TickerLogo } from '../dashboard/TickerLogo';

const ALERT_TYPE_CONFIG: Record<PriceAlert['alert_type'], { label: string; icon: typeof TrendingUp; color: string }> = {
  price_above: { label: 'Above', icon: TrendingUp, color: 'text-green-500' },
  price_below: { label: 'Below', icon: TrendingDown, color: 'text-red-500' },
  percent_change_up: { label: '% Up', icon: Percent, color: 'text-green-500' },
  percent_change_down: { label: '% Down', icon: Percent, color: 'text-red-500' },
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

export function PriceAlertsList() {
  const { data: alerts, isLoading } = usePriceAlerts();
  const deleteAlert = useDeletePriceAlert();
  const toggleAlert = useTogglePriceAlert();

  const handleDelete = async (id: string, symbol: string) => {
    try {
      await deleteAlert.mutateAsync(id);
      toast.success(`Alert for ${symbol} deleted`);
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
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-card border border-border animate-pulse" />
        ))}
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Bell size={40} className="text-muted-foreground/30 mb-3" />
        <h3 className="text-lg font-medium text-foreground">No price alerts</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Create alerts from any ticker page to get notified when prices hit your targets.
        </p>
      </div>
    );
  }

  // Group alerts by symbol
  const grouped = alerts.reduce<Record<string, PriceAlert[]>>((acc, alert) => {
    if (!acc[alert.symbol]) acc[alert.symbol] = [];
    acc[alert.symbol].push(alert);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([symbol, symbolAlerts]) => (
        <div key={symbol} className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Symbol Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/50">
            <TickerLogo symbol={symbol} className="w-6 h-6" />
            <span className="font-semibold text-sm text-foreground">{symbol}</span>
            <span className="text-xs text-muted-foreground">
              {symbolAlerts.length} alert{symbolAlerts.length > 1 ? 's' : ''}
            </span>
          </div>

          {/* Alert Rows */}
          {symbolAlerts.map((alert) => {
            const config = ALERT_TYPE_CONFIG[alert.alert_type];
            const Icon = config.icon;
            const isPercent = alert.alert_type.startsWith('percent');

            return (
              <div
                key={alert.id}
                className={`flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-0 transition-opacity ${
                  !alert.enabled ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-muted ${config.color}`}>
                    <Icon size={14} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {config.label}{' '}
                        {isPercent
                          ? `${alert.target_value.toFixed(1)}%`
                          : `$${alert.target_value.toFixed(2)}`}
                      </span>
                      {alert.triggered_at && (
                        <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full font-medium">
                          Fired {formatTimeAgo(alert.triggered_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock size={10} />
                      <span>Cooldown: {alert.cooldown_minutes}m</span>
                      {isPercent && alert.reference_price && (
                        <span>• Base: ${alert.reference_price.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggle(alert.id, alert.enabled)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title={alert.enabled ? 'Pause alert' : 'Resume alert'}
                  >
                    {alert.enabled ? <Bell size={14} /> : <BellOff size={14} />}
                  </button>
                  <button
                    onClick={() => handleDelete(alert.id, alert.symbol)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    title="Delete alert"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

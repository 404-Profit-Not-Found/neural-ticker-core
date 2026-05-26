import { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { useCreatePriceAlert } from '../../hooks/usePriceAlerts';
import { useCurrency } from '../../context/CurrencyContext';
import { toast } from 'sonner';
import { Bell, TrendingUp, TrendingDown, Percent } from 'lucide-react';

interface CreateAlertDialogProps {
  symbol: string;
  currentPrice: number;
  /**
   * The native currency the ticker prices in (e.g. "USD" for AAPL, "GBP" for
   * BARC.L). Alerts are evaluated against the OHLCV close in the same currency,
   * so target prices must be entered in this currency, not the user's display
   * currency.
   */
  nativeCurrency?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ALERT_TYPES = [
  { value: 'price_above' as const, label: 'Price goes above', icon: TrendingUp, color: 'text-green-500' },
  { value: 'price_below' as const, label: 'Price goes below', icon: TrendingDown, color: 'text-red-500' },
  { value: 'percent_change_up' as const, label: '% increase from now', icon: Percent, color: 'text-green-500' },
  { value: 'percent_change_down' as const, label: '% decrease from now', icon: Percent, color: 'text-red-500' },
];

const COOLDOWN_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: '24 hours' },
];

export function CreateAlertDialog({ symbol, currentPrice, nativeCurrency = 'USD', open, onOpenChange }: CreateAlertDialogProps) {
  const [alertType, setAlertType] = useState<typeof ALERT_TYPES[number]['value']>('price_above');
  const [targetValue, setTargetValue] = useState<string>(currentPrice.toFixed(2));
  const [cooldown, setCooldown] = useState(60);
  const createAlert = useCreatePriceAlert();
  const { formatCurrency, formatNative } = useCurrency();
  // Alerts evaluate against native-currency OHLCV, so the target input is in
  // native currency. Show the native symbol next to the input to avoid users
  // entering a value as if it were in their displayCurrency.
  const nativeSymbol = new Intl.NumberFormat('en-US', { style: 'currency', currency: nativeCurrency }).formatToParts(0).find(p => p.type === 'currency')?.value ?? nativeCurrency;

  const isPercentType = alertType === 'percent_change_up' || alertType === 'percent_change_down';

  const handleTypeChange = (type: typeof alertType) => {
    setAlertType(type);
    if (type === 'percent_change_up' || type === 'percent_change_down') {
      setTargetValue('5');
    } else {
      setTargetValue(currentPrice.toFixed(2));
    }
  };

  const handleSubmit = async () => {
    const value = parseFloat(targetValue);
    if (isNaN(value) || value <= 0) {
      toast.error('Please enter a valid target value');
      return;
    }

    try {
      await createAlert.mutateAsync({
        symbol,
        alert_type: alertType,
        target_value: value,
        cooldown_minutes: cooldown,
      });
      toast.success(`Alert created for ${symbol}`);
      onOpenChange(false);
      // Reset form
      setAlertType('price_above');
      setTargetValue(currentPrice.toFixed(2));
      setCooldown(60);
    } catch {
      toast.error('Failed to create alert');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Bell size={18} className="text-primary" />
          Set Price Alert for {symbol}
        </DialogTitle>
        <DialogDescription>
          Current price: {formatNative(currentPrice, nativeCurrency)}
          {nativeCurrency !== 'USD' && (
            <span className="text-xs text-muted-foreground ml-1">
              (target in {nativeCurrency})
            </span>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 mt-4">
        {/* Alert Type Selection */}
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 block">Alert Type</label>
          <div className="grid grid-cols-2 gap-2">
            {ALERT_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleTypeChange(type.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${alertType === type.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                >
                  <Icon size={14} className={type.color} />
                  {type.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Target Value */}
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            {isPercentType ? 'Target Percentage (%)' : `Target Price (${nativeSymbol} ${nativeCurrency})`}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              {isPercentType ? '%' : nativeSymbol}
            </span>
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              step={isPercentType ? '0.5' : '0.01'}
              min="0"
              className="w-full rounded-lg border border-border bg-background px-8 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={isPercentType ? '5' : currentPrice.toFixed(2)}
            />
          </div>
          {!isPercentType && (
            <p className="text-xs text-muted-foreground mt-1">
              {alertType === 'price_above'
                ? `Alert when ${symbol} rises above this price`
                : `Alert when ${symbol} drops below this price`}
            </p>
          )}
          {isPercentType && (
            <p className="text-xs text-muted-foreground mt-1">
              {alertType === 'percent_change_up'
                ? `Alert when ${symbol} rises ${targetValue}% from ${formatCurrency(currentPrice, nativeCurrency)}`
                : `Alert when ${symbol} drops ${targetValue}% from ${formatCurrency(currentPrice, nativeCurrency)}`}
            </p>
          )}
        </div>

        {/* Cooldown */}
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            Cooldown (minimum time between re-fires)
          </label>
          <select
            value={cooldown}
            onChange={(e) => setCooldown(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {COOLDOWN_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DialogFooter className="mt-6">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={createAlert.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {createAlert.isPending ? 'Creating...' : 'Create Alert'}
        </button>
      </DialogFooter>
    </Dialog>
  );
}

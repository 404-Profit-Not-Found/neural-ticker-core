import { useId, useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { NativeSelect } from '../ui/select-native';
import { useCreatePriceAlert } from '../../hooks/usePriceAlerts';
import { useCurrency } from '../../context/CurrencyContext';
import { toast } from 'sonner';
import { Bell, TrendingUp, TrendingDown, Percent } from 'lucide-react';
import { cn } from '../../lib/utils';

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
  { value: 'price_above' as const, label: 'Price goes above', icon: TrendingUp, color: 'text-up' },
  { value: 'price_below' as const, label: 'Price goes below', icon: TrendingDown, color: 'text-down' },
  { value: 'percent_change_up' as const, label: '% increase from now', icon: Percent, color: 'text-up' },
  { value: 'percent_change_down' as const, label: '% decrease from now', icon: Percent, color: 'text-down' },
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
  const [targetValue, setTargetValue] = useState<string>(currentPrice > 0 ? currentPrice.toFixed(2) : '');
  const [cooldown, setCooldown] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const createAlert = useCreatePriceAlert();
  const { formatCurrency, formatNative } = useCurrency();
  const targetId = useId();
  const cooldownId = useId();
  const typeLabelId = useId();
  // Alerts evaluate against native-currency OHLCV, so the target input is in
  // native currency. Show the native symbol next to the input to avoid users
  // entering a value as if it were in their displayCurrency.
  const nativeSymbol = new Intl.NumberFormat('en-US', { style: 'currency', currency: nativeCurrency }).formatToParts(0).find(p => p.type === 'currency')?.value || nativeCurrency;

  const isPercentType = alertType === 'percent_change_up' || alertType === 'percent_change_down';

  const handleTypeChange = (type: typeof alertType) => {
    setAlertType(type);
    setError(null);
    if (type === 'percent_change_up' || type === 'percent_change_down') {
      setTargetValue('5');
    } else {
      setTargetValue(currentPrice > 0 ? currentPrice.toFixed(2) : '');
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = parseFloat(targetValue.replace(',', '.'));
    if (isNaN(value) || value <= 0) {
      // Said next to the field, not in a toast across the screen.
      setError(isPercentType ? 'Enter a percentage greater than 0.' : 'Enter a target price greater than 0.');
      return;
    }
    // The field starts at the current price as a reference. An alert at (or on
    // the wrong side of) that price would fire the moment it is saved.
    if (!isPercentType && currentPrice > 0) {
      const now = formatNative(currentPrice, nativeCurrency);
      if (alertType === 'price_above' && value <= currentPrice) {
        setError(`${symbol} is already at ${now}. Enter a higher price.`);
        return;
      }
      if (alertType === 'price_below' && value >= currentPrice) {
        setError(`${symbol} is already at ${now}. Enter a lower price.`);
        return;
      }
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
      setTargetValue(currentPrice > 0 ? currentPrice.toFixed(2) : '');
      setCooldown(60);
    } catch {
      toast.error('Failed to create alert');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit} noValidate>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 leading-snug">
            <Bell size={18} className="text-signal" />
            Set price alert for {symbol}
          </DialogTitle>
          <DialogDescription>
            Current price: <span className="num text-foreground">{currentPrice > 0 ? formatNative(currentPrice, nativeCurrency) : '—'}</span>
            {nativeCurrency !== 'USD' && (
              <span className="ml-1 text-xs">(target in {nativeCurrency})</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Alert Type Selection */}
          <div>
            <p id={typeLabelId} className="mb-2 text-sm font-medium text-muted-foreground">Alert type</p>
            <div role="radiogroup" aria-labelledby={typeLabelId} className="grid grid-cols-2 gap-2">
              {ALERT_TYPES.map((type) => {
                const Icon = type.icon;
                const selected = alertType === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => handleTypeChange(type.value)}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected ? 'bg-signal/10 text-signal' : 'bg-muted text-muted-foreground hover:bg-raised hover:text-foreground',
                    )}
                  >
                    <Icon size={14} className={type.color} aria-hidden />
                    {type.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Value */}
          <div>
            <Label htmlFor={targetId} className="mb-2 block text-sm font-medium text-muted-foreground">
              {isPercentType ? 'Target percentage (%)' : `Target price (${nativeSymbol} ${nativeCurrency})`}
            </Label>
            <div className="relative">
              <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden>
                {isPercentType ? '%' : nativeSymbol}
              </span>
              <Input
                id={targetId}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={targetValue}
                onChange={(e) => {
                  setTargetValue(e.target.value);
                  if (error) setError(null);
                }}
                className="num pl-9"
                aria-invalid={error ? true : undefined}
                aria-describedby={`${targetId}-hint`}
              />
            </div>
            <p id={`${targetId}-hint`} role={error ? 'alert' : undefined} className={cn('mt-1.5 text-xs', error ? 'text-down' : 'text-muted-foreground')}>
              {error
                ? error
                : isPercentType
                  ? alertType === 'percent_change_up'
                    ? `Alert when ${symbol} rises ${targetValue || '…'}% from ${formatCurrency(currentPrice, nativeCurrency)}`
                    : `Alert when ${symbol} drops ${targetValue || '…'}% from ${formatCurrency(currentPrice, nativeCurrency)}`
                  : alertType === 'price_above'
                    ? `Alert when ${symbol} rises above this price`
                    : `Alert when ${symbol} drops below this price`}
            </p>
          </div>

          {/* Cooldown */}
          <div>
            <Label htmlFor={cooldownId} className="mb-2 block text-sm font-medium text-muted-foreground">
              Repeat no more often than
            </Label>
            <NativeSelect id={cooldownId} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))}>
              {COOLDOWN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={createAlert.isPending}>
            {createAlert.isPending ? 'Creating…' : 'Create alert'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

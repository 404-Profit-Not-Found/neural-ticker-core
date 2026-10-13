import { Coins } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { NativeSelect } from '../ui/select-native';
import { useCurrency } from '../../context/CurrencyContext';

/**
 * Sentinel value used by the Portfolio currency dropdown to mean "show every
 * row in its own native currency — do not convert". Empty string keeps the
 * DOM `<select>` semantics simple.
 */
export const PORTFOLIO_DISPLAY_NATIVE = '';

export interface PortfolioCurrencySelectorProps {
  /** Empty string = NATIVE, otherwise an ISO currency code (e.g. 'EUR'). */
  value: string;
  onChange: (next: string) => void;
}

/**
 * Portfolio-local display currency selector with a NATIVE option. Distinct
 * from the (now-removed) global Header selector — only the Portfolio page
 * still converts currencies; everywhere else renders natively.
 */
export function PortfolioCurrencySelector({
  value,
  onChange,
}: PortfolioCurrencySelectorProps) {
  const { availableCurrencies, loading } = useCurrency();

  if (loading) {
    return (
      <Skeleton className="h-11 w-[150px] lg:h-9" role="status" aria-label="Loading currencies" />
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <Coins size={16} className="text-muted-foreground" aria-hidden />
      <span className="text-muted-foreground hidden sm:inline">Display</span>
      <NativeSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 min-w-[110px] text-xs lg:h-9"
        aria-label="Portfolio display currency"
        title="Portfolio display currency. NATIVE shows each row in the currency it trades in."
      >
        <option value={PORTFOLIO_DISPLAY_NATIVE}>🌐 NATIVE</option>
        {availableCurrencies.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.flag} {currency.code}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

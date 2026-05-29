import { Coins } from 'lucide-react';
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
      <div className="px-2 py-1.5 flex items-center justify-center">
        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <Coins size={14} className="text-muted-foreground" />
      <span className="text-muted-foreground hidden sm:inline">Display</span>
      <NativeSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs h-8 min-w-[110px]"
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

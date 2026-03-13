import { useCurrency } from '../../context/CurrencyContext';
import { Coins } from 'lucide-react';
import { NativeSelect } from './select-native';

export function CurrencySelector() {
  const { displayCurrency, setDisplayCurrency, availableCurrencies, loading } = useCurrency();

  if (loading) {
    return (
      <div className="px-3 py-2 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground mb-1">
        <Coins size={16} />
        <span>Display Currency</span>
      </div>
      <div className="px-3 pb-1">
        <NativeSelect
          value={displayCurrency}
          onChange={(e) => void setDisplayCurrency(e.target.value)}
          className="w-full text-xs h-8"
        >
          {availableCurrencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.flag} {currency.code}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

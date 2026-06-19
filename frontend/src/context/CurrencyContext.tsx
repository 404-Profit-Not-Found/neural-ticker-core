import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

interface AvailableCurrency {
  code: string;
  flag: string;
}

interface CurrencyContextType {
  /**
   * The user's saved *Portfolio default* display currency. NOT a global
   * "convert everything to this" preference. Outside the Portfolio page,
   * monetary values are always rendered in their native currency.
   */
  displayCurrency: string;
  setDisplayCurrency: (currency: string) => Promise<void>;
  availableCurrencies: AvailableCurrency[];
  rates: Record<string, number>;
  /**
   * Convert `amount` from `from` to `to` (defaults to `displayCurrency`).
   * Used exclusively by the Portfolio page when the backend response
   * doesn't already include a converted value. Returns the original
   * amount unchanged when a rate is missing.
   */
  convert: (amount: number, from: string, to?: string) => number;
  /** Formats `amount` using the supplied currency code (no conversion). */
  formatCurrency: (amount: number, currency?: string) => string;
  /**
   * Formats `amount` in its native `fromCurrency` with NO conversion.
   *
   * This is the canonical app-wide formatter for ticker prices, market caps,
   * targets, etc. — every stock displays in the currency it trades in. The
   * Portfolio page is the sole exception: it converts via the backend and
   * uses {@link formatCurrency} with the chosen display currency directly.
   */
  formatNative: (amount: number, fromCurrency?: string) => string;
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(
  undefined,
);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [displayCurrency, setDisplayCurrencyState] = useState<string>('USD');
  const [availableCurrencies, setAvailableCurrencies] = useState<
    AvailableCurrency[]
  >([{ code: 'USD', flag: '🇺🇸' }]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Load display currency from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('displayCurrency');
    if (stored) {
      setDisplayCurrencyState(stored);
    }
  }, []);

  // Fetch available currencies and exchange rates on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch available currencies from DB
        const [availableRes, ratesRes] = await Promise.all([
          api.get('/currency/available'),
          api.get('/currency/rates'),
        ]);

        if (availableRes.data?.currencies) {
          setAvailableCurrencies(availableRes.data.currencies);
        }

        if (ratesRes.data?.rates) {
          setRates(ratesRes.data.rates);
        }
      } catch (error) {
        console.warn('Failed to fetch currency data:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, []);

  const setDisplayCurrency = useCallback(
    async (currency: string) => {
      setDisplayCurrencyState(currency);
      localStorage.setItem('displayCurrency', currency);

      // Persist to user preferences if logged in
      if (user) {
        try {
          await api.post('/users/me/preferences', {
            displayCurrency: currency,
          });
        } catch (error) {
          console.warn('Failed to save currency preference:', error);
        }
      }
    },
    [user],
  );

  const tryConvert = useCallback(
    (amount: number, from: string, to: string): number | null => {
      if (from === to) return amount;
      const fromRate = from === 'USD' ? 1 : rates[from];
      const toRate = to === 'USD' ? 1 : rates[to];
      if (!fromRate || !toRate) return null;
      return amount * (toRate / fromRate);
    },
    [rates],
  );

  const convert = useCallback(
    (amount: number, from: string, to?: string): number => {
      const target = to || displayCurrency;
      const result = tryConvert(amount, from, target);
      return result ?? amount;
    },
    [displayCurrency, tryConvert],
  );

  const formatCurrency = useCallback(
    (amount: number, currency?: string): string => {
      const curr = currency || displayCurrency;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: curr,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    },
    [displayCurrency],
  );

  const formatNative = useCallback(
    (amount: number, fromCurrency?: string): string => {
      // Native-only render. We deliberately do NOT convert to
      // `displayCurrency` — that concept is now Portfolio-scoped. Show every
      // ticker in the currency it actually trades in.
      const native = (fromCurrency || 'USD').toUpperCase();
      return formatCurrency(amount, native);
    },
    [formatCurrency],
  );

  return (
    <CurrencyContext.Provider
      value={{
        displayCurrency,
        setDisplayCurrency,
        availableCurrencies,
        rates,
        convert,
        formatCurrency,
        formatNative,
        loading,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context)
    throw new Error('useCurrency must be used within a CurrencyProvider');
  return context;
};

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

interface AvailableCurrency {
  code: string;
  flag: string;
}

const currencyKeys = {
  available: ['currency', 'available'] as const,
  rates: ['currency', 'rates'] as const,
};

// The list of currencies only grows when a ticker in a new currency starts
// being tracked — an hour is plenty.
const AVAILABLE_STALE_TIME = 1000 * 60 * 60;
// The server refreshes FX rates hourly; ten minutes keeps Portfolio conversions
// close to that without refetching on every focus or navigation.
const RATES_STALE_TIME = 1000 * 60 * 10;

// Stable fallbacks, used until the first load (and if it fails).
const DEFAULT_CURRENCIES: AvailableCurrency[] = [{ code: 'USD', flag: '🇺🇸' }];
const NO_RATES: Record<string, number> = {};

function readStoredCurrency(): string {
  try {
    return localStorage.getItem('displayCurrency') || 'USD';
  } catch {
    return 'USD';
  }
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
  // Display currency comes from localStorage, read once on mount.
  const [displayCurrency, setDisplayCurrencyState] =
    useState<string>(readStoredCurrency);

  // Available currencies (from DB) and exchange rates, fetched in parallel and
  // kept in the persisted query cache: a reload has them before the network
  // answers, and a failed refresh keeps the last known values.
  const availableQuery = useQuery({
    queryKey: currencyKeys.available,
    queryFn: async (): Promise<AvailableCurrency[] | null> => {
      try {
        const res = await api.get('/currency/available');
        return res.data?.currencies || null;
      } catch (error) {
        console.warn('Failed to fetch currency data:', error);
        throw error;
      }
    },
    staleTime: AVAILABLE_STALE_TIME,
  });
  const ratesQuery = useQuery({
    queryKey: currencyKeys.rates,
    queryFn: async (): Promise<Record<string, number> | null> => {
      try {
        const res = await api.get('/currency/rates');
        return res.data?.rates || null;
      } catch (error) {
        console.warn('Failed to fetch currency data:', error);
        throw error;
      }
    },
    staleTime: RATES_STALE_TIME,
  });

  const availableCurrencies = availableQuery.data || DEFAULT_CURRENCIES;
  const rates = ratesQuery.data || NO_RATES;
  // True only until each has loaded (or failed) once — never during a refresh.
  const loading = availableQuery.isPending || ratesQuery.isPending;

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

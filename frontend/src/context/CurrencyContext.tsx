import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

interface AvailableCurrency {
  code: string;
  flag: string;
}

interface CurrencyContextType {
  displayCurrency: string;
  setDisplayCurrency: (currency: string) => Promise<void>;
  availableCurrencies: AvailableCurrency[];
  rates: Record<string, number>;
  convert: (amount: number, from: string, to?: string) => number;
  formatCurrency: (amount: number, currency?: string) => string;
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [displayCurrency, setDisplayCurrencyState] = useState<string>('USD');
  const [availableCurrencies, setAvailableCurrencies] = useState<AvailableCurrency[]>([
    { code: 'USD', flag: '🇺🇸' },
  ]);
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

  const setDisplayCurrency = useCallback(async (currency: string) => {
    setDisplayCurrencyState(currency);
    localStorage.setItem('displayCurrency', currency);

    // Persist to user preferences if logged in
    if (user) {
      try {
        await api.post('/users/me/preferences', { displayCurrency: currency });
      } catch (error) {
        console.warn('Failed to save currency preference:', error);
      }
    }
  }, [user]);

  const convert = useCallback((amount: number, from: string, to?: string): number => {
    const targetCurrency = to || displayCurrency;
    if (from === targetCurrency) return amount;

    // Rates are relative to USD
    const fromRate = from === 'USD' ? 1 : rates[from];
    const toRate = targetCurrency === 'USD' ? 1 : rates[targetCurrency];

    if (!fromRate || !toRate) return amount;

    // Convert: amount in 'from' to USD, then to 'to'
    return amount * (toRate / fromRate);
  }, [displayCurrency, rates]);

  const formatCurrency = useCallback((amount: number, currency?: string): string => {
    const curr = currency || displayCurrency;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }, [displayCurrency]);

  return (
    <CurrencyContext.Provider
      value={{
        displayCurrency,
        setDisplayCurrency,
        availableCurrencies,
        rates,
        convert,
        formatCurrency,
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
  if (!context) throw new Error('useCurrency must be used within a CurrencyProvider');
  return context;
};

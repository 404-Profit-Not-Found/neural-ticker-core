import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// `setupTests.ts` globally mocks `./context/CurrencyContext` so any component
// that calls `useCurrency` outside a real provider doesn't crash. For THIS
// file we need the real implementation to test it — override with the actual
// module before importing.
vi.mock('./CurrencyContext', async () => {
  const actual =
    await vi.importActual<typeof import('./CurrencyContext')>('./CurrencyContext');
  return actual;
});

import { CurrencyProvider, useCurrency } from './CurrencyContext';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

// Currencies and rates live in the query cache: a fresh one per test.
let queryClient: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Provide a baseline rate set so any test that does call `convert` works.
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url === '/currency/available') {
      return Promise.resolve({
        data: {
          currencies: [
            { code: 'USD', flag: '🇺🇸' },
            { code: 'EUR', flag: '🇪🇺' },
            { code: 'GBP', flag: '🇬🇧' },
          ],
        },
      });
    }
    if (url === '/currency/rates') {
      // 1 USD = 0.92 EUR, 1 USD = 0.79 GBP
      return Promise.resolve({
        data: { rates: { EUR: 0.92, GBP: 0.79 } },
      });
    }
    return Promise.resolve({ data: {} });
  });
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <CurrencyProvider>{children}</CurrencyProvider>
  </QueryClientProvider>
);

describe('CurrencyContext.formatNative — native-only contract', () => {
  it('formats in the supplied currency regardless of displayCurrency', async () => {
    localStorage.setItem('displayCurrency', 'USD');
    const { result } = renderHook(() => useCurrency(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // EUR amount formatted as EUR even though user prefers USD.
    expect(result.current.formatNative(100, 'EUR')).toBe('€100.00');
    expect(result.current.formatNative(100, 'GBP')).toBe('£100.00');
    expect(result.current.formatNative(100, 'USD')).toBe('$100.00');
  });

  it('does NOT convert even if a rate is available', async () => {
    localStorage.setItem('displayCurrency', 'EUR');
    const { result } = renderHook(() => useCurrency(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // A USD amount must still render as $ — no automatic conversion to EUR.
    expect(result.current.formatNative(100, 'USD')).toBe('$100.00');
  });

  it('lower-cases input currency code (defensive normalization)', async () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.formatNative(100, 'eur')).toBe('€100.00');
  });

  it('defaults to USD when no currency is provided', async () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.formatNative(100)).toBe('$100.00');
    expect(result.current.formatNative(100, undefined)).toBe('$100.00');
  });
});

describe('CurrencyContext.convert — kept for Portfolio use', () => {
  it('converts USD → EUR using the loaded rate', async () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // 100 USD * (0.92 EUR / 1 USD) = 92 EUR
    expect(result.current.convert(100, 'USD', 'EUR')).toBeCloseTo(92, 5);
  });

  it('returns the same amount when no rate is available', async () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // No rate for some unknown currency → fallback to original amount.
    expect(result.current.convert(100, 'USD', 'XYZ')).toBe(100);
  });
});

describe('CurrencyContext.displayCurrency — Portfolio default', () => {
  it('loads from localStorage on mount', async () => {
    localStorage.setItem('displayCurrency', 'GBP');
    const { result } = renderHook(() => useCurrency(), { wrapper });
    await waitFor(() => expect(result.current.displayCurrency).toBe('GBP'));
  });

  it('has the saved currency on the first render (no USD flash)', () => {
    localStorage.setItem('displayCurrency', 'GBP');
    const seen: string[] = [];
    renderHook(
      () => {
        const { displayCurrency } = useCurrency();
        seen.push(displayCurrency);
        return displayCurrency;
      },
      { wrapper },
    );
    expect(new Set(seen)).toEqual(new Set(['GBP']));
  });

  it('defaults to USD when nothing is saved', () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });
    expect(result.current.displayCurrency).toBe('USD');
  });

  it('updates and persists when set', async () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setDisplayCurrency('EUR');
    });

    expect(result.current.displayCurrency).toBe('EUR');
    expect(localStorage.getItem('displayCurrency')).toBe('EUR');
  });
});

describe('CurrencyContext data — cached currencies and rates', () => {
  const get = api.get as ReturnType<typeof vi.fn>;
  const requestCount = (url: string) =>
    get.mock.calls.filter(([requested]) => requested === url).length;

  /** Put both results in the cache as if fetched two hours ago (stale). */
  const seedStaleCache = () => {
    const updatedAt = Date.now() - 2 * 60 * 60 * 1000;
    queryClient.setQueryData(
      ['currency', 'available'],
      [
        { code: 'USD', flag: '🇺🇸' },
        { code: 'CHF', flag: '🇨🇭' },
      ],
      { updatedAt },
    );
    queryClient.setQueryData(['currency', 'rates'], { CHF: 0.5 }, { updatedAt });
  };

  it('starts with the defaults and loading, then loads each endpoint once', async () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.availableCurrencies).toEqual([{ code: 'USD', flag: '🇺🇸' }]);
    expect(result.current.rates).toEqual({});

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.availableCurrencies.map((c) => c.code)).toEqual(['USD', 'EUR', 'GBP']);
    expect(result.current.rates).toEqual({ EUR: 0.92, GBP: 0.79 });
    expect(requestCount('/currency/available')).toBe(1);
    expect(requestCount('/currency/rates')).toBe(1);
  });

  it('serves cached data on the first render, not loading, while it refreshes', async () => {
    seedStaleCache();
    const { result } = renderHook(() => useCurrency(), { wrapper });

    // First render: straight from the cache.
    expect(result.current.loading).toBe(false);
    expect(result.current.availableCurrencies.map((c) => c.code)).toEqual(['USD', 'CHF']);
    expect(result.current.convert(100, 'USD', 'CHF')).toBeCloseTo(50, 5);

    // Then the background refresh lands, without `loading` ever flipping.
    await waitFor(() => expect(result.current.rates).toEqual({ EUR: 0.92, GBP: 0.79 }));
    expect(result.current.loading).toBe(false);
  });

  it('does not refetch data that is still fresh', () => {
    queryClient.setQueryData(['currency', 'available'], [{ code: 'USD', flag: '🇺🇸' }]);
    queryClient.setQueryData(['currency', 'rates'], { CHF: 0.5 });

    const { result } = renderHook(() => useCurrency(), { wrapper });

    expect(result.current.loading).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps the previous currencies and rates when a refresh fails', async () => {
    seedStaleCache();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    get.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useCurrency(), { wrapper });

    await waitFor(() => {
      expect(queryClient.getQueryState(['currency', 'available'])?.status).toBe('error');
      expect(queryClient.getQueryState(['currency', 'rates'])?.status).toBe('error');
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.availableCurrencies.map((c) => c.code)).toEqual(['USD', 'CHF']);
    expect(result.current.rates).toEqual({ CHF: 0.5 });
    expect(result.current.convert(100, 'USD', 'CHF')).toBeCloseTo(50, 5);
  });

  it('stops loading and keeps the defaults when the first load fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    get.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useCurrency(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.availableCurrencies).toEqual([{ code: 'USD', flag: '🇺🇸' }]);
    expect(result.current.rates).toEqual({});
    // No rate: the amount comes back unchanged.
    expect(result.current.convert(100, 'USD', 'EUR')).toBe(100);
    expect(console.warn).toHaveBeenCalledWith('Failed to fetch currency data:', expect.any(Error));
  });

  it('ignores a response without the expected field', async () => {
    get.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useCurrency(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.availableCurrencies).toEqual([{ code: 'USD', flag: '🇺🇸' }]);
    expect(result.current.rates).toEqual({});
  });

  it('keeps `rates` and `convert` referentially stable across re-renders', async () => {
    const { result, rerender } = renderHook(() => useCurrency(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const before = result.current;
    rerender();
    expect(result.current.rates).toBe(before.rates);
    expect(result.current.availableCurrencies).toBe(before.availableCurrencies);
    expect(result.current.convert).toBe(before.convert);
    expect(result.current.formatNative).toBe(before.formatNative);
  });
});

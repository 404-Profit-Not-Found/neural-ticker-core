import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
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
  <CurrencyProvider>{children}</CurrencyProvider>
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

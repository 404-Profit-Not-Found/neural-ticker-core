import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Stub global constants
Object.defineProperty(global, '__APP_VERSION__', {
  value: '0.0.0-test',
  writable: true
});

// Default mock for CurrencyContext so any component using `useCurrency` outside
// a CurrencyProvider does not crash. Individual tests can override with their
// own `vi.mock(...)` call when they need specific behaviour.
vi.mock('./context/CurrencyContext', () => ({
  useCurrency: () => ({
    displayCurrency: 'USD',
    setDisplayCurrency: vi.fn(),
    availableCurrencies: [{ code: 'USD', flag: '🇺🇸' }],
    rates: {},
    convert: (amount: number) => amount,
    formatCurrency: (val: number, currency: string = 'USD') =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val),
    formatNative: (val: number, currency: string = 'USD') =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val),
    loading: false,
  }),
  CurrencyProvider: ({ children }: { children: React.ReactNode }) => children,
}));

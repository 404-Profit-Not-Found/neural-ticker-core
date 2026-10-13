import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { usePortfolioHistory, type PortfolioPositionRow } from './usePortfolioHistory';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn() },
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

const TODAY = '2026-10-13';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

type Routes = {
  trades?: unknown[];
  history?: Record<string, unknown[] | Error>;
};

function mockApi({ trades = [], history = {} }: Routes) {
  (api.get as Mock).mockImplementation((url: string) => {
    if (url === '/portfolio/trades') return Promise.resolve({ data: trades });
    const m = /^\/tickers\/(.+)\/history$/.exec(url);
    if (m) {
      const rows = history[decodeURIComponent(m[1])];
      if (rows instanceof Error) return Promise.reject(rows);
      return Promise.resolve({ data: rows ?? [] });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

const calls = (prefix: string) =>
  (api.get as Mock).mock.calls.filter(([url]) => String(url).startsWith(prefix));

describe('usePortfolioHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Freeze "today" only; timers must keep running for react-query.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  });
  afterEach(() => vi.useRealTimers());

  it('builds the series from the ledger and daily closes, ending at the live price', async () => {
    // Decimal columns arrive as strings from the API.
    const positions: PortfolioPositionRow[] = [
      { symbol: 'AAPL', shares: '10.00', buy_price: '100.00', buy_date: '2026-01-05', current_price: 130, currency: 'USD' },
    ];
    mockApi({
      trades: [{ symbol: 'AAPL', side: 'buy', shares: '10.00000000', price: '100.00000000', trade_date: '2026-01-05', currency: 'USD' }],
      history: {
        AAPL: [
          { ts: '2026-10-05T00:00:00.000Z', close: 120 },
          { ts: '2026-10-09T00:00:00.000Z', close: '125.5' },
        ],
      },
    });

    const { result } = renderHook(() => usePortfolioHistory(positions, '1W', 'USD'), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('unreachable');

    const { points, periodGain } = result.current.series;
    expect(points[0]).toMatchObject({ date: '2026-10-06', value: 1200, invested: 1000 });
    expect(points.find((p) => p.date === '2026-10-09')?.value).toBe(1255);
    expect(points.at(-1)).toMatchObject({ date: TODAY, value: 1300 });
    expect(periodGain).toBeCloseTo(100, 10);
    expect(result.current.usesFxConversion).toBe(false);

    // One candle request per symbol, wide enough to serve every range.
    expect(calls('/tickers/')).toHaveLength(1);
    expect(calls('/tickers/')[0][1]).toEqual({ params: { interval: '1d', days: 400 } });
  });

  it('uses native prices and the backend conversion rate for converted rows', async () => {
    // Row as returned with ?displayCurrency=EUR for a USD stock (rate 0.5).
    const positions: PortfolioPositionRow[] = [
      {
        symbol: 'AAPL',
        shares: 2,
        buy_price: 50, // already converted
        current_price: 65, // already converted
        currency: 'EUR',
        original_currency: 'USD',
        original_buy_price: 100,
        original_current_price: 130,
        conversion_rate: 0.5,
        buy_date: '2026-01-05',
      },
    ];
    mockApi({ history: { AAPL: [{ ts: '2026-10-01', close: 120 }] } });

    const { result } = renderHook(() => usePortfolioHistory(positions, '1W', 'EUR'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('unreachable');

    // 2 shares × $120 × 0.5 — not 2 × 120 (unconverted) and not 2 × 120 × 0.25 (double-converted).
    expect(result.current.series.points[0].value).toBeCloseTo(120, 10);
    expect(result.current.series.points.at(-1)?.value).toBeCloseTo(130, 10);
    expect(result.current.series.points[0].invested).toBeCloseTo(100, 10);
    expect(result.current.usesFxConversion).toBe(true);
  });

  it('charts positions sold during the period and fetches their prices too', async () => {
    mockApi({
      trades: [
        { symbol: 'TSLA', side: 'sell', shares: 1, price: 300, trade_date: '2026-10-10', currency: 'USD' },
        { symbol: 'TSLA', side: 'buy', shares: 1, price: 200, trade_date: '2026-09-01', currency: 'USD' },
      ],
      history: { TSLA: [{ ts: '2026-10-01', close: 250 }] },
    });

    const { result } = renderHook(() => usePortfolioHistory([], '1W', 'USD'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('unreachable');

    const { points, periodGain } = result.current.series;
    expect(points[0].value).toBe(250);
    expect(points.find((p) => p.date === '2026-10-10')).toMatchObject({ value: 0, sold: ['TSLA'] });
    expect(periodGain).toBeCloseTo(50, 10); // sold at 300 after starting the week at 250
  });

  it('reports a symbol whose price history failed to load instead of failing the chart', async () => {
    const positions: PortfolioPositionRow[] = [
      { symbol: 'NEWCO', shares: 5, buy_price: 10, buy_date: '2026-10-01', current_price: 12, currency: 'USD' },
    ];
    mockApi({ history: { NEWCO: new Error('502') } });

    const { result } = renderHook(() => usePortfolioHistory(positions, '1W', 'USD'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'), { timeout: 4000 });
    if (result.current.status !== 'ready') throw new Error('unreachable');

    expect(result.current.series.missingHistory).toEqual(['NEWCO']);
    expect(result.current.series.points[0].value).toBe(50); // at cost
    expect(result.current.series.points.at(-1)?.value).toBe(60); // live price
  });

  it('refuses to add up different currencies in native mode, without fetching anything', () => {
    const positions: PortfolioPositionRow[] = [
      { symbol: 'AAPL', shares: 1, buy_price: 100, current_price: 130, currency: 'USD' },
      { symbol: 'SAP.DE', shares: 1, buy_price: 100, current_price: 130, currency: 'EUR' },
    ];
    mockApi({});
    const { result } = renderHook(() => usePortfolioHistory(positions, '1M', ''), { wrapper });
    expect(result.current.status).toBe('mixed-currency');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('leaves out rows the backend could not convert and names them', async () => {
    const positions: PortfolioPositionRow[] = [
      { symbol: 'AAPL', shares: 1, buy_price: 100, current_price: 130, currency: 'USD', buy_date: '2026-01-05' },
      { symbol: '7203.T', shares: 1, buy_price: 3000, current_price: 3100, currency: 'JPY', conversion_unavailable: true, buy_date: '2026-01-05' },
    ];
    mockApi({ history: { AAPL: [{ ts: '2026-10-01', close: 120 }], '7203.T': [{ ts: '2026-10-01', close: 3050 }] } });

    const { result } = renderHook(() => usePortfolioHistory(positions, '1W', 'USD'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('unreachable');

    expect(result.current.series.excluded).toEqual(['7203.T']);
    expect(result.current.series.points[0].value).toBe(120);
  });
});

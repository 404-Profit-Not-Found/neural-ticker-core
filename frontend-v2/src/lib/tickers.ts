// Ticker-specific data hooks. Each wraps a TanStack useQuery with a stable
// queryKey so cache hits work both within a session and after rehydration
// from IndexedDB on reload.
import { useQuery } from '@tanstack/react-query';
import type { AnalyzerOpts, HistoryOpts } from './api.ts';
import { API, normalizeAnalyzerItem, normalizeCompositeToCandles } from './api.ts';
import type { Candle, Ticker, UseApiResult } from './types.ts';
import { MOCK } from './data.ts';

interface AnalyzerResponse {
  items?: unknown[];
}

export function useLiveTickers(opts?: AnalyzerOpts): UseApiResult<Ticker[]> {
  const o: AnalyzerOpts = { limit: 50, sortBy: 'market_cap', sortDir: 'DESC', ...(opts ?? {}) };
  const q = useQuery<AnalyzerResponse>({
    queryKey: ['analyzer', o],
    queryFn: () => API.analyzer(o) as Promise<AnalyzerResponse>,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  let tickers: Ticker[] | undefined;
  if (q.data && Array.isArray(q.data.items)) {
    tickers = q.data.items
      .map((it) => normalizeAnalyzerItem(it as Parameters<typeof normalizeAnalyzerItem>[0]))
      .filter((t): t is Ticker => t !== null);
  }
  return [
    tickers,
    {
      loading: q.isLoading || q.isPending,
      error: q.error,
      reload: () => q.refetch(),
      isStale: q.isStale,
      isFetching: q.isFetching,
    },
  ];
}

// Live tickers with MOCK fallback (palette + dashboard rely on always-something).
export function useTickersWithFallback(opts?: AnalyzerOpts): Ticker[] {
  const [live] = useLiveTickers(opts);
  return live && live.length > 0 ? live : MOCK.tickers;
}

export function useTickerHistory(
  sym: string | null | undefined,
  daysOrOpts?: number | HistoryOpts,
): UseApiResult<Candle[]> {
  const opts: HistoryOpts =
    typeof daysOrOpts === 'number'
      ? { days: daysOrOpts, interval: '1d' }
      : { days: 60, interval: '1d', ...(daysOrOpts ?? {}) };
  const q = useQuery<unknown>({
    queryKey: ['ticker-history', sym, opts],
    queryFn: () => (sym ? API.history(sym, opts) : Promise.resolve(null)),
    enabled: !!sym,
    staleTime: 60_000,
  });
  const candles = q.data
    ? normalizeCompositeToCandles(q.data as Parameters<typeof normalizeCompositeToCandles>[0])
    : undefined;
  return [
    candles,
    {
      loading: q.isLoading || q.isPending,
      error: q.error,
      reload: () => q.refetch(),
    },
  ];
}

export function useTickerNews(sym: string | null | undefined): UseApiResult<unknown[]> {
  const q = useQuery<unknown[]>({
    queryKey: ['ticker-news', sym],
    queryFn: () => (sym ? (API.news(sym) as Promise<unknown[]>) : Promise.resolve([] as unknown[])),
    enabled: !!sym,
    staleTime: 5 * 60_000,
  });
  return [
    Array.isArray(q.data) ? q.data : undefined,
    {
      loading: q.isLoading || q.isPending,
      error: q.error,
      reload: () => q.refetch(),
    },
  ];
}

export function useTickerComposite(sym: string | null | undefined): UseApiResult<unknown> {
  const q = useQuery<unknown>({
    queryKey: ['ticker-composite', sym],
    queryFn: () => (sym ? API.composite(sym) : Promise.resolve(null)),
    enabled: !!sym,
    staleTime: 60_000,
  });
  return [
    q.data && typeof q.data === 'object' ? q.data : undefined,
    {
      loading: q.isLoading || q.isPending,
      error: q.error,
      reload: () => q.refetch(),
    },
  ];
}

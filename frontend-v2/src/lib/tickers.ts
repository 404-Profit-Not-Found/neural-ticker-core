// Ticker-specific data hooks. Each wraps a TanStack useQuery with a stable
// queryKey so cache hits work both within a session and after rehydration
// from IndexedDB on reload.
import { useQuery } from '@tanstack/react-query';
import { API, normalizeAnalyzerItem, normalizeCompositeToCandles } from './api.js';

export function useLiveTickers(opts) {
  const o = Object.assign({ limit: 50, sortBy: 'market_cap', sortDir: 'DESC' }, opts || {});
  const q = useQuery({
    queryKey: ['analyzer', o],
    queryFn: () => API.analyzer(o),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  let tickers = null;
  if (q.data && Array.isArray(q.data.items)) {
    tickers = q.data.items.map(normalizeAnalyzerItem).filter(Boolean);
  }
  return [tickers, {
    loading: q.isLoading || q.isPending,
    error: q.error,
    reload: () => q.refetch(),
    isStale: q.isStale,
  }];
}

export function useTickerHistory(sym, daysOrOpts) {
  const opts = typeof daysOrOpts === 'number'
    ? { days: daysOrOpts, interval: '1d' }
    : Object.assign({ days: 60, interval: '1d' }, daysOrOpts || {});
  const q = useQuery({
    queryKey: ['ticker-history', sym, opts],
    queryFn: () => API.history(sym, opts),
    enabled: !!sym,
    staleTime: 60_000,
  });
  const candles = q.data ? normalizeCompositeToCandles(q.data) : null;
  return [candles, {
    loading: q.isLoading || q.isPending,
    error: q.error,
    reload: () => q.refetch(),
  }];
}

export function useTickerNews(sym) {
  const q = useQuery({
    queryKey: ['ticker-news', sym],
    queryFn: () => API.news(sym),
    enabled: !!sym,
    staleTime: 5 * 60_000, // news doesn't change as fast as quotes
  });
  return [Array.isArray(q.data) ? q.data : null, {
    loading: q.isLoading || q.isPending,
    error: q.error,
    reload: () => q.refetch(),
  }];
}

export function useTickerComposite(sym) {
  const q = useQuery({
    queryKey: ['ticker-composite', sym],
    queryFn: () => API.composite(sym),
    enabled: !!sym,
    staleTime: 60_000,
  });
  return [q.data && typeof q.data === 'object' ? q.data : null, {
    loading: q.isLoading || q.isPending,
    error: q.error,
    reload: () => q.refetch(),
  }];
}

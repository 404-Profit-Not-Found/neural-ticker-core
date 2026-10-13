import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export interface TickerSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  logo_url?: string;
  is_locally_tracked: boolean;
  is_queued?: boolean;
  sparkline?: number[];
}

interface Settled {
  /** The query these results answer. */
  query: string;
  results: TickerSearchResult[];
  /** True once the global (external) lookup has run for this query. */
  searchedExternal: boolean;
  error: boolean;
}

const NONE: Settled = { query: '', results: [], searchedExternal: false, error: false };

/**
 * Ticker search for the command palette.
 *  - typing runs a debounced search over tickers we already track;
 *  - `searchExternal()` widens it to global markets on demand (slower, and
 *    only when the user asks for it).
 * Results are stored together with the query they answer, so a response for
 * text the user has since changed is never shown and "loading" needs no
 * bookkeeping: it is simply "no settled answer for the current query yet".
 */
export function useTickerSearch(query: string, debounceMs = 250) {
  const q = query.trim();
  const [settled, setSettled] = useState<Settled>(NONE);
  const [externalPending, setExternalPending] = useState<string | null>(null);
  const latest = useRef(q);

  useEffect(() => {
    latest.current = q;
    if (q.length < 1) return;
    const timer = setTimeout(async () => {
      let next: Settled;
      try {
        const { data } = await api.get<TickerSearchResult[]>('/tickers', {
          params: { search: q, external: 'false' },
        });
        next = { query: q, results: Array.isArray(data) ? data : [], searchedExternal: false, error: false };
      } catch {
        next = { query: q, results: [], searchedExternal: false, error: true };
      }
      if (latest.current === q) setSettled(next);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [q, debounceMs]);

  const searchExternal = useCallback(async () => {
    if (q.length < 1) return;
    setExternalPending(q);
    let next: Settled;
    try {
      const { data } = await api.get<TickerSearchResult[]>('/tickers', {
        params: { search: q, external: 'true' },
      });
      next = { query: q, results: Array.isArray(data) ? data : [], searchedExternal: true, error: false };
    } catch {
      next = { query: q, results: [], searchedExternal: true, error: true };
    }
    if (latest.current === q) setSettled(next);
    setExternalPending((p) => (p === q ? null : p));
  }, [q]);

  const markQueued = useCallback((symbol: string) => {
    setSettled((s) => ({
      ...s,
      results: s.results.map((t) => (t.symbol === symbol ? { ...t, is_queued: true } : t)),
    }));
  }, []);

  const current = q.length > 0 && settled.query === q ? settled : null;

  return {
    results: current?.results ?? [],
    loading: q.length > 0 && (current === null || externalPending === q),
    searchedExternal: current?.searchedExternal ?? false,
    error: current?.error ?? false,
    searchExternal,
    markQueued,
  };
}

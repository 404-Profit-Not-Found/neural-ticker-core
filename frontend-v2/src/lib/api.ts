// v2 API client — talks to the NestJS backend mounted at /api/v1/*.
// This file is endpoints + normalisers only. Caching, polling, focus
// refetch, mutations etc. live in TanStack Query (see `queryClient.ts`
// and call-site useQuery hooks).
import { queryClient, clearAllCaches } from './queryClient.ts';
import type { ApiError, Candle, RequestOpts, Ticker } from './types.ts';

interface Defaults {
  base: string;
  timeout: number;
  credentials: RequestCredentials;
}

const DEFAULTS: Defaults = {
  base: '/api/v1',
  timeout: 12000,
  credentials: 'include',
};

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

export async function request<T = unknown>(
  path: string,
  opts?: RequestOpts,
): Promise<T> {
  const o: RequestOpts = { ...(opts ?? {}) };
  const url = path.startsWith('http') ? path : DEFAULTS.base + path;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(o.body && !(o.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(o.headers ?? {}),
  };
  const init: RequestInit = {
    method: o.method ?? 'GET',
    credentials: DEFAULTS.credentials,
    headers,
    signal: timeoutSignal(o.timeout ?? DEFAULTS.timeout),
  };
  if (o.body !== undefined) {
    init.body =
      typeof o.body === 'string' || o.body instanceof FormData
        ? (o.body as BodyInit)
        : JSON.stringify(o.body);
  }

  const res = await fetch(url, init);
  if (res.status === 401 || res.status === 403) {
    const err = new Error('AUTH_REQUIRED') as ApiError;
    err.status = res.status;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as ApiError;
    err.status = res.status;
    try {
      err.body = await res.json();
    } catch {
      /* swallow */
    }
    throw err;
  }
  const text = await res.text();
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// SSE helper for /api/v1/research/stream (text/event-stream)
export interface StreamEvent<T = unknown> {
  type: string;
  data: T | null;
}

export function stream<T = unknown>(
  path: string,
  body: unknown,
  onEvent: (evt: StreamEvent<T>) => void,
): () => void {
  const url = DEFAULTS.base + path;
  const ctl = new AbortController();
  void (async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        credentials: DEFAULTS.credentials,
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        onEvent({
          type: 'error',
          data: { status: res.status } as unknown as T,
        });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx = buf.indexOf('\n\n');
        while (idx !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const lines = chunk.split('\n');
          let evt = 'message';
          let data = '';
          for (const ln of lines) {
            if (ln.startsWith('event:')) evt = ln.slice(6).trim();
            else if (ln.startsWith('data:')) data += ln.slice(5).trim();
          }
          let payload: unknown = data;
          try {
            payload = JSON.parse(data);
          } catch {
            /* leave as string */
          }
          onEvent({ type: evt, data: payload as T });
          idx = buf.indexOf('\n\n');
        }
      }
      onEvent({ type: 'done', data: null });
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        onEvent({
          type: 'error',
          data: { message: err.message } as unknown as T,
        });
      }
    }
  })();
  return () => ctl.abort();
}

// Tap helper — invalidates query keys after a mutation succeeds.
function _invalidate<T>(prefix: string): (res: T) => T {
  return (res: T) => {
    try {
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey;
          if (!Array.isArray(key)) return false;
          return key.some(
            (k) => typeof k === 'string' && k.includes(prefix),
          );
        },
      });
    } catch {
      /* swallow */
    }
    return res;
  };
}

// ── Endpoints ────────────────────────────────────────────────
export interface AnalyzerOpts {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
  search?: string;
  sector?: string;
  minMarketCap?: number;
  maxMarketCap?: number;
  minRisk?: number;
  maxRisk?: number;
  minScore?: number;
  maxScore?: number;
  [k: string]: string | number | boolean | undefined;
}

export interface HistoryOpts {
  interval?: string;
  days?: number;
  from?: string;
  to?: string;
}

export interface ResearchListOpts {
  status?: string;
  limit?: number;
  ticker?: string;
  offset?: number;
  [k: string]: string | number | boolean | undefined;
}

function qs(opts: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? '?' + s : '';
}

export const API = {
  request,
  stream,

  me: () => request('/users/me'),

  adminUsers: () => request('/users'),
  adminGrantCredits: (id: string, amount: number, reason: string) =>
    request(`/users/${encodeURIComponent(id)}/credits`, {
      method: 'POST',
      body: { amount, reason },
    }).then(_invalidate('/users')),
  adminSetRole: (id: string, role: string) =>
    request(`/users/${encodeURIComponent(id)}/role`, {
      method: 'PATCH',
      body: { role },
    }).then(_invalidate('/users')),
  adminSetTier: (id: string, tier: string) =>
    request(`/users/${encodeURIComponent(id)}/tier`, {
      method: 'PATCH',
      body: { tier },
    }).then(_invalidate('/users')),

  pushVapidKey: () => request('/push/vapid-key'),
  pushSubscribe: (sub: unknown) =>
    request('/push/subscribe', { method: 'POST', body: sub }),
  pushUnsubscribe: (endpoint: string) =>
    request('/push/unsubscribe', { method: 'POST', body: { endpoint } }),

  portfolioAnalyses: () => request('/portfolio/analyses'),
  portfolioQuickRec: () => request('/portfolio/quick-recommendation'),
  portfolioAnalyze: (body: unknown) =>
    request('/portfolio/analyze', { method: 'POST', body }),

  loginUrl: (returnTo?: string) =>
    '/api/auth/google' +
    (returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''),
  logout: () =>
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .finally(() => {
        void clearAllCaches();
      }),

  indices: () => request('/market-data/indices'),
  tickers: (search?: string) =>
    request(`/tickers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  ticker: (sym: string) => request(`/tickers/${encodeURIComponent(sym)}`),
  composite: (sym: string) =>
    request(`/tickers/${encodeURIComponent(sym)}/composite`),
  snapshot: (sym: string) =>
    request(`/tickers/${encodeURIComponent(sym)}/snapshot`),
  history: (sym: string, opts: HistoryOpts = {}) =>
    request(
      `/tickers/${encodeURIComponent(sym)}/history${qs(opts as Record<string, unknown>)}`,
    ),
  news: (sym: string) => request(`/tickers/${encodeURIComponent(sym)}/news`),
  newsGeneral: () => request('/news/general'),
  newsDigest: () => request('/news/digest'),
  sectors: () => request('/tickers/sectors'),
  tickerCount: () => request('/tickers/count'),
  statsStrongBuy: () => request('/stats/strong-buy'),
  statsSell: () => request('/stats/sell'),

  analyzer: (opts: AnalyzerOpts = {}) =>
    request(`/market-data/analyzer${qs(opts as Record<string, unknown>)}`),

  watchlists: () => request('/watchlists'),
  watchlistCreate: (name: string) =>
    request('/watchlists', { method: 'POST', body: { name } }).then(
      _invalidate('/watchlists'),
    ),
  watchlistRename: (id: string | number, name: string) =>
    request(`/watchlists/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      body: { name },
    }).then(_invalidate('/watchlists')),
  watchlistDelete: (id: string | number) =>
    request(`/watchlists/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
    }).then(_invalidate('/watchlists')),
  watchlistAdd: (id: string | number, symbol: string) =>
    request(`/watchlists/${encodeURIComponent(String(id))}/items`, {
      method: 'POST',
      body: { symbol },
    }).then(_invalidate('/watchlists')),
  watchlistRemove: (id: string | number, itemId: string | number) =>
    request(
      `/watchlists/${encodeURIComponent(String(id))}/items/${encodeURIComponent(String(itemId))}`,
      { method: 'DELETE' },
    ).then(_invalidate('/watchlists')),
  favoritesToggle: (symbol: string) =>
    request('/watchlists/favorites/toggle', {
      method: 'POST',
      body: { symbol },
    }).then(_invalidate('/watchlists')),

  portfolio: (displayCurrency?: string) =>
    request(
      `/portfolio/positions${displayCurrency ? '?displayCurrency=' + encodeURIComponent(displayCurrency) : ''}`,
    ),
  portfolioCreate: (body: unknown) =>
    request('/portfolio/positions', { method: 'POST', body }).then(
      _invalidate('/portfolio'),
    ),
  portfolioUpdate: (id: string | number, body: unknown) =>
    request(`/portfolio/positions/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      body,
    }).then(_invalidate('/portfolio')),
  portfolioDelete: (id: string | number) =>
    request(`/portfolio/positions/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
    }).then(_invalidate('/portfolio')),

  alerts: () => request('/price-alerts'),
  alertCreate: (body: unknown) =>
    request('/price-alerts', { method: 'POST', body }).then(
      _invalidate('/price-alerts'),
    ),
  alertUpdate: (id: string | number, body: unknown) =>
    request(`/price-alerts/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      body,
    }).then(_invalidate('/price-alerts')),
  alertDelete: (id: string | number) =>
    request(`/price-alerts/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
    }).then(_invalidate('/price-alerts')),

  devLogin: (email: string) =>
    fetch('/api/auth/dev/token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),

  socialComments: (sym: string) =>
    request(`/social/comments/${encodeURIComponent(sym)}`),
  socialWatchers: (sym: string) =>
    request(`/social/stats/${encodeURIComponent(sym)}/watchers`),
  socialPost: (sym: string, body: unknown) =>
    request(`/social/comments/${encodeURIComponent(sym)}`, {
      method: 'POST',
      body,
    }).then(_invalidate('/social/comments')),

  stocktwitsAnalysis: (sym: string) =>
    request(`/stocktwits/${encodeURIComponent(sym)}/analysis`),
  stocktwitsWatchers: (sym: string) =>
    request(`/stocktwits/${encodeURIComponent(sym)}/watchers`),
  stocktwitsVolume: (sym: string) =>
    request(`/stocktwits/${encodeURIComponent(sym)}/stats/volume`),
  stocktwitsEvents: (sym: string) =>
    request(`/stocktwits/${encodeURIComponent(sym)}/events`),

  profile: () =>
    fetch('/api/auth/profile', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),

  researchStream: <T = unknown>(
    body: unknown,
    onEvent: (evt: StreamEvent<T>) => void,
  ) => stream<T>('/research/stream', body, onEvent),
  researchAsk: (body: unknown) =>
    request('/research/ask', { method: 'POST', body })
      .then(_invalidate('/research'))
      .then(_invalidate('/users')),
  researchGet: (id: string | number) =>
    request(`/research/${encodeURIComponent(String(id))}`),
  researchList: (opts: ResearchListOpts = {}) =>
    request(`/research${qs(opts as Record<string, unknown>)}`),
  researchContribute: (tickers: string[], content: string) =>
    request('/research/contribute', {
      method: 'POST',
      body: { tickers, content },
    }).then(_invalidate('/users')),
  researchUpload: (body: unknown) =>
    request('/research/upload', { method: 'POST', body }),
  researchPublic: (id: string | number, signature: string) =>
    request(
      `/report/${encodeURIComponent(String(id))}/${encodeURIComponent(signature)}`,
    ),
  researchPublicLink: (id: string | number) =>
    request(`/research/${encodeURIComponent(String(id))}/public-link`, {
      method: 'POST',
    }),
  newsSummary: (sym: string) =>
    request(`/research/news-summary/${encodeURIComponent(sym)}`),
};

// ── Normalisers (backend → UI shape) ───────────────────────
export function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++)
    h = ((h * 31 + str.charCodeAt(i)) | 0) as number;
  return Math.abs(h) || 1;
}

export function formatMarketCap(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  return n.toFixed(0);
}

export function scoreToVerdict(score: number | null | undefined): string {
  if (score == null) return 'HOLD';
  if (score >= 9) return 'NO BRAINER';
  if (score >= 7.5) return 'STRONG BUY';
  if (score >= 6) return 'SPECULATIVE';
  if (score >= 4) return 'HOLD';
  return 'SELL';
}

interface AnalyzerRawItem {
  ticker: {
    symbol: string;
    name?: string;
    sector?: string;
    industry?: string;
    logo_url?: string;
  };
  latestPrice?: { close?: number; change?: number; changePercent?: number };
  fundamentals?: {
    market_cap?: number;
    pe_ttm?: number;
    trailing_pe?: number;
  };
  aiAnalysis?: {
    overall_score?: number;
    financial_risk?: number;
    base_price?: number;
  };
  sparkline?: number[];
}

export function normalizeAnalyzerItem(
  item: AnalyzerRawItem | null | undefined,
): Ticker | null {
  if (!item || !item.ticker) return null;
  const { ticker, latestPrice, fundamentals, aiAnalysis, sparkline } = item;
  const score = aiAnalysis?.overall_score;
  const risk = aiAnalysis?.financial_risk;
  const price = latestPrice?.close ?? 0;
  const change = latestPrice?.change ?? latestPrice?.changePercent ?? 0;
  const upside =
    aiAnalysis?.base_price && price
      ? ((aiAnalysis.base_price - price) / price) * 100
      : 0;
  const sym = ticker.symbol;
  return {
    sym,
    name: ticker.name || sym,
    sector: ticker.sector || ticker.industry || '—',
    price,
    change,
    ai: scoreToVerdict(score),
    risk: risk != null ? Math.max(0, Math.min(10, Math.round(risk))) : 5,
    upside,
    mc: formatMarketCap(fundamentals?.market_cap),
    pe: fundamentals?.pe_ttm ?? fundamentals?.trailing_pe ?? null,
    seed: hashSeed(sym),
    logo: ticker.logo_url || `/api/v1/tickers/${encodeURIComponent(sym)}/logo`,
    spark:
      Array.isArray(sparkline) && sparkline.length > 1
        ? sparkline
        : [price, price],
    candles: [],
    _live: true,
  };
}

interface HistoryRow {
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CompositeRaw {
  history?: HistoryRow[];
  market_data?: { history?: HistoryRow[] };
}

export function normalizeCompositeToCandles(
  composite: CompositeRaw | unknown[] | null | undefined,
): Candle[] {
  let arr: HistoryRow[] | null = null;
  if (composite && typeof composite === 'object' && !Array.isArray(composite)) {
    const c = composite as CompositeRaw;
    arr = c.history ?? c.market_data?.history ?? null;
  } else if (Array.isArray(composite)) {
    arr = composite as HistoryRow[];
  }
  if (!arr) return [];
  return arr
    .map((c) => ({
      o: Number(c.open),
      h: Number(c.high),
      l: Number(c.low),
      c: Number(c.close),
    }))
    .filter((c) => isFinite(c.o) && isFinite(c.c));
}

export { queryClient };

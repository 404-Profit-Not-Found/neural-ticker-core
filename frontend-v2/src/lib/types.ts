// Shared API + domain types used across the v2 frontend. Keep these
// permissive at the migration boundary; tighten later as endpoints get
// stable schemas.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export interface ApiError extends Error {
  status?: number;
  body?: unknown;
}

export interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

// ── Domain shapes (lazy: still permissive) ─────────────────────
export interface Ticker {
  sym: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  ai: string;
  risk: number;
  upside: number;
  mc: string;
  pe: number | null;
  seed: number;
  logo?: string;
  spark: number[];
  candles: Candle[];
  _live?: boolean;
}

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface Index {
  name: string;
  val: number;
  ch: number;
}

export interface NewsItem {
  id?: string | number;
  title: string;
  source?: string;
  url?: string;
  published_at?: string;
  summary?: string;
}

// Hook return type — keep the legacy shape so call-sites need no refactor.
export interface UseApiMeta<E = Error> {
  loading: boolean;
  error: E | null;
  reload: () => Promise<unknown> | void;
  isStale?: boolean;
  isFetching?: boolean;
}

export type UseApiResult<T, E = Error> = [T | undefined, UseApiMeta<E>];

export interface UseMutationResult<TData, TVars, TError = Error> {
  mutate: (vars: TVars) => Promise<TData>;
  busy: boolean;
  error: TError | null;
  data: TData | undefined;
  reset: () => void;
}

// Route type — manual nav, no router lib
export type Route =
  | 'dashboard'
  | 'ticker'
  | 'analyzer'
  | 'workspace'
  | 'research'
  | 'watchlist'
  | 'profile'
  | 'admin'
  | 'compare'
  | 'share'
  | 'about'
  | 'terms'
  | 'privacy'
  | 'portfolio'
  | 'alerts'
  | 'news'
  | 'design-system';

export type NavFn = (route: Route | string, payload?: unknown) => void;

// User profile shape returned from /auth/profile (loosely modelled).
export interface UserProfile {
  id?: string | number;
  email?: string;
  name?: string;
  role?: 'admin' | 'user' | string;
  tier?: 'free' | 'pro' | 'premium' | string;
  credits?: number;
  picture?: string;
}

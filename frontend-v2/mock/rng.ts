// Deterministic helpers for the mock: no Math.random() in seed data, so the
// same ticker always produces the same history, sparkline, ids and logo.

/** 32-bit string hash (FNV-1a). */
export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for fixtures. */
export function rng(seed: number | string): () => number {
  let a = (typeof seed === 'string' ? hash(seed) : seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal sample from a uniform generator (Box–Muller). */
export function gauss(r: () => number): number {
  const u = Math.max(r(), 1e-12);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Deterministic UUID v4-shaped id derived from a label. */
export function uuid(label: string): string {
  const r = rng('uuid:' + label);
  const hex = (n: number): string => {
    let s = '';
    for (let i = 0; i < n; i++) s += Math.floor(r() * 16).toString(16);
    return s;
  };
  const variant = '89ab'[Math.floor(r() * 4)];
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

export function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)] as T;
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Mirrors PortfolioService.round2 (src/modules/portfolio/portfolio.service.ts). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

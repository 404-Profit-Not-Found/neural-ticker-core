// Open/close state for the command palette, kept outside React so anything —
// the header search button, the mobile search icon, a keyboard shortcut — can
// open it without prop drilling or a context re-render of the whole shell.
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const l of listeners) l();
}

export const openCommandPalette = (): void => set(true);
export const closeCommandPalette = (): void => set(false);
export const toggleCommandPalette = (): void => set(!open);

export function useCommandPaletteOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
}

// ── Recently viewed tickers ──────────────────────────────────
const RECENT_KEY = 'nt_v2_recent_tickers';
const RECENT_MAX = 6;
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

export function recentTickers(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    // Storage is user-writable: only ever hand back well-formed symbols.
    return raw
      .filter((s): s is string => typeof s === 'string' && SYMBOL_RE.test(s))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** Sign-out: the next person on this browser must not see what was viewed. */
export function clearRecentTickers(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // Storage unavailable: nothing was kept either.
  }
}

export function recordRecentTicker(symbol: string): void {
  const sym = symbol.toUpperCase();
  if (!SYMBOL_RE.test(sym)) return;
  try {
    const next = [sym, ...recentTickers().filter((s) => s !== sym)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

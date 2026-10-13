import { useSyncExternalStore } from 'react';

const canMatch = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/**
 * Subscribes to a CSS media query. `fallback` is returned where `matchMedia`
 * does not exist (unit tests), so components render one known layout there.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
    return useSyncExternalStore(
        (onChange) => {
            if (!canMatch()) return () => {};
            const list = window.matchMedia(query);
            list.addEventListener('change', onChange);
            return () => list.removeEventListener('change', onChange);
        },
        () => (canMatch() ? window.matchMedia(query).matches : fallback),
        () => fallback,
    );
}

/**
 * True below Tailwind's `lg` — the widths where the shell shows the bottom tab
 * bar and collections of tickers are lists of rows instead of tables/cards.
 * Use it when the two layouts are different component trees; for a style
 * difference use the `lg:` variant instead.
 */
export const useCompactLayout = (): boolean => useMediaQuery('(max-width: 1023.98px)');

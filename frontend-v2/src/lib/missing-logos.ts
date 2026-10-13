/**
 * Symbols whose logo request already failed in this session. A ticker without
 * a logo appears in many lists; without this every one of those rows asks the
 * server again and gets the same 404.
 */
const missing = new Set<string>();

export const isLogoMissing = (symbol: string): boolean => missing.has(symbol);

export function markLogoMissing(symbol: string): void {
    missing.add(symbol);
}

/** Call after a logo was saved for `symbol`, so it is requested again. */
export function forgetMissingLogo(symbol: string): void {
    missing.delete(symbol);
}

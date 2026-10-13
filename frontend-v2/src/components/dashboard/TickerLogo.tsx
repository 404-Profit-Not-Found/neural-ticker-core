import { memo, useState } from 'react';
import { cn } from '../../lib/api';
import { useTickerLogo } from '../../hooks/useTicker';
import { isLogoMissing, markLogoMissing } from '../../lib/missing-logos';

/** Letters shown when there is no logo: the root symbol, at most four characters. */
function fallbackLabel(symbol?: string): string {
    if (!symbol) return '?';
    // "ASML.AS" → "ASML", "BRK.A" → "BRK", "7203.T" → "7203"
    const root = symbol.split(/[.\-:]/)[0] || symbol;
    return root.slice(0, 4).toUpperCase();
}

interface TickerLogoProps {
    url?: string;
    symbol: string;
    className?: string;
    /** The caller knows the ticker has no logo: show the letters without asking the server for one. */
    noLogo?: boolean;
}

// Memoize because base64 image rendering is heavy
export const TickerLogo = memo(({ url, symbol, className, noLogo }: TickerLogoProps) => {
    const { data: logoSrc, isLoading, isError: hookError } = useTickerLogo(symbol);
    const [failedSymbol, setFailedSymbol] = useState<string | null>(null);
    const imgError = failedSymbol === symbol || isLogoMissing(symbol);

    // Fallback logic
    const showPlaceholder = noLogo || hookError || imgError || (!isLoading && !logoSrc && !url);

    if (showPlaceholder) {
        const label = fallbackLabel(symbol);
        return (
            // A container query sizes the letters to the disc, whatever size the
            // caller asked for (24px list avatar … 80px hero).
            <div
                className={cn(
                    "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground [container-type:inline-size]",
                    className || "w-8 h-8",
                )}
                aria-hidden
            >
                {/* Discs under 40px only have room for the initial. */}
                <span className="text-[46cqw] leading-none [@container(min-width:2.5rem)]:hidden">{label.charAt(0)}</span>
                <span className={cn("hidden leading-none tracking-tight [@container(min-width:2.5rem)]:inline", label.length > 3 ? "text-[28cqw]" : label.length > 2 ? "text-[32cqw]" : "text-[40cqw]")}>
                    {label}
                </span>
            </div>
        );
    }

    if (logoSrc) {
        return (
            <div className={cn("relative shrink-0", className || "w-8 h-8")}>
                <img
                    src={logoSrc}
                    alt=""
                    onError={() => {
                        markLogoMissing(symbol);
                        setFailedSymbol(symbol);
                    }}
                    className="h-full w-full rounded-full object-contain"
                />
            </div>
        );
    }

    // Loading
    return (
        <div className={cn("relative shrink-0", className || "w-8 h-8")}>
            <div className="absolute inset-0 rounded-full bg-muted motion-safe:animate-pulse" />
        </div>
    );
});
TickerLogo.displayName = 'TickerLogo';

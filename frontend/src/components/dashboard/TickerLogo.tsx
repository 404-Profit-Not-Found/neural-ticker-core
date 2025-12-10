import { cn } from '../../lib/api';
import { useTickerLogo } from '../../hooks/useTicker';

export const TickerLogo = ({ url, symbol, className }: { url?: string, symbol: string, className?: string }) => {
    const { data: logoSrc, isLoading, isError } = useTickerLogo(symbol, url);

    // Fallback logic
    const showPlaceholder = isError || (!isLoading && !logoSrc && !url);

    if (showPlaceholder) {
        return (
            <div className={cn("rounded-full bg-[#27272a] flex items-center justify-center text-xs font-bold text-[#a1a1aa] shrink-0", className || "w-8 h-8")}>
                {symbol ? symbol.substring(0, 1) : '?'}
            </div>
        );
    }

    if (logoSrc) {
        return (
            <div className={cn("relative shrink-0", className || "w-8 h-8")}>
                <img
                    src={logoSrc}
                    alt=""
                    className={cn(`w-full h-full rounded-full object-contain`)}
                />
            </div>
        );
    }

    // Loading
    return (
        <div className={cn("relative shrink-0", className || "w-8 h-8")}>
            <div className="absolute inset-0 rounded-full bg-[#27272a] animate-pulse" />
        </div>
    );
};

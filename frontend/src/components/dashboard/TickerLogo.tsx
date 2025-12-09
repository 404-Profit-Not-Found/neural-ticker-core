import { useState, useMemo } from 'react';
import { cn } from '../../lib/api';

export const TickerLogo = ({ url, symbol, className }: { url?: string, symbol: string, className?: string }) => {
    const [useCache, setUseCache] = useState(true);
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const imgSrc = useMemo(() => {
        if (useCache) {
            // Try fetching from our DB cache first
            return `/api/v1/tickers/${symbol}/logo`;
        }
        // Fallback to proxy or direct URL
        if (!url) return null;
        if (url.includes('finnhub.io')) {
            return `/api/proxy/image?url=${encodeURIComponent(url)}`;
        }
        return url;
    }, [useCache, url, symbol]);
    
    // State reset is handled by generic 'key' prop on parent usage where this component is mounted

    const handleError = () => {
        if (useCache) {
            // If DB cache fails (404), switch to fallback
            setUseCache(false);
        } else {
            // If fallback fails, show placeholder
            setError(true);
        }
    };

    if (error || !imgSrc) {
        return (
            <div className={cn("rounded-full bg-[#27272a] flex items-center justify-center text-xs font-bold text-[#a1a1aa] shrink-0", className || "w-8 h-8")}>
                {symbol.substring(0, 1)}
            </div>
        );
    }

    return (
        <div className={cn("relative shrink-0", className || "w-8 h-8")}>
            {!loaded && (
                <div className="absolute inset-0 rounded-full bg-[#27272a] animate-pulse" />
            )}
            <img
                src={imgSrc}
                alt="" // Decorative
                className={cn(`w-full h-full rounded-full object-contain transition-opacity duration-300`, loaded ? 'opacity-100' : 'opacity-0')}
                onLoad={() => setLoaded(true)}
                onError={handleError}
            />
        </div>
    );
};

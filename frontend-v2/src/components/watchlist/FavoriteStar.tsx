import { Star } from 'lucide-react';
import { cn } from '../../lib/api';
import { useFavorite } from '../../hooks/useWatchlist';

interface FavoriteStarProps {
    symbol: string;
    className?: string;
    size?: number;
    showTooltip?: boolean;
}

/**
 * Favourite toggle. A real button (keyboard reachable, announces its pressed
 * state); the glyph stays small while the hit area extends to 44px.
 */
export function FavoriteStar({ symbol, className, size = 16, showTooltip = true }: FavoriteStarProps) {
    const { isFavorite, toggle } = useFavorite(symbol);
    const label = isFavorite ? 'Remove from favorites' : 'Add to favorites';

    return (
        <button
            type="button"
            aria-pressed={isFavorite}
            aria-label={`${label}: ${symbol}`}
            title={showTooltip ? label : undefined}
            onClick={(e) => toggle(e)}
            className={cn(
                "relative inline-flex shrink-0 items-center justify-center rounded-md transition-transform before:absolute before:-inset-3 before:content-[''] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                className,
            )}
        >
            <Star
                size={size}
                aria-hidden
                className={cn(
                    'transition-colors',
                    isFavorite
                        ? 'fill-yellow-400 text-yellow-400 hover:text-yellow-500'
                        : 'text-muted-foreground hover:text-yellow-400',
                )}
            />
        </button>
    );
}

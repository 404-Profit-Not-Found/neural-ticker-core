import { Star } from 'lucide-react';
import { cn } from '../../lib/api';
import { useFavorite } from '../../hooks/useWatchlist';

interface FavoriteStarProps {
    symbol: string;
    className?: string;
    size?: number;
    showTooltip?: boolean;
}

export function FavoriteStar({ symbol, className, size = 16, showTooltip = true }: FavoriteStarProps) {
    const { isFavorite, toggle } = useFavorite(symbol);

    return (
        <div
            className={cn("cursor-pointer transition-transform active:scale-90", className)}
            onClick={(e) => {
                console.log(`[FavoriteStar] Clicked star for ${symbol}`);
                toggle(e);
            }}
            title={showTooltip ? (isFavorite ? "Remove from favorites" : "Add to favorites") : undefined}
        >
            <Star
                size={size}
                className={cn(
                    "transition-colors",
                    isFavorite
                        ? "text-yellow-400 fill-yellow-400 hover:text-yellow-500"
                        : "text-muted-foreground/30 hover:text-yellow-400"
                )}
            />
        </div>
    );
}

import { Trash2, Star } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/api';
import type { TickerData } from './WatchlistTableView';
import { useToggleFavorite } from '../../hooks/useTicker';
import { useWatchlists } from '../../hooks/useWatchlist';
import { TickerCard } from '../ticker/TickerCard';

interface WatchlistGridViewProps {
    data: TickerData[];
    isLoading: boolean;
    onRemove?: (itemId: string, symbol: string) => void;
}

export function WatchlistGridView({ data, isLoading, onRemove }: WatchlistGridViewProps) {
    const { data: watchlists } = useWatchlists();
    const toggleFavorite = useToggleFavorite();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const favoritesList = watchlists?.find((w: any) => w.name === 'Favourites');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const favoritesSet = new Set(favoritesList?.items?.map((i: any) => i.ticker.symbol) || []);

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-48 rounded-lg border border-border bg-card animate-pulse" />
                ))}
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground bg-card/50 rounded-lg border border-border">
                Watchlist is empty.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.map((item) => (
                <TickerCard
                    key={item.symbol}
                    symbol={item.symbol}
                    name={item.company}
                    logoUrl={item.logo}
                    sector={item.sector}
                    price={item.price}
                    change={item.change ?? 0}
                    risk={item.riskScore ?? 0}
                    overallScore={item.overallScore ?? undefined}
                    upside={item.potentialUpside ?? 0}
                    downside={item.potentialDownside ?? 0}
                    pe={item.pe ?? undefined}
                    consensus={item.rating ?? undefined}
                    researchCount={item.researchCount}
                    newsCount={item.newsCount}
                    socialCount={item.socialCount}
                    sparkline={item.sparkline}
                >
                    {/* Action Overlays */}
                    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        {onRemove ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive bg-card/80 backdrop-blur-sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove(item.itemId || '', item.symbol);
                                }}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        ) : (
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-6 w-6 bg-card/80 backdrop-blur-sm transition-colors",
                                    favoritesSet.has(item.symbol) ? "text-yellow-500 hover:text-yellow-600" : "text-muted-foreground hover:text-yellow-500"
                                )}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite.mutate(item.symbol);
                                }}
                                disabled={toggleFavorite.isPending}
                            >
                                <Star className={cn("h-4 w-4", favoritesSet.has(item.symbol) && "fill-current")} />
                            </Button>
                        )}
                    </div>
                </TickerCard>
            ))}
        </div>
    );
}

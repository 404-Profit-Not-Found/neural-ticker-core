import { Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import type { TickerData } from './WatchlistTableView';
import { TickerCard } from '../ticker/TickerCard';
import { FavoriteStar } from '../watchlist/FavoriteStar';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "../ui/tooltip";

import { useAllMarketsStatus, getRegionForStatus } from '../../hooks/useMarketStatus';

interface WatchlistGridViewProps {
    data: TickerData[];
    isLoading: boolean;
    onRemove?: (itemId: string, symbol: string) => void;
}

export function WatchlistGridView({ data, isLoading, onRemove }: WatchlistGridViewProps) {
    const { data: marketStatusRaw } = useAllMarketsStatus();

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
            {data.map((item) => {
                const region = getRegionForStatus(item.symbol);
                const status = marketStatusRaw ? (region === 'EU' ? marketStatusRaw.eu : marketStatusRaw.us) : undefined;

                return (
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
                        fiftyTwoWeekLow={item.fiftyTwoWeekLow ?? undefined}
                        fiftyTwoWeekHigh={item.fiftyTwoWeekHigh ?? undefined}
                        marketStatus={status}
                    >
                        {/* Action Overlays */}
                        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            {onRemove ? (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-muted-foreground hover:text-destructive bg-card/80 backdrop-blur-sm"
                                                title="Remove from watchlist" // Added for test stability
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRemove(item.itemId || '', item.symbol);
                                                }}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Remove ticker from the list</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            ) : (
                                <FavoriteStar symbol={item.symbol} className="bg-card/80 backdrop-blur-sm p-1 rounded-md" />
                            )}
                        </div>
                    </TickerCard>
                );
            })}
        </div>
    );
}

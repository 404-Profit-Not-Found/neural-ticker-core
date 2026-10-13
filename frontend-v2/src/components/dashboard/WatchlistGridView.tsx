import { Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import type { TickerData } from './WatchlistTableView';
import { TickerCard } from '../ticker/TickerCard';
import { Skeleton } from '../ui/skeleton';
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
            <div role="status" aria-label="Loading watchlist" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-[300px] bg-card" />
                ))}
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="rounded-lg bg-card py-12 text-center text-muted-foreground">
                Watchlist is empty.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
                        downsideEstimated={item.downsideEstimated}
                        pe={item.pe ?? undefined}
                        consensus={item.rating ?? undefined}
                        researchCount={item.researchCount}
                        newsCount={item.newsCount}
                        socialCount={item.socialCount}
                        newsSentiment={item.newsSentiment ?? undefined}
                        newsImpact={item.newsImpact ?? undefined}
                        revenueTTM={item.revenueTTM}
                        sparkline={item.sparkline}
                        fiftyTwoWeekLow={item.fiftyTwoWeekLow ?? undefined}
                        fiftyTwoWeekHigh={item.fiftyTwoWeekHigh ?? undefined}
                        marketStatus={status}
                        currency={item.currency}
                    >
                        {onRemove && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground opacity-70 hover:bg-raised hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                                            title="Remove from watchlist" // Added for test stability
                                            aria-label={`Remove ${item.symbol} from watchlist`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRemove(item.itemId || '', item.symbol);
                                            }}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Remove ticker from the list</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </TickerCard>
                );
            })}
        </div>
    );
}

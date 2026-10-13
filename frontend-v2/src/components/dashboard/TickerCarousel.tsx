import { SearchX } from 'lucide-react';
import { TickerCard } from '../ticker/TickerCard';
import { EmptyState, LoadError } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import { TickerRowList, TickerRowListSkeleton } from './TickerListRow';
import type { TickerData } from './WatchlistTableView';
import { useCompactLayout } from '../../hooks/useMediaQuery';
import { useAllMarketsStatus, getRegionForStatus } from '../../hooks/useMarketStatus';

interface TickerCarouselProps {
    data: TickerData[];
    isLoading: boolean;
    /** The load failed and there is nothing to show. */
    error?: boolean;
    onRetry?: () => void;
}

/**
 * A short ranked set of tickers.
 *  - Below `lg`: mini-card rows (phones and tablets get the whole set on one
 *    screen, one tap from the detail page).
 *  - From `lg`: the full analysis cards in a grid.
 */
export function TickerCarousel({ data, isLoading, error, onRetry }: TickerCarouselProps) {
    const { data: marketStatusRaw } = useAllMarketsStatus();
    const compact = useCompactLayout();

    if (isLoading) {
        return compact ? (
            <TickerRowListSkeleton rows={4} label="Loading opportunities" />
        ) : (
            <div role="status" aria-label="Loading opportunities" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-[300px] bg-card" />
                ))}
            </div>
        );
    }

    if (error) return <LoadError what="opportunities" onRetry={onRetry} className="rounded-md bg-card" />;

    if (data.length === 0) {
        return (
            <EmptyState
                className="rounded-md bg-card"
                icon={<SearchX className="h-5 w-5" />}
                title="No matches for this strategy right now"
                description="Ratings update as new research lands — try another strategy or browse all tickers."
            />
        );
    }

    if (compact) return <TickerRowList items={data} />;

    // Two columns, then four — never 3 + an orphan.
    return (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
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
                        researchCount={item.researchCount ?? 0}
                        newsCount={item.newsCount ?? 0}
                        socialCount={item.socialCount ?? 0}
                        newsSentiment={item.newsSentiment ?? undefined}
                        newsImpact={item.newsImpact ?? undefined}
                        revenueTTM={item.revenueTTM}
                        sparkline={item.sparkline}
                        fiftyTwoWeekLow={item.fiftyTwoWeekLow ?? undefined}
                        fiftyTwoWeekHigh={item.fiftyTwoWeekHigh ?? undefined}
                        marketStatus={status}
                        currency={item.currency}
                    />
                );
            })}
        </div>
    );
}

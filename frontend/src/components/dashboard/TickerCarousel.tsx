import { TickerCard } from '../ticker/TickerCard';
import type { TickerData } from './WatchlistTableView';

interface TickerCarouselProps {
    data: TickerData[];
    isLoading: boolean;
}
export function TickerCarousel({ data, isLoading }: TickerCarouselProps) {

    if (isLoading) {
        return (
            <div className="flex flex-col md:grid md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="min-w-[280px] h-48 rounded-lg border border-border bg-card animate-pulse w-full" />
                ))}
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground bg-card/50 rounded-lg border border-border">
                No opportunities found for this category.
            </div>
        );
    }

    return (
        <div className="relative group/carousel">
            {/* Unified Grid Layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
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
                        researchCount={item.researchCount ?? 0}
                        newsCount={item.newsCount ?? 0}
                        socialCount={item.socialCount ?? 0}
                        sparkline={item.sparkline}
                        fiftyTwoWeekLow={item.fiftyTwoWeekLow ?? undefined}
                        fiftyTwoWeekHigh={item.fiftyTwoWeekHigh ?? undefined}
                    />
                ))}
            </div>
        </div>
    );
}

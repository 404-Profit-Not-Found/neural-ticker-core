import { TickerCard } from '../ticker/TickerCard';
import { SearchX } from 'lucide-react';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import type { StockSnapshot } from '../../hooks/useStockAnalyzer';
import { snapshotToTickerData } from '../../lib/ticker-metrics';

import { useAllMarketsStatus, getRegionForStatus } from '../../hooks/useMarketStatus';

interface AnalyzerGridViewProps {
    data: StockSnapshot[];
    isLoading: boolean;
    /** Clears the filters; offered when they hide everything. */
    onReset?: () => void;
}

export function AnalyzerGridView({ data, isLoading, onReset }: AnalyzerGridViewProps) {
    const { data: marketStatusRaw } = useAllMarketsStatus();

    if (isLoading) {
        return (
            <div role="status" aria-label="Loading tickers" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-[300px] bg-card" />
                ))}
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <EmptyState
                className="rounded-md bg-card"
                icon={<SearchX className="h-5 w-5" />}
                title="No tickers match"
                description="Try a different search or remove a filter."
                action={onReset ? <Button variant="outline" size="sm" onClick={onReset}>Reset filters</Button> : undefined}
            />
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {data.map((item) => {
                const { ticker, fundamentals } = item;
                // The same record the phone rows and the table render.
                const record = snapshotToTickerData(item);
                const region = getRegionForStatus(ticker.symbol);
                const status = marketStatusRaw ? (region === 'EU' ? marketStatusRaw.eu : marketStatusRaw.us) : undefined;

                return (
                    <TickerCard
                        key={ticker.symbol}
                        symbol={ticker.symbol}
                        name={ticker.name}
                        logoUrl={ticker.logo_url}
                        industry={ticker.industry || undefined}
                        sector={(String(ticker.sector || '') || String(fundamentals?.sector || '')) || undefined}
                        price={record.price}
                        change={record.change}
                        risk={record.riskScore ?? 0}
                        overallScore={record.overallScore ?? undefined}
                        upside={record.potentialUpside ?? 0}
                        downside={record.potentialDownside ?? 0}
                        downsideEstimated={record.downsideEstimated}
                        pe={record.pe ?? undefined}
                        consensus={record.rating}
                        researchCount={record.researchCount || undefined}
                        newsCount={record.newsCount || undefined}
                        socialCount={record.socialCount || undefined}
                        newsSentiment={record.newsSentiment ?? undefined}
                        newsImpact={record.newsImpact ?? undefined}
                        revenueTTM={record.revenueTTM}
                        sparkline={item.sparkline}
                        fiftyTwoWeekLow={record.fiftyTwoWeekLow ?? undefined}
                        fiftyTwoWeekHigh={record.fiftyTwoWeekHigh ?? undefined}
                        marketStatus={status}
                        currency={record.currency}
                    />
                );
            })}
        </div>
    );
}

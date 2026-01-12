import { TickerCard } from '../ticker/TickerCard';
import type { StockSnapshot } from '../../hooks/useStockAnalyzer';
import { calculateLiveUpside } from '../../lib/rating-utils';

import { useAllMarketsStatus, getRegionForStatus } from '../../hooks/useMarketStatus';

interface AnalyzerGridViewProps {
    data: StockSnapshot[];
    isLoading: boolean;
}

export function AnalyzerGridView({ data, isLoading }: AnalyzerGridViewProps) {
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
                No stocks found.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.map((item) => {
                const { ticker, latestPrice, aiAnalysis, fundamentals, counts } = item;
                const price = latestPrice?.close ?? 0;
                const change = latestPrice?.change ?? 0;
                const risk = aiAnalysis?.financial_risk ?? 0;

                const basePrice = aiAnalysis?.base_price;
                const bearPrice = aiAnalysis?.bear_price;

                let upside = 0;

                // Unified Upside Calculation
                upside = calculateLiveUpside(price, basePrice, aiAnalysis?.upside_percent);

                let downside = 0;
                if (typeof bearPrice === 'number' && price > 0) {
                    downside = ((bearPrice - price) / price) * 100;
                } else if (risk >= 8) {
                    downside = -100;
                } else {
                    downside = -(risk * 2.5);
                }

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
                        price={price}
                        change={change}
                        risk={risk}
                        overallScore={aiAnalysis?.overall_score ?? undefined}
                        upside={upside}
                        downside={downside}
                        pe={typeof fundamentals?.pe_ttm === 'number' ? fundamentals.pe_ttm : undefined}
                        consensus={fundamentals?.consensus_rating ? String(fundamentals.consensus_rating) : undefined}
                        researchCount={counts?.research ?? undefined}
                        newsCount={counts?.news ?? undefined}
                        socialCount={counts?.social ?? undefined}
                        newsSentiment={ticker.news_sentiment ?? undefined}
                        newsImpact={ticker.news_impact_score ?? undefined}
                        sparkline={item.sparkline}
                        fiftyTwoWeekLow={fundamentals?.fifty_two_week_low ? Number(fundamentals.fifty_two_week_low) : undefined}
                        fiftyTwoWeekHigh={fundamentals?.fifty_two_week_high ? Number(fundamentals.fifty_two_week_high) : undefined}
                        marketStatus={status}
                    />
                );
            })}
        </div>
    );
}

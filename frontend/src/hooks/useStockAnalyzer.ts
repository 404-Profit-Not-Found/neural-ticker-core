import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface StockSnapshot {
    ticker: {
        id: string;
        symbol: string;
        name: string;
        exchange: string;
        sector?: string;
        industry?: string;
        logo_url?: string;
    };
    latestPrice: {
        close: number;
        open: number;
        high: number;
        low: number;
        volume: number;
        change: number;
        prevClose: number;
        ts: string;
    } | null;
    fundamentals: {
        market_cap?: number;
        pe_ratio?: number;
        market_ap?: number; // fallback mapping
        // ... loosely typed for now as we map raw
        [key: string]: number | string | null | undefined;
    };
    aiAnalysis: {
        overall_score: number;
        upside_percent: number;
        financial_risk: number;
        sentiment: string;
    } | null;
}

export interface AnalyzerResponse {
    items: StockSnapshot[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface AnalyzerParams {
    page: number;
    limit: number;
    sortBy: string;
    sortDir: 'ASC' | 'DESC';
    search: string;
}

export function useStockAnalyzer(params: AnalyzerParams) {
    return useQuery({
        queryKey: ['analyzer', params],
        queryFn: async () => {
            const { data } = await api.get<AnalyzerResponse>('/market-data/analyzer', {
                params,
            });
            return data;
        },
        placeholderData: (prev) => prev, // Keep previous data while fetching new page
    });
}

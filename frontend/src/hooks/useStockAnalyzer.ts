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
        news_sentiment?: string | null;
        news_impact_score?: number | null;
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
        pe_ttm?: number;
        // ... loosely typed for now as we map raw
        [key: string]: number | string | null | undefined;
    };
    aiAnalysis: {
        overall_score: number;
        upside_percent: number;
        financial_risk: number;
        sentiment: string;
        bear_price?: number | null;
        base_price?: number | null;
    } | null;
    counts?: {
        news?: number;
        research?: number;
        analysts?: number;
        social?: number;
    };
    sparkline?: number[];
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
    // Filters
    risk?: string[];
    aiRating?: string[];
    upside?: string | null;
    sector?: string[];
    overallScore?: string | null;
}

export function useStockAnalyzer(params: AnalyzerParams) {
    return useQuery({
        queryKey: ['analyzer', params],
        queryFn: async () => {
      const queryParams = new URLSearchParams();
      queryParams.append('page', String(params.page));
      queryParams.append('limit', String(params.limit));
      queryParams.append('sortBy', params.sortBy);
      queryParams.append('sortDir', params.sortDir);
      if (params.search) queryParams.append('search', params.search);
      
    // Handle array params manually for 'repeat' format (aiRating=A&aiRating=B)
      params.risk?.forEach(r => queryParams.append('risk', r));
      params.aiRating?.forEach(r => queryParams.append('aiRating', r));
      params.sector?.forEach(s => queryParams.append('sector', s));
      if (params.upside) queryParams.append('upside', params.upside);
      if (params.overallScore) queryParams.append('overallScore', params.overallScore);

      const { data } = await api.get<AnalyzerResponse>('/market-data/analyzer', {
        params: queryParams,
      });
      return data;
    },
        placeholderData: (prev) => prev, // Keep previous data while fetching new page
    });
}


export interface Scenario {
    scenario_type: 'bull' | 'base' | 'bear';
    probability: number;
    description: string;
    price_mid: number;
    price_low: number;
    price_high: number;
    expected_market_cap: number;
    key_drivers: string[];
}

export interface CandlePoint {
    ts: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    source?: string;
}

export interface NewsItem {
    id: string;
    url: string;
    source: string;
    datetime: number;
    headline: string;
}

export interface SocialComment {
    id: string;
    user: {
        email?: string;
        nickname?: string;
        name?: string;
        avatar_url?: string;
        tier?: string; // Added tier
    };
    created_at: string;
    content: string;
}

export interface AnalystRating {
    id: string;
    firm: string;
    analyst_name?: string;
    rating: string;
    price_target?: number;
    rating_date: string;
}

export interface ResearchItem {
    id: string;
    created_at: string;
    status: 'completed' | 'pending' | 'failed' | 'processing';
    question?: string;
    title?: string; // Explicitly adding title
    content?: string;
    user?: {
        nickname?: string;
        email?: string;
        avatar_url?: string;
    };
    tickers: string[];
    provider?: string;
    user_id?: string;
    models_used?: string[];
    tokens_in?: number;
    tokens_out?: number;
    updated_at?: string;
    rarity?: string; // e.g. 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'
}

export interface TickerData {
    profile: {
        logo_url: string;
        symbol: string;
        exchange: string;
        name: string;
        sector?: string;
        industry?: string;
        web_url?: string;
        description?: string;
        country?: string;
    };
    market_data: {
        price: number;
        change_percent: number;
        history?: CandlePoint[];
    };
    risk_analysis: {
        overall_score: number;
        summary: string;
        dimensions: Record<string, number>;
        scenarios: Scenario[];
        catalysts: { description: string }[];
        red_flags: string[];
        // Detailed Risk Breakdown
        financial_risk: number;
        execution_risk: number;
        dilution_risk: number;
        competitive_risk: number;
        regulatory_risk: number;
        upside_percent?: number;
        sentiment?: string;
    };
    fundamentals: {
        // Valuation & Size
        market_cap?: number;
        enterprise_value?: number;
        pe_ratio?: number;
        price_to_book?: number;
        book_value_per_share?: number;
        shares_outstanding?: number;

        // Profitability
        revenue_ttm?: number; // Revenue
        gross_margin?: number;
        operating_margin?: number;
        net_profit_margin?: number;
        roe?: number;
        roa?: number;

        // Financial Strength
        debt_to_equity?: number;
        debt_to_assets?: number;
        current_ratio?: number;
        quick_ratio?: number;
        interest_coverage?: number;
        
        // Growth & Cash Flow
        earnings_growth_yoy?: number;
        free_cash_flow_ttm?: number;

        // Yield & Returns
        dividend_yield?: number;

        // Existing Properties (Keep for compatibility if used)
        cash_on_hand?: number;
        runway_years?: number;
        consensus_rating?: string;
        target_price_avg?: number;
        
        // Market Context
        fifty_two_week_high?: number;
        fifty_two_week_low?: number;
    } | null;
    notes: ResearchItem[]; // Ensuring notes is present
    ratings?: AnalystRating[];
    watchers: number;
    news?: {
        sentiment?: string;
        score?: number;
        summary?: string;
        updated_at?: string;
    };
}

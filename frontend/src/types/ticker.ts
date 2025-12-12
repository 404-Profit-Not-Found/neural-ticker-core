
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
    status: 'completed' | 'pending' | 'failed';
    question?: string;
    title?: string; // Explicitly adding title
    content?: string;
    user?: {
        nickname?: string;
        email?: string;
        avatar_url?: string;
    };
    provider?: string;
    user_id?: string;
    models_used?: string[];
}

export interface TickerData {
    profile: {
        logo_url: string;
        symbol: string;
        exchange: string;
        name: string;
    };
    market_data: {
        price: number;
        change_percent: number;
    };
    risk_analysis: {
        overall_score: number;
        summary: string;
        dimensions: Record<string, number>;
        scenarios: Scenario[];
        catalysts: { description: string }[];
        red_flags: string[];
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
    } | null;
    notes: ResearchItem[]; // Ensuring notes is present
    ratings?: AnalystRating[];
    watchers: number;
}

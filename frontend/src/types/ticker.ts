
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
    user: { email: string };
    created_at: string;
    content: string;
}

export interface ResearchItem {
    id: string;
    created_at: string;
    status: 'completed' | 'pending' | 'failed';
    question?: string;
    content?: string;
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
        market_cap?: number;
        pe_ratio?: number;
        dividend_yield?: number;
        debt_to_equity?: number;
        cash_on_hand?: number;
        runway_years?: number;
        gross_margin?: number;
    } | null;
    watchers: number;
}

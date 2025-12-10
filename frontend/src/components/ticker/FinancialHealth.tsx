import { TrendingUp, AlertTriangle, DollarSign, Wallet } from 'lucide-react';

interface FinancialHealthProps {
    fundamentals: {
        market_cap?: number;
        pe_ratio?: number;
        dividend_yield?: number;
        debt_to_equity?: number;
        cash_on_hand?: number;
        runway_years?: number;
        gross_margin?: number;
    } | null;
}

export function FinancialHealth({ fundamentals }: FinancialHealthProps) {
    if (!fundamentals) return <div className="p-4 text-muted-foreground">No financial data available</div>;

    const formatCurrency = (val: number | undefined) => {
        if (val === undefined) return 'N/A';
        if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
        if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
        if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
        return `$${val.toLocaleString()}`;
    };

    const runwayColor = (years: number) => {
        if (years > 2) return 'text-green-500';
        if (years > 1) return 'text-yellow-500';
        return 'text-red-500';
    };

    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted/30 rounded-xl border border-border">
                <div className="flex items-center gap-2 mb-2 text-muted-foreground text-xs font-bold uppercase">
                    <DollarSign size={14} /> Market Cap
                </div>
                <div className="text-xl font-bold">{formatCurrency(fundamentals.market_cap)}</div>
            </div>

            <div className="p-4 bg-muted/30 rounded-xl border border-border">
                <div className="flex items-center gap-2 mb-2 text-muted-foreground text-xs font-bold uppercase">
                    <TrendingUp size={14} /> P/E Ratio
                </div>
                <div className="text-xl font-bold">{fundamentals.pe_ratio ? fundamentals.pe_ratio?.toFixed(2) : '-'}</div>
            </div>

            {fundamentals.cash_on_hand !== undefined && (
                <div className="p-4 bg-muted/30 rounded-xl border border-border col-span-2">
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase">
                            <Wallet size={14} /> Cash & Runway
                        </div>
                        {fundamentals.runway_years !== undefined && (
                            <span className={`text-sm font-bold ${runwayColor(fundamentals.runway_years)}`}>
                                {fundamentals.runway_years} Years Runway
                            </span>
                        )}
                    </div>
                    <div className="text-2xl font-bold">{formatCurrency(fundamentals.cash_on_hand)}</div>
                </div>
            )}

            <div className="p-4 bg-muted/30 rounded-xl border border-border">
                <div className="flex items-center gap-2 mb-2 text-muted-foreground text-xs font-bold uppercase">
                    <AlertTriangle size={14} /> Debt/Equity
                </div>
                <div className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-500">
                    {fundamentals.debt_to_equity ? fundamentals.debt_to_equity.toFixed(2) : '-'}
                </div>
            </div>

            <div className="p-4 bg-muted/30 rounded-xl border border-border">
                <div className="flex items-center gap-2 mb-2 text-muted-foreground text-xs font-bold uppercase">
                    <TrendingUp size={14} /> Yield
                </div>
                <div className="text-xl font-bold text-green-500">
                    {fundamentals.dividend_yield ? `${(fundamentals.dividend_yield * 100).toFixed(2)}%` : '-'}
                </div>
            </div>
        </div>
    );
}

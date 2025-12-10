import { TrendingUp, AlertTriangle, DollarSign, Wallet } from 'lucide-react';
import type { TickerData } from '../../types/ticker';

interface FinancialHealthProps {
    fundamentals: TickerData['fundamentals'];
}

export function FinancialHealth({ fundamentals }: FinancialHealthProps) {
    if (!fundamentals) return <div className="text-muted-foreground">No financial data available</div>;

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-8">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider">
                    <DollarSign size={14} /> Market Cap
                </div>
                <div className="text-2xl font-mono font-bold tracking-tight">{formatCurrency(fundamentals.market_cap)}</div>
            </div>

            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider">
                    <TrendingUp size={14} /> P/E Ratio
                </div>
                <div className="text-2xl font-mono font-bold tracking-tight">{fundamentals.pe_ratio ? fundamentals.pe_ratio?.toFixed(2) : '-'}</div>
            </div>

            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider">
                    <AlertTriangle size={14} /> Debt/Equity
                </div>
                <div className="text-2xl font-mono font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-500">
                    {fundamentals.debt_to_equity ? fundamentals.debt_to_equity.toFixed(2) : '-'}
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider">
                    <TrendingUp size={14} /> Yield
                </div>
                <div className="text-2xl font-mono font-bold tracking-tight text-green-500">
                    {fundamentals.dividend_yield ? `${(fundamentals.dividend_yield * 100).toFixed(2)}%` : '-'}
                </div>
            </div>

            {fundamentals.cash_on_hand !== undefined && (
                <div className="flex flex-col gap-1 col-span-2 md:col-span-4 border-t border-border/50 pt-6 mt-2">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider mb-1">
                        <Wallet size={14} /> Cash & Runway
                    </div>
                    <div className="flex items-baseline gap-4">
                        <div className="text-2xl font-mono font-bold tracking-tight">{formatCurrency(fundamentals.cash_on_hand)}</div>
                        {fundamentals.runway_years !== undefined && (
                            <span className={`text-sm font-bold ${runwayColor(fundamentals.runway_years)} bg-muted/30 px-2 py-0.5 rounded`}>
                                {fundamentals.runway_years} Years Runway
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

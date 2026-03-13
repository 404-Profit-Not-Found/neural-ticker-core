import { TrendingUp, AlertTriangle, DollarSign, Wallet } from 'lucide-react';
import type { TickerData } from '../../types/ticker';

interface FinancialHealthProps {
    fundamentals: TickerData['fundamentals'];
    currency?: string;
}

const Metric = ({ label, value, subtext }: { label: string; value: React.ReactNode; subtext?: string }) => (
    <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
        <div className="text-lg font-bold text-foreground tracking-tight flex items-baseline gap-1">
            {value}
            {subtext && <span className="text-xs text-muted-foreground font-normal">{subtext}</span>}
        </div>
    </div>
);

const SectionHeader = ({ title, icon }: { title: string; icon: React.ReactNode }) => (
    <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider mb-4 border-b border-border/40 pb-2">
        {icon} {title}
    </div>
);

export function FinancialHealth({ fundamentals, currency = 'USD' }: FinancialHealthProps) {
    if (!fundamentals) return <div className="text-muted-foreground">No financial data available</div>;

    const formatCurrency = (val: number | undefined | null) => {
        if (val === undefined || val === null) return 'N/A';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: "compact", maximumFractionDigits: 2 }).format(val);
    };

    const formatNumber = (val: number | undefined | null, decimals = 2) => {
        if (val === undefined || val === null) return '-';
        return Number(val).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    };

    const formatPercent = (val: number | undefined | null) => {
        if (val === undefined || val === null) return '-';
        return `${(val * 100).toFixed(2)}%`;
    };



    return (
        <div className="flex flex-col gap-8">
            {/* Valuation & Size */}
            <div>
                <SectionHeader title="Valuation & Size" icon={<DollarSign size={14} />} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <Metric label="Market Cap" value={formatCurrency(fundamentals.market_cap)} />
                    <Metric label="P/E Ratio" value={formatNumber(fundamentals.pe_ratio)} />
                    <Metric label="Price/Book" value={formatNumber(fundamentals.price_to_book)} />
                    <Metric label="Shares Out" value={fundamentals.shares_outstanding ? new Intl.NumberFormat('en-US', { notation: "compact" }).format(fundamentals.shares_outstanding) : '-'} subtext="Outstanding" />
                </div>
            </div>

            {/* Profitability */}
            <div>
                <SectionHeader title="Profitability" icon={<TrendingUp size={14} />} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <Metric label="Revenue (TTM)" value={formatCurrency(fundamentals.revenue_ttm)} />
                    <Metric label="Gross Margin" value={formatPercent(fundamentals.gross_margin)} />
                    <Metric label="Operating Margin" value={formatPercent(fundamentals.operating_margin)} />
                    <Metric label="Net Profit Margin" value={formatPercent(fundamentals.net_profit_margin)} />
                    <Metric label="ROE" value={formatPercent(fundamentals.roe)} />
                    <Metric label="ROA" value={formatPercent(fundamentals.roa)} />
                    <Metric label="Earnings Growth" value={formatPercent(fundamentals.earnings_growth_yoy)} subtext="YoY" />
                    <Metric label="Free Cash Flow" value={formatCurrency(fundamentals.free_cash_flow_ttm)} />
                </div>
            </div>

            {/* Financial Strength */}
            <div>
                <SectionHeader title="Financial Health" icon={<AlertTriangle size={14} />} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <Metric
                        label="Debt/Equity"
                        value={
                            <span className={fundamentals.debt_to_equity && fundamentals.debt_to_equity > 2 ? "text-red-500" : ""}>
                                {formatNumber(fundamentals.debt_to_equity)}
                            </span>
                        }
                    />
                    <Metric label="Current Ratio" value={formatNumber(fundamentals.current_ratio)} />
                    <Metric label="Quick Ratio" value={formatNumber(fundamentals.quick_ratio)} />
                    <Metric label="Interest Cov" value={
                        <span className={fundamentals.interest_coverage && fundamentals.interest_coverage < 1.5 ? "text-red-500" : ""}>
                            {formatNumber(fundamentals.interest_coverage)}
                        </span>
                    } />
                    <Metric label="Book Value/Share" value={formatCurrency(fundamentals.book_value_per_share)} />
                    <Metric label="Debt/Assets" value={formatNumber(fundamentals.debt_to_assets)} />
                </div>
            </div>

            {/* Yields & Runway */}
            <div>
                <SectionHeader title="Yields & Liquidity" icon={<Wallet size={14} />} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <Metric label="Dividend Yield" value={<span className="text-green-500">{formatPercent(fundamentals.dividend_yield)}</span>} />
                    {fundamentals.cash_on_hand !== undefined && (
                        <Metric label="Cash on Hand" value={formatCurrency(fundamentals.cash_on_hand)} />
                    )}
                    {fundamentals.runway_years !== undefined && (
                        <Metric
                            label="Runway"
                            value={`${fundamentals.runway_years} Years`}
                            subtext={fundamentals.runway_years < 1 ? "Critical" : "Healthy"}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

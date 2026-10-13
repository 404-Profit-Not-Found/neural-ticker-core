import { AlertTriangle, DollarSign, TrendingUp, Wallet } from 'lucide-react';
import type { TickerData } from '../../types/ticker';
import { cn } from '../../lib/utils';
import {
    EM_DASH,
    formatCompactCurrency,
    formatFraction,
    formatPrice,
    formatRatio,
    formatSharesOutstanding,
    toNumber,
} from '../../lib/format';

interface FinancialHealthProps {
    fundamentals: TickerData['fundamentals'];
    currency?: string;
}

function Metric({ label, value, note, tone }: {
    label: string;
    value: string;
    /** Unit or context after the value, e.g. "YoY". */
    note?: string;
    tone?: 'down';
}) {
    const missing = value === EM_DASH;
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <dt className="label-micro">{label}</dt>
            <dd className={cn(
                'num flex items-baseline gap-1.5 text-base font-semibold sm:text-lg',
                missing ? 'text-muted-foreground' : tone === 'down' ? 'text-down' : 'text-foreground',
            )}>
                {value}
                {note && !missing && <span className="font-sans text-xs font-normal text-muted-foreground">{note}</span>}
            </dd>
        </div>
    );
}

function Group({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="min-w-0">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="text-muted-foreground" aria-hidden>{icon}</span>
                {title}
            </h3>
            {/* Two columns on a phone, four on a desktop; groups are told apart
                by space, not rules. */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">{children}</dl>
        </section>
    );
}

/**
 * Fundamentals as the API reports them. A figure that is not available is an
 * em dash — never a zero or a guess — and nothing is tinted "good" unless the
 * number itself is a warning (high leverage, thin interest cover).
 */
export function FinancialHealth({ fundamentals, currency = 'USD' }: FinancialHealthProps) {
    if (!fundamentals) return null;

    const debtToEquity = toNumber(fundamentals.debt_to_equity);
    const interestCoverage = toNumber(fundamentals.interest_coverage);
    const runway = toNumber(fundamentals.runway_years);

    return (
        <div className="flex flex-col gap-7">
            <Group title="Valuation & size" icon={<DollarSign size={15} />}>
                <Metric label="Market cap" value={formatCompactCurrency(fundamentals.market_cap, currency)} />
                <Metric label="P/E ratio" value={formatRatio(fundamentals.pe_ratio)} />
                <Metric label="Price / book" value={formatRatio(fundamentals.price_to_book)} />
                <Metric label="Shares outstanding" value={formatSharesOutstanding(fundamentals.shares_outstanding)} />
            </Group>

            <Group title="Profitability" icon={<TrendingUp size={15} />}>
                <Metric label="Revenue (TTM)" value={formatCompactCurrency(fundamentals.revenue_ttm, currency)} />
                <Metric label="Gross margin" value={formatFraction(fundamentals.gross_margin)} />
                <Metric label="Operating margin" value={formatFraction(fundamentals.operating_margin)} />
                <Metric label="Net margin" value={formatFraction(fundamentals.net_profit_margin)} />
                <Metric label="Return on equity" value={formatFraction(fundamentals.roe)} />
                <Metric label="Return on assets" value={formatFraction(fundamentals.roa)} />
                <Metric label="Earnings growth" value={formatFraction(fundamentals.earnings_growth_yoy)} note="YoY" />
                <Metric label="Free cash flow" value={formatCompactCurrency(fundamentals.free_cash_flow_ttm, currency)} />
            </Group>

            <Group title="Balance sheet" icon={<AlertTriangle size={15} />}>
                <Metric
                    label="Debt / equity"
                    value={formatRatio(debtToEquity)}
                    tone={debtToEquity !== null && debtToEquity > 2 ? 'down' : undefined}
                />
                <Metric label="Debt / assets" value={formatRatio(fundamentals.debt_to_assets)} />
                <Metric label="Current ratio" value={formatRatio(fundamentals.current_ratio)} />
                <Metric label="Quick ratio" value={formatRatio(fundamentals.quick_ratio)} />
                <Metric
                    label="Interest coverage"
                    value={formatRatio(interestCoverage)}
                    note="×"
                    tone={interestCoverage !== null && interestCoverage < 1.5 ? 'down' : undefined}
                />
                <Metric label="Book value / share" value={formatPrice(fundamentals.book_value_per_share, currency)} />
            </Group>

            <Group title="Yield & liquidity" icon={<Wallet size={15} />}>
                <Metric label="Dividend yield" value={formatFraction(fundamentals.dividend_yield)} />
                {fundamentals.cash_on_hand !== undefined && (
                    <Metric label="Cash on hand" value={formatCompactCurrency(fundamentals.cash_on_hand, currency)} />
                )}
                {fundamentals.runway_years !== undefined && (
                    <Metric
                        label="Runway"
                        value={runway === null ? EM_DASH : `${formatRatio(runway, 1)} yr`}
                        tone={runway !== null && runway < 1 ? 'down' : undefined}
                    />
                )}
            </Group>
        </div>
    );
}

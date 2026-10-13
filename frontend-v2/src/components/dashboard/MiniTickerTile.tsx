import { Link } from 'react-router-dom';
import { cn } from '../../lib/api';
import { useCurrency } from '../../context/CurrencyContext';
import { riskBand, type RiskBand } from '../../lib/ticker-metrics';

interface MiniTickerTileProps {
    symbol: string;
    company?: string;
    price: number;
    change: number;
    changeAmount?: number;
    riskScore: number;
    href: string;
    currency?: string;
}

const RISK_TINT: Record<RiskBand, string> = {
    low: 'bg-up/15 text-up',
    medium: 'bg-amber-500/15 text-amber-700 dark:text-yellow-400',
    high: 'bg-down/15 text-down',
};

/** A ticker mentioned by the digest: symbol, day change, price and risk. */
export function MiniTickerTile({ symbol, company, price, change, changeAmount, riskScore, href, currency = 'USD' }: MiniTickerTileProps) {
    const { formatNative } = useCurrency();
    const fmt = (val: number) => formatNative(val, currency);
    // Exactly zero is neutral — never dressed up as a gain.
    const flat = Math.abs(change) < 0.005;
    const tone = flat ? 'text-muted-foreground' : change > 0 ? 'text-up' : 'text-down';
    const sign = flat ? '' : change > 0 ? '+' : '−';
    const risk = Math.round(riskScore);

    return (
        <Link
            to={href}
            className="group flex flex-col rounded-lg bg-muted p-3 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">{symbol}</span>
                    {company && <span className="line-clamp-1 text-[11px] text-muted-foreground">{company}</span>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn('num text-xs font-semibold leading-none', tone)}>
                        {sign}{Math.abs(change).toFixed(2)}%
                    </span>
                    {changeAmount !== undefined && (
                        <span className={cn('num text-[11px] leading-none', tone)}>
                            {sign}{fmt(Math.abs(changeAmount))}
                        </span>
                    )}
                </div>
            </div>
            <div className="mt-auto flex items-end justify-between gap-2">
                <span className="num text-xs font-semibold text-foreground">{fmt(price)}</span>
                <span
                    className={cn('num rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold leading-none', RISK_TINT[riskBand(risk)])}
                    title={`Risk ${risk} of 10`}
                >
                    Risk {risk}
                </span>
            </div>
        </Link>
    );
}

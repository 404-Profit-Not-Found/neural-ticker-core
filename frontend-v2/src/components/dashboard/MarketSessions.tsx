import { useAllMarketsStatus, type MarketStatusData } from '../../hooks/useMarketStatus';
import { cn } from '../../lib/utils';

function Session({ code, status }: { code: string; status?: MarketStatusData }) {
    if (!status) return null;
    // Only the regular session is "open": pre- and post-market read as closed
    // (same rule as getSessionLabel).
    const open = status.session === 'regular';
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className={cn('led', open ? 'led-up' : 'led-off')} aria-hidden />
            <span className="text-xs text-muted-foreground">
                {code}{' '}
                <span className={cn('font-medium', open ? 'text-up' : 'text-foreground/80')}>
                    {open ? 'open' : 'closed'}
                </span>
            </span>
        </span>
    );
}

/** Exchange sessions as one quiet inline line ("US closed · EU open"). */
export function MarketSessions({ className }: { className?: string }) {
    const { data } = useAllMarketsStatus();
    if (!data) return null;
    return (
        <span className={cn('inline-flex items-center gap-3', className)}>
            <Session code="US" status={data.us} />
            <Session code="EU" status={data.eu} />
        </span>
    );
}

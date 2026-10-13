import { Check, X } from 'lucide-react';
import { Button } from '../ui/button';
import { TickerLogo } from '../dashboard/TickerLogo';
import { formatDateTime } from '../../lib/datetime';
import { AdminRow, RequestStatusStamp } from './admin-ui';
import type { ExtendedTickerRequest } from './model';
import { useRequestTickerInfo } from './useRequestTickerInfo';

interface TickerRequestListRowProps {
    request: ExtendedTickerRequest;
    onApprove: (id: string, symbol: string) => void;
    onReject: (id: string, symbol: string) => void;
}

/**
 * A ticker request as one compact row — the phone view of the Requests tab.
 * A pending request carries its two decisions at the end of the row.
 *
 *   (ARM)  ARM [PENDING]                         [✓] [✕]
 *          BoldLynx64 · WHALE
 *          11 Oct, 11:54 · priya.raman@example.com
 */
export function TickerRequestListRow({ request, onApprove, onReject }: TickerRequestListRowProps) {
    const info = useRequestTickerInfo(request.symbol);
    const tier = request.user?.tier || 'free';
    const pending = request.status?.toUpperCase() === 'PENDING';

    return (
        <AdminRow
            identifier
            leading={<TickerLogo symbol={request.symbol} className="h-10 w-10 shrink-0" />}
            title={request.symbol}
            stamps={
                <>
                    <RequestStatusStamp status={request.status} />
                    {info?.name && (
                        <span className="min-w-0 truncate text-[13px] text-muted-foreground" title={info.name}>
                            {info.name}
                        </span>
                    )}
                </>
            }
            subtitle={
                <>
                    {request.user?.nickname || 'Unknown user'}
                    {tier !== 'free' && <span className="num text-[11px] font-semibold uppercase"> · {tier}</span>}
                </>
            }
            meta={
                <>
                    <span className="num shrink-0">{formatDateTime(request.created_at)}</span>
                    {request.user?.email && (
                        <>
                            <span aria-hidden>·</span>
                            <span className="truncate">{request.user.email}</span>
                        </>
                    )}
                </>
            }
            action={
                pending ? (
                    <div className="flex shrink-0 items-center gap-2 pr-2.5">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-11 w-11 text-up hover:bg-up/10 hover:text-up"
                            onClick={() => onApprove(request.id, request.symbol)}
                            title="Approve"
                            aria-label={`Approve ${request.symbol}`}
                        >
                            <Check size={18} aria-hidden />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-11 w-11 text-down hover:bg-down/10 hover:text-down"
                            onClick={() => onReject(request.id, request.symbol)}
                            title="Reject"
                            aria-label={`Reject ${request.symbol}`}
                        >
                            <X size={18} aria-hidden />
                        </Button>
                    </div>
                ) : undefined
            }
        />
    );
}

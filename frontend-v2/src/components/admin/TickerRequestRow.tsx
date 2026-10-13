import { Check, X } from 'lucide-react';
import { Button } from '../ui/button';
import { TickerLogo } from '../dashboard/TickerLogo';
import { formatDateTime } from '../../lib/datetime';
import { cn } from '../../lib/utils';
import { ADMIN_CELL, RequestStatusStamp, UserAvatar } from './admin-ui';
import type { ExtendedTickerRequest } from './model';
import { useRequestTickerInfo } from './useRequestTickerInfo';

interface TickerRequestRowProps {
    request: ExtendedTickerRequest;
    onApprove: (id: string, symbol: string) => void;
    onReject: (id: string, symbol: string) => void;
}

/** A ticker request as a table row — the desktop view of the Requests tab. */
export function TickerRequestRow({ request, onApprove, onReject }: TickerRequestRowProps) {
    const info = useRequestTickerInfo(request.symbol);
    const tier = request.user?.tier || 'free';
    const pending = request.status?.toUpperCase() === 'PENDING';

    return (
        <tr>
            <td className={cn(ADMIN_CELL, 'w-[45%] max-w-0')}>
                <div className="flex min-w-0 items-center gap-3">
                    <TickerLogo symbol={request.symbol} className="h-10 w-10 shrink-0" />
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">{request.symbol}</div>
                        {info?.name && (
                            <div className="truncate text-xs text-muted-foreground" title={info.name}>
                                {info.name}
                                {info.exchange && <span className="num"> · {info.exchange}</span>}
                            </div>
                        )}
                    </div>
                </div>
            </td>

            <td className={cn(ADMIN_CELL, 'whitespace-nowrap')}>
                <RequestStatusStamp status={request.status} />
            </td>

            <td className={cn(ADMIN_CELL, 'w-[55%] max-w-0')}>
                <div className="flex min-w-0 items-center gap-2.5">
                    <UserAvatar
                        email={request.user?.email}
                        nickname={request.user?.nickname}
                        avatarUrl={request.user?.avatar_url}
                        className="h-7 w-7 text-[10px]"
                    />
                    <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-foreground">
                            {request.user?.nickname || 'Unknown user'}
                            {tier !== 'free' && <span className="num text-[11px] font-semibold uppercase text-muted-foreground"> · {tier}</span>}
                        </div>
                        {request.user?.email && <div className="truncate text-xs text-muted-foreground">{request.user.email}</div>}
                    </div>
                </div>
            </td>

            <td className={cn(ADMIN_CELL, 'num whitespace-nowrap text-xs text-muted-foreground')}>
                {formatDateTime(request.created_at)}
            </td>

            <td className={cn(ADMIN_CELL, 'whitespace-nowrap')}>
                {pending && (
                    <div className="flex justify-end gap-1.5">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 px-2.5 text-xs text-up hover:bg-up/10 hover:text-up"
                            onClick={() => onApprove(request.id, request.symbol)}
                            title="Approve"
                            aria-label={`Approve ${request.symbol}`}
                        >
                            <Check size={14} aria-hidden />
                            Approve
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 px-2.5 text-xs text-down hover:bg-down/10 hover:text-down"
                            onClick={() => onReject(request.id, request.symbol)}
                            title="Reject"
                            aria-label={`Reject ${request.symbol}`}
                        >
                            <X size={14} aria-hidden />
                            Reject
                        </Button>
                    </div>
                )}
            </td>
        </tr>
    );
}

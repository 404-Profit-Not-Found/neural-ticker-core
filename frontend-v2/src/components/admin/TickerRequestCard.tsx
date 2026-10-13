import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Check, X } from 'lucide-react';
import { TickerLogo } from '../dashboard/TickerLogo';
import { formatDateTime } from '../../lib/datetime';
import { cn } from '../../lib/utils';
import type { ExtendedTickerRequest } from './TickerRequestRow';
import { useState, useEffect } from 'react';
import { AdminService } from '../../services/adminService';

interface TickerRequestCardProps {
    request: ExtendedTickerRequest;
    onApprove: (id: string, symbol: string) => void;
    onReject: (id: string, symbol: string) => void;
}

export function TickerRequestCard({ request, onApprove, onReject }: TickerRequestCardProps) {
    const tier = request.user?.tier || 'free';
    const [tickerInfo, setTickerInfo] = useState<{ name?: string, exchange?: string } | null>(null);

    useEffect(() => {
        const fetchInfo = async () => {
            try {
                const results = await AdminService.searchTickersAdmin(request.symbol);
                const match = results.find(r => r.symbol === request.symbol);
                if (match) {
                    setTickerInfo({ name: match.name, exchange: match.exchange });
                }
            } catch {
                console.error("Failed to fetch info for", request.symbol);
            }
        };
        fetchInfo();
    }, [request.symbol]);

    const requester = request.user?.nickname || 'Unknown user';

    return (
        <div className="flex flex-col gap-3 rounded-lg bg-card p-4">
            <div className="flex items-center gap-3">
                <TickerLogo symbol={request.symbol} className="h-10 w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[15px] font-semibold leading-tight text-foreground">{request.symbol}</span>
                        {/* Same status stamps as the Users tab. */}
                        <Badge
                            variant={request.status === 'PENDING' ? 'waitlist' : request.status === 'APPROVED' ? 'active' : 'statusBanned'}
                            className="h-5 px-1.5 text-[11px] uppercase"
                        >
                            {request.status}
                        </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
                        {tickerInfo?.name || 'Ticker request'}
                        {tickerInfo?.exchange && <span className="num"> · {tickerInfo.exchange}</span>}
                    </div>
                </div>
            </div>

            <div className="min-w-0 text-xs text-muted-foreground">
                <span className="block truncate">
                    <span className="font-medium text-foreground">{requester}</span>
                    {tier !== 'free' && (
                        <span className={cn('ml-1.5 font-semibold uppercase', tier === 'whale' ? 'text-amber-500' : 'text-purple-400')}>{tier}</span>
                    )}
                    {request.user?.email && <> · {request.user.email}</>}
                </span>
                <span className="num mt-0.5 block">{formatDateTime(request.created_at)}</span>
            </div>

            {request.status === 'PENDING' && (
                <div className="grid grid-cols-2 gap-2">
                    <Button
                        variant="outline"
                        className="h-11 gap-2 text-up hover:bg-up/10 hover:text-up lg:h-9"
                        onClick={() => onApprove(request.id, request.symbol)}
                        title="Approve"
                        aria-label={`Approve ${request.symbol}`}
                    >
                        <Check size={16} />
                        Approve
                    </Button>
                    <Button
                        variant="outline"
                        className="h-11 gap-2 text-down hover:bg-down/10 hover:text-down lg:h-9"
                        onClick={() => onReject(request.id, request.symbol)}
                        title="Reject"
                        aria-label={`Reject ${request.symbol}`}
                    >
                        <X size={16} />
                        Reject
                    </Button>
                </div>
            )}
        </div>
    );
}

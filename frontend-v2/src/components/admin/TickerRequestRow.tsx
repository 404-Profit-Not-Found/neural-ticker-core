import { Badge } from '../ui/badge';
import { UserTierBadge } from '../ui/user-tier-badge';
import { Button } from '../ui/button';
import { Check, X } from 'lucide-react';
import { TickerLogo } from '../dashboard/TickerLogo';
import { formatDateTime } from '../../lib/datetime';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { AdminService } from '../../services/adminService';


export interface ExtendedTickerRequest {
    id: string;
    symbol: string;
    user_id: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    created_at: string;
    user?: {
        id: string;
        email: string;
        nickname?: string;
        avatar_url?: string;
        tier?: 'free' | 'pro' | 'whale';
    };
}

interface TickerRequestRowProps {
    request: ExtendedTickerRequest;
    onApprove: (id: string, symbol: string) => void;
    onReject: (id: string, symbol: string) => void;
    isFirst?: boolean;
    isLast?: boolean;
}

export function TickerRequestRow({ request, onApprove, onReject, isFirst, isLast }: TickerRequestRowProps) {
    const tier = request.user?.tier || 'free';
    const [tickerInfo, setTickerInfo] = useState<{ name?: string, exchange?: string } | null>(null);

    useEffect(() => {
        const fetchInfo = async () => {
            try {
                // Try search to get name/exchange
                const results = await AdminService.searchTickersAdmin(request.symbol);
                const match = results.find(r => r.symbol === request.symbol);
                if (match) {
                    setTickerInfo({ name: match.name, exchange: match.exchange });
                }
            } catch {
                // silent fail
                console.error("Failed to fetch info for", request.symbol);
            }
        };
        fetchInfo();
    }, [request.symbol]);



    const cellClass = (index: number, total: number) => cn(
        "p-4 align-middle whitespace-nowrap bg-card transition-colors",
        isFirst && "first:rounded-tl-lg first:rounded-bl-lg", // rounded corners for the row group
        isLast && "last:rounded-tr-lg last:rounded-br-lg",
        // Actually AnalyzerTableView appies it per row (first and last cell of the row)
        // first:border-l first:rounded-l-lg last:border-r last:rounded-r-lg
        index === 0 && "pl-6 rounded-l-lg",
        index === total - 1 && "pr-6 rounded-r-lg"
    );

    return (
        <tr className="group relative">
            {/* Symbol & Logo */}
            <td className={cellClass(0, 5)}>
                <div className="flex items-center gap-4">
                    <div className="relative w-10 h-10 overflow-hidden rounded-full bg-background/50">
                        <TickerLogo symbol={request.symbol} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-lg font-bold font-mono tracking-tight text-foreground group-hover:text-primary transition-colors">
                            {request.symbol}
                        </span>
                        <div className="flex flex-col">
                            {tickerInfo?.name ? (
                                <span className="text-xs font-medium text-muted-foreground line-clamp-1 max-w-[200px]" title={tickerInfo.name}>
                                    {tickerInfo.name}
                                </span>
                            ) : (
                                <span className="text-xs text-muted-foreground">Request</span>
                            )}
                            {tickerInfo?.exchange && (
                                <span className="text-[11px] text-muted-foreground uppercase">
                                    {tickerInfo.exchange}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </td>

            {/* Status */}
            <td className={cellClass(1, 5)}>
                {/* Same status stamps as the Users tab: tinted fills, one vocabulary. */}
                <Badge
                    variant={request.status === 'PENDING' ? 'waitlist' : request.status === 'APPROVED' ? 'active' : 'statusBanned'}
                    className="h-5 px-1.5 text-[11px] uppercase"
                >
                    {request.status}
                </Badge>
            </td>

            {/* Requestor */}
            <td className={cellClass(2, 5)}>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {request.user?.avatar_url ? (
                            <img src={request.user.avatar_url} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-xs font-bold text-muted-foreground">
                                {request.user?.nickname?.slice(0, 2).toUpperCase() || '??'}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                                {request.user?.nickname || 'Unknown user'}
                            </span>
                            {tier !== 'free' && (
                                <UserTierBadge tier={tier} className="h-5 gap-0.5 px-1 text-[11px]" />
                            )}
                        </div>
                        <span className="text-xs text-muted-foreground">{request.user?.email}</span>
                    </div>
                </div>
            </td>

            {/* Date */}
            <td className={cellClass(3, 5)}>
                <span className="num text-xs text-muted-foreground">{formatDateTime(request.created_at)}</span>
            </td>

            {/* Actions */}
            <td className={cellClass(4, 5)}>
                {request.status === 'PENDING' && (
                    <div className="flex justify-end gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-9 gap-1.5 px-3 text-up hover:bg-up/10 hover:text-up"
                            onClick={() => onApprove(request.id, request.symbol)}
                            title="Approve"
                            aria-label={`Approve ${request.symbol}`}
                        >
                            <Check size={16} />
                            Approve
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-9 gap-1.5 px-3 text-down hover:bg-down/10 hover:text-down"
                            onClick={() => onReject(request.id, request.symbol)}
                            title="Reject"
                            aria-label={`Reject ${request.symbol}`}
                        >
                            <X size={16} />
                            Reject
                        </Button>
                    </div>
                )}
            </td>
        </tr>
    );
}

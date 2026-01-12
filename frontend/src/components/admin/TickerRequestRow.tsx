import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Check, X, Star, Crown } from 'lucide-react';
import { TickerLogo } from '../dashboard/TickerLogo';
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

    const getTierIcon = (tier: string) => {
        switch (tier) {
            case 'whale': return <Crown size={12} className="text-amber-400" />;
            case 'pro': return <Star size={12} className="text-purple-400" />;
            default: return null;
        }
    };

    const getTierBadgeStyle = (tier: string) => {
        switch (tier) {
            case 'whale': return "border-amber-500/20 text-amber-500 bg-amber-500/5";
            case 'pro': return "border-purple-500/20 text-purple-400 bg-purple-500/5";
            default: return "border-muted text-muted-foreground";
        }
    };

    const cellClass = (index: number, total: number) => cn(
        "p-4 align-middle whitespace-nowrap bg-card border-y border-border/40 transition-colors shadow-sm",
        isFirst && "first:rounded-tl-lg first:rounded-bl-lg", // rounded corners for the row group
        isLast && "last:rounded-tr-lg last:rounded-br-lg",
        // Actually AnalyzerTableView appies it per row (first and last cell of the row)
        // first:border-l first:rounded-l-lg last:border-r last:rounded-r-lg
        index === 0 && "pl-6 border-l rounded-l-lg",
        index === total - 1 && "pr-6 border-r rounded-r-lg"
    );

    return (
        <tr className="group transition-all hover:bg-muted/30 relative">
            {/* Symbol & Logo */}
            <td className={cellClass(0, 5)}>
                <div className="flex items-center gap-4">
                    <div className="relative w-10 h-10 overflow-hidden rounded-full ring-1 ring-border/50 bg-background/50">
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
                                <span className="text-[10px] text-muted-foreground/70 uppercase">
                                    {tickerInfo.exchange}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </td>

            {/* Status */}
            <td className={cellClass(1, 5)}>
                <Badge
                    variant={request.status === 'PENDING' ? 'secondary' : request.status === 'APPROVED' ? 'default' : 'destructive'}
                    className="shadow-sm font-mono text-xs uppercase"
                >
                    {request.status}
                </Badge>
            </td>

            {/* Requestor */}
            <td className={cellClass(2, 5)}>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 ring-1 ring-border/50 overflow-hidden">
                        {request.user?.avatar_url ? (
                            <img src={request.user.avatar_url} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-xs font-bold text-muted-foreground">
                                {request.user?.email?.slice(0, 2).toUpperCase() || '??'}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                                {request.user?.nickname || request.user?.email?.split('@')[0]}
                            </span>
                            {tier !== 'free' && (
                                <Badge variant="outline" className={cn("text-[10px] h-4 px-1 gap-0.5", getTierBadgeStyle(tier))}>
                                    {getTierIcon(tier)}
                                    <span className="uppercase">{tier}</span>
                                </Badge>
                            )}
                        </div>
                        <span className="text-xs text-muted-foreground">{request.user?.email}</span>
                    </div>
                </div>
            </td>

            {/* Date */}
            <td className={cellClass(3, 5)}>
                <div className="flex flex-col text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                        {new Date(request.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-xs">
                        {new Date(request.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
            </td>

            {/* Actions */}
            <td className={cellClass(4, 5)}>
                {request.status === 'PENDING' && (
                    <div className="flex justify-end gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/20 shadow-sm"
                            onClick={() => onApprove(request.id, request.symbol)}
                            title="Approve"
                        >
                            <Check size={16} />
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20 shadow-sm"
                            onClick={() => onReject(request.id, request.symbol)}
                            title="Reject"
                        >
                            <X size={16} />
                        </Button>
                    </div>
                )}
            </td>
        </tr>
    );
}

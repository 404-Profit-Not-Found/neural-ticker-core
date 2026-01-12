import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Check, X, User as UserIcon } from 'lucide-react';
import { TickerLogo } from '../dashboard/TickerLogo';
import { cn } from '../../lib/utils';
import type { ExtendedTickerRequest } from './TickerRequestRow';
import { useState, useEffect } from 'react';
import { AdminService } from '../../services/adminService';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../ui/tooltip';

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

    return (
        <div className="bg-card rounded-lg p-4 border border-border/40 shadow-sm flex flex-col gap-3 group hover:border-primary/30 transition-all hover:shadow-md relative overflow-hidden">
            {/* Subtle Gradient Glow */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-background ring-1 ring-border/50 overflow-hidden flex items-center justify-center shrink-0">
                        <TickerLogo symbol={request.symbol} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground font-mono tracking-tight text-lg group-hover:text-primary transition-colors">
                                {request.symbol}
                            </span>
                            {request.status !== 'PENDING' && (
                                <Badge variant={request.status === 'APPROVED' ? 'default' : 'destructive'} className="text-[10px] h-4 px-1 rounded-sm">
                                    {request.status}
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                            {tickerInfo?.exchange && (
                                <span className="bg-muted px-1 rounded text-[10px] font-medium text-foreground/70">{tickerInfo.exchange}</span>
                            )}
                            <span className="truncate max-w-[150px]" title={tickerInfo?.name || "Request"}>
                                {tickerInfo?.name || "Ticker Request"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/30 mt-1">
                {/* User Info - Minimized */}
                <TooltipProvider>
                    <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 cursor-help opacity-70 hover:opacity-100 transition-opacity">
                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-1 ring-border/30">
                                    {request.user?.avatar_url ? (
                                        <img src={request.user.avatar_url} alt="User" className="w-full h-full object-cover" />
                                    ) : (
                                        <UserIcon size={12} className="text-muted-foreground" />
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-medium leading-none text-foreground/80">
                                        {request.user?.nickname || request.user?.email?.split('@')[0]}
                                    </span>
                                    {tier !== 'free' && (
                                        <span className={cn("text-[9px] leading-none uppercase font-bold mt-0.5",
                                            tier === 'whale' ? 'text-amber-500' : 'text-purple-500'
                                        )}>
                                            {tier}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            <p>{request.user?.email}</p>
                            <p className="text-muted-foreground opacity-70">Requested on: {new Date(request.created_at).toLocaleDateString()}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                {/* Actions */}
                {request.status === 'PENDING' ? (
                    <div className="flex gap-1.5">
                        <Button
                            size="icon"
                            variant="secondary"
                            className="h-7 w-7 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                            onClick={() => onApprove(request.id, request.symbol)}
                            title="Approve"
                        >
                            <Check size={14} />
                        </Button>
                        <Button
                            size="icon"
                            variant="secondary"
                            className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={() => onReject(request.id, request.symbol)}
                            title="Reject"
                        >
                            <X size={14} />
                        </Button>
                    </div>
                ) : (
                    <span className="text-[10px] text-muted-foreground">
                        {new Date(request.created_at).toLocaleDateString()}
                    </span>
                )}
            </div>
        </div>
    );
}

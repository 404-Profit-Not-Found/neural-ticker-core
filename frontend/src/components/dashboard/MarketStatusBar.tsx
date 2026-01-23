import { useAllMarketsStatus, getSessionLabel, getSessionColor } from '../../hooks/useMarketStatus';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/api';
import { DollarSign, Euro, Globe } from 'lucide-react';

interface MarketStatusBarProps {
    className?: string;
}

/**
 * Displays the status of all major markets (US and EU) in the header.
 */
export function MarketStatusBar({ className }: MarketStatusBarProps) {
    const { data, isLoading } = useAllMarketsStatus();

    if (isLoading) {
        return (
            <div className={cn("flex items-center gap-2", className)}>
                <div className="animate-pulse w-32 h-6 bg-muted rounded-full" />
            </div>
        );
    }

    if (!data) return null;

    const usStatus = data.us;
    const euStatus = data.eu;

    return (
        <div className={cn("flex items-center gap-2", className)}>
            {/* US Market */}
            <Badge
                variant="outline"
                className={cn(
                    "pl-1.5 pr-2.5 py-0.5 h-6 font-medium border transition-colors flex items-center gap-1.5 text-xs",
                    getSessionColor(usStatus.session) === 'text-emerald-500'
                        ? "border-emerald-500/60 bg-emerald-500/10"
                        : getSessionColor(usStatus.session) === 'text-amber-500'
                            ? "border-amber-500/60 bg-amber-500/10"
                            : "border-muted-foreground/50 bg-muted-foreground/10"
                )}
            >
                <DollarSign className="w-3.5 h-3.5 opacity-80" />
                <span className="text-muted-foreground">US:</span>
                <span className={cn("font-semibold", getSessionColor(usStatus.session))}>
                    {getSessionLabel(usStatus.session)}
                </span>
            </Badge>

            {/* EU Market */}
            <Badge
                variant="outline"
                className={cn(
                    "pl-1.5 pr-2.5 py-0.5 h-6 font-medium border transition-colors flex items-center gap-1.5 text-xs",
                    getSessionColor(euStatus.session) === 'text-emerald-500'
                        ? "border-emerald-500/60 bg-emerald-500/10"
                        : getSessionColor(euStatus.session) === 'text-amber-500'
                            ? "border-amber-500/60 bg-amber-500/10"
                            : "border-muted-foreground/50 bg-muted-foreground/10"
                )}
            >
                <Euro className="w-3.5 h-3.5 opacity-80" />
                <span className="text-muted-foreground">EU:</span>
                <span className={cn("font-semibold", getSessionColor(euStatus.session))}>
                    {getSessionLabel(euStatus.session)}
                </span>
            </Badge>

            {/* Asia Market */}
            {data.asia && (
                <Badge
                    variant="outline"
                    className={cn(
                        "pl-1.5 pr-2.5 py-0.5 h-6 font-medium border transition-colors flex items-center gap-1.5 text-xs",
                        getSessionColor(data.asia.session) === 'text-emerald-500'
                            ? "border-emerald-500/60 bg-emerald-500/10"
                            : getSessionColor(data.asia.session) === 'text-amber-500'
                                ? "border-amber-500/60 bg-amber-500/10"
                                : "border-muted-foreground/50 bg-muted-foreground/10"
                    )}
                >
                    <Globe className="w-3.5 h-3.5 opacity-80" />
                    <span className="text-muted-foreground">Asia:</span>
                    <span className={cn("font-semibold", getSessionColor(data.asia.session))}>
                        {getSessionLabel(data.asia.session)}
                    </span>
                </Badge>
            )}
        </div>
    );
}

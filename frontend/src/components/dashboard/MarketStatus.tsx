import { useMarketStatus, getSessionLabel, getSessionColor } from '../../hooks/useMarketStatus';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/api';

interface MarketStatusProps {
    className?: string;
}

export function MarketStatus({ className }: MarketStatusProps) {
    const { data: status, isLoading } = useMarketStatus();

    if (isLoading) {
        return <div className={cn("animate-pulse w-24 h-6 bg-muted rounded-full", className)} />;
    }

    if (!status) return null;

    const isOpen = status.isOpen;
    const sessionLabel = getSessionLabel(status.session);
    const sessionColorClass = getSessionColor(status.session);

    // Determine badge styling based on session
    const getBadgeBorderClass = () => {
        if (isOpen) return "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10";
        if (status.session === 'pre' || status.session === 'post') {
            return "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10";
        }
        return "border-muted-foreground/30 bg-muted-foreground/5 hover:bg-muted-foreground/10";
    };

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <Badge
                variant="outline"
                className={cn(
                    "pl-1.5 pr-2.5 py-0.5 h-6 font-medium border transition-colors flex items-center gap-1.5",
                    sessionColorClass,
                    getBadgeBorderClass()
                )}
            >
                <span className={cn("relative flex h-2 w-2")}>
                    {isOpen && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                    <span className={cn(
                        "relative inline-flex rounded-full h-2 w-2",
                        isOpen ? "bg-emerald-500" : status.session === 'pre' || status.session === 'post' ? "bg-amber-500" : "bg-muted-foreground"
                    )}></span>
                </span>
                {sessionLabel}
            </Badge>
        </div>
    );
}

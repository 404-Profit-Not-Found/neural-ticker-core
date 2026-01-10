import React, { useMemo } from 'react';
import { Bot } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../ui/tooltip';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../ui/popover';
import { calculateAiRating } from '../../lib/rating-utils';
import { cn } from '../../lib/api';
import { Badge } from '../ui/badge';

interface VerdictBadgeProps {
    risk: number;
    upside: number;
    overallScore?: number | null;
    className?: string;
    // New Weighted Props
    downside?: number;
    consensus?: string;
    pe?: number | null;
}

export const VerdictBadge: React.FC<VerdictBadgeProps> = ({
    risk,
    upside,
    overallScore,
    className,
    downside,
    consensus,
    pe
}) => {
    const getConsensusColor = (c?: string) => {
        if (!c) return "text-muted-foreground";
        const low = c.toLowerCase();
        if (low.includes('buy') || low.includes('outperform')) return "text-emerald-500";
        if (low.includes('sell') || low.includes('underperform')) return "text-red-500";
        return "text-yellow-500";
    };

    const getRiskColor = (r: number) => {
        if (r < 4) return "text-emerald-500"; // Low risk = Good
        if (r < 7) return "text-yellow-500"; // Medium risk
        return "text-red-500"; // High risk
    };

    const getScoreColor = (s?: number | null) => {
        if (!s) return "text-muted-foreground";
        if (s >= 7) return "text-emerald-500"; // High score = Good
        if (s >= 4) return "text-yellow-500"; // Medium score
        return "text-red-500"; // Low score
    };

    const { rating, variant, score } = useMemo(
        () => calculateAiRating({
            risk, 
            upside, 
            overallScore, 
            downside, 
            consensus,
            peRatio: pe
        }),
        [risk, upside, overallScore, downside, consensus, pe]
    );

    // We map our internal rating variant to the Badge's expected variant types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const badgeVariant = (variant === 'default' ? 'outline' : variant) as any;

    const BadgeContent = (
        <Badge variant={badgeVariant} className={cn("gap-1.5 h-6 px-2 whitespace-nowrap cursor-help", className)}>
            <Bot size={12} className="opacity-80" />
            {rating}
        </Badge>
    );

    const TooltipBody = (
         <div className="space-y-3">
            <div>
                <p className="font-bold text-sm flex items-center gap-2">
                    {rating} <span className="font-normal text-muted-foreground ml-auto text-xs">Score: {score?.toFixed(0) ?? '-'}</span>
                </p>
                <div className="h-1.5 w-full bg-secondary mt-1.5 rounded-full overflow-hidden">
                    <div 
                        className={cn("h-full rounded-full transition-all", 
                            variant === 'strongBuy' ? "bg-emerald-500" : 
                            variant === 'buy' ? "bg-emerald-400" :
                            variant === 'sell' ? "bg-red-500" : "bg-yellow-500"
                        )}
                        style={{ width: `${score ?? 50}%` }}
                    />
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                    <span>Upside:</span>
                    <span className="text-emerald-500 font-medium">{upside > 0 ? '+' : ''}{upside.toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                    <span>Downside:</span>
                    <span className="text-red-500 font-medium">{downside ? (downside > 0 ? '+' : '') + downside.toFixed(0) + '%' : 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                    <span>Fin. Risk:</span>
                    <span className={cn("font-medium", getRiskColor(risk))}>{risk.toFixed(1)}/10</span>
                </div>
                <div className="flex justify-between">
                    <span title="Overall Neural Risk/Reward Score">Neural Score:</span>
                    <span className={cn("font-medium", getScoreColor(overallScore))}>
                        {overallScore ? overallScore.toFixed(1) : '-'}/10
                    </span>
                </div>
                 <div className="flex justify-between items-center">
                    <span>Analyst:</span>
                    <span className={cn("font-medium text-right", getConsensusColor(consensus))}>{consensus ?? '-'}</span>
                </div>
                 <div className="flex justify-between items-center align-middle">
                    <span>P/E Ratio:</span>
                    <span className={cn("font-medium", 
                        !pe || pe < 0 || pe > 40 ? "text-red-500" : 
                        pe < 25 ? "text-emerald-500" : "text-yellow-500"
                    )}>
                        {pe === undefined || pe === null ? 'Pre-rev' : pe < 0 ? 'Loss' : pe.toFixed(2)}
                    </span>
                </div>
            </div>

            <p className="text-[10px] text-muted-foreground pt-1 border-t border-border opacity-70">
                Probability-weighted Bull/Base/Bear scenarios. Downside penalized 2x (Loss Aversion).
                <br />
                Low P/E (≤10) rewarded. Pre-revenue not penalized.
            </p>
        </div>
    );

    return (
        <TooltipProvider delayDuration={0}>
             {/* Mobile: Popover */}
             <div className="md:hidden">
                <Popover>
                    <PopoverTrigger asChild>
                        <button type="button" className="focus:outline-none active:scale-95 transition-transform" onClick={(e) => e.stopPropagation()}>
                            {BadgeContent}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="center" collisionPadding={10} className="w-[300px]">
                        {TooltipBody}
                    </PopoverContent>
                </Popover>
            </div>

            {/* Desktop: Tooltip */}
            <div className="hidden md:block">
                <Tooltip>
                    <TooltipTrigger asChild>
                         <button type="button" className="focus:outline-none hover:scale-105 transition-transform" onClick={(e) => e.stopPropagation()}>
                            {BadgeContent}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="p-4 min-w-[320px]">
                        {TooltipBody}
                    </TooltipContent>
                </Tooltip>
            </div>
        </TooltipProvider>
    );
};

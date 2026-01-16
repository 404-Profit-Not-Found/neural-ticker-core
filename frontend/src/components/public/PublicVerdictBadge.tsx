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

interface PublicVerdictBadgeProps {
    risk: number;
    upside: number;
    overallScore?: number | null;
    className?: string;
    downside?: number;
    consensus?: string;
    pe?: number | null;
    newsSentiment?: string | null;
    newsImpact?: number | null;
    currentPrice?: number;
    fiftyTwoWeekHigh?: number | null;
    fiftyTwoWeekLow?: number | null;
}

export const PublicVerdictBadge: React.FC<PublicVerdictBadgeProps> = ({
    risk,
    upside,
    overallScore,
    className,
    downside,
    consensus,
    pe,
    newsSentiment,
    newsImpact,
    currentPrice,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow
}) => {
    // --- COPY OF LOGIC (Zero Dependencies on original file) ---
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

    const { rating, variant, score, fiftyTwoWeekScore } = useMemo(
        () => calculateAiRating({
            risk,
            upside,
            overallScore,
            downside,
            consensus,
            consensus,
            peRatio: pe,
            newsSentiment,
            newsImpact,
            currentPrice,
            fiftyTwoWeekHigh,
            fiftyTwoWeekLow
        }),
        [risk, upside, overallScore, downside, consensus, pe, newsSentiment, newsImpact, currentPrice, fiftyTwoWeekHigh, fiftyTwoWeekLow]
    );

    // Filter variant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const badgeVariant = (variant === 'default' ? 'outline' : variant) as any;

    // --- RENDER ---
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
                            (variant === 'strongBuy' || variant === 'legendary') ? "bg-emerald-500" :
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
                    <span className="text-emerald-500 font-medium">{(upside || 0) > 0 ? '+' : ''}{(upside || 0).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                    <span>Downside:</span>
                    <span className="text-red-500 font-medium">{downside ? (downside > 0 ? '+' : '') + downside.toFixed(0) + '%' : 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                    <span>Fin. Risk:</span>
                    <span className={cn("font-medium", getRiskColor(risk || 5))}>{(risk || 0).toFixed(1)}/10</span>
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
                        {pe === undefined || pe === null ? 'n/a' : pe < 0 ? 'Loss' : pe.toFixed(2)}
                    </span>
                </div>

                {/* Smart News Row (Conditional) */}
                {(newsImpact || 0) > 0 && (
                    <>
                        <div className="flex justify-between items-center">
                            <span>Smart News:</span>
                            <span className={cn("font-medium",
                                newsSentiment === 'BULLISH' ? 'text-emerald-500' :
                                    newsSentiment === 'BEARISH' ? 'text-red-500' : 'text-blue-500'
                            )}>
                                {newsSentiment ?? 'Mixed'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span>News Impact:</span>
                            <span className={cn("font-medium",
                                (newsImpact || 0) >= 8 ? "text-yellow-500 font-bold" : "text-muted-foreground"
                            )}>
                                {newsImpact}/10
                            </span>
                        </div>
                    </>
                )}
            </div>

            <p className="text-[10px] text-muted-foreground pt-1 border-t border-border opacity-70">
                Probability-weighted Bull/Base/Bear scenarios. Downside penalized 2x (Loss Aversion).
                <br />
                Low P/E (≤10) rewarded. Missing P/E not penalized.
                <span className={cn("block mt-1 font-medium",
                    (fiftyTwoWeekScore || 0) > 0 ? "text-emerald-500" :
                        (fiftyTwoWeekScore || 0) < 0 ? "text-red-500" : "text-muted-foreground"
                )}>
                    52w High/Low Impact: {(fiftyTwoWeekScore || 0) > 0 ? '+' : ''}{fiftyTwoWeekScore || 0} pts (Dip buying rewarded, ATH chasing penalized).
                </span>
            </p>
        </div>
    );

    return (
        <TooltipProvider delayDuration={0}>
            {/* Mobile: Popover - No click propagation */}
            <div className="md:hidden">
                <Popover>
                    <PopoverTrigger asChild>
                        {/* We remove onClick={e.stopPropagation()} as it's not needed in standalone page */}
                        <div className="inline-block">
                            {BadgeContent}
                        </div>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="center" collisionPadding={10} className="w-[300px]">
                        {TooltipBody}
                    </PopoverContent>
                </Popover>
            </div>

            {/* Desktop: Tooltip - Pure Hover */}
            <div className="hidden md:block">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="inline-block cursor-help">
                            {BadgeContent}
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="p-4 min-w-[320px]">
                        {TooltipBody}
                    </TooltipContent>
                </Tooltip>
            </div>
        </TooltipProvider>
    );
};

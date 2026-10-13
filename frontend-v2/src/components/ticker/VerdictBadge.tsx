import React, { useMemo } from 'react';
import { Bot, Brain } from 'lucide-react';
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
import { RISK_TEXT, SCORE_TEXT, riskBand, scoreBand } from '../../lib/ticker-metrics';
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
    newsSentiment?: string | null;
    newsImpact?: number | null;
    currentPrice?: number;
    fiftyTwoWeekHigh?: number | null;
    fiftyTwoWeekLow?: number | null;
    /** Trailing revenue; without it the rating assumes the company has none. */
    revenueTTM?: number | null;
    /**
     * Pass `false` when the ticker has no AI analysis. The badge then says
     * "Not rated" instead of deriving a rating from empty inputs.
     */
    analysed?: boolean;
    /**
     * For narrow places (a card in a four-column grid): the longest rating is
     * shortened to "Spec Buy" so the badge never squeezes the symbol next to
     * it. The tooltip keeps the full name.
     */
    compact?: boolean;
}

const TRIGGER =
    "relative rounded-[4px] transition-transform before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const NOT_RATED_NOTE = 'No AI analysis has been run for this ticker yet, so there is no rating, upside or downside to show.';

export const VerdictBadge: React.FC<VerdictBadgeProps> = ({
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
    fiftyTwoWeekLow,
    revenueTTM,
    analysed = true,
    compact = false
}) => {
    const getConsensusColor = (c?: string) => {
        if (!c) return "text-muted-foreground";
        const low = c.toLowerCase();
        if (low.includes('buy') || low.includes('outperform')) return "text-up";
        if (low.includes('sell') || low.includes('underperform')) return "text-down";
        return "text-amber-600 dark:text-yellow-500";
    };

    // The same bands the tables, cards and risk bars use.
    const getRiskColor = (r: number) => RISK_TEXT[riskBand(r)];
    const getScoreColor = (s?: number | null) => (s ? SCORE_TEXT[scoreBand(s)] : 'text-muted-foreground');

    const { rating, variant, score, fiftyTwoWeekScore } = useMemo(
        () => calculateAiRating({
            risk,
            upside,
            overallScore,
            downside,
            consensus,
            peRatio: pe, // Legacy name mapping if object was used
            newsSentiment,
            newsImpact,
            currentPrice,
            fiftyTwoWeekHigh,
            fiftyTwoWeekLow,
            revenueTTM,
        }),
        [risk, upside, overallScore, downside, consensus, pe, newsSentiment, newsImpact, currentPrice, fiftyTwoWeekHigh, fiftyTwoWeekLow, revenueTTM]
    );

    // We map our internal rating variant to the Badge's expected variant types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const badgeVariant = (variant === 'default' ? 'outline' : variant) as any;

    const BadgeContent = (
        <Badge variant={badgeVariant} className={cn("gap-1.5 h-6 px-2 whitespace-nowrap cursor-help", className)}>
            {variant === 'legendary' ? <Brain size={12} className="text-white" /> : <Bot size={12} className="opacity-80" />}
            {compact && rating === 'Speculative Buy' ? <abbr title={rating} className="no-underline">Spec Buy</abbr> : rating}
        </Badge>
    );

    const TooltipBody = (
        <div className="space-y-3">
            <div>
                <p className="font-bold text-sm flex items-center gap-2">
                    {rating} <span className="num font-normal text-muted-foreground ml-auto text-xs" title="Weighted verdict score: 45 Hold · 65 Buy · 80 Strong Buy">Verdict score {score?.toFixed(0) ?? '—'}</span>
                </p>
                <div className="h-1.5 w-full bg-secondary mt-1.5 rounded-full overflow-hidden">
                    <div
                        className={cn("h-full rounded-full transition-all",
                            (variant === 'strongBuy' || variant === 'legendary') ? "bg-emerald-500" :
                                variant === 'buy' ? "bg-emerald-400" :
                                    variant === 'sell' ? "bg-red-500" : "bg-yellow-500"
                        )}
                        style={{ width: `${Math.max(0, Math.min(100, score ?? 50))}%` }}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                    <span>Upside:</span>
                    <span className={cn("font-medium", upside < 0 ? "text-red-500" : "text-emerald-500")}>{upside > 0 ? '+' : upside < 0 ? '−' : ''}{Math.abs(upside).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                    <span>Downside:</span>
                    <span className="text-red-500 font-medium">{downside ? `${downside > 0 ? '+' : '−'}${Math.abs(downside).toFixed(0)}%` : '—'}</span>
                </div>
                <div className="flex justify-between">
                    <span>Risk:</span>
                    <span className={cn("font-medium", getRiskColor(risk))}>{risk.toFixed(1)}/10</span>
                </div>
                <div className="flex justify-between">
                    <span>Risk/reward:</span>
                    <span className={cn("font-medium", getScoreColor(overallScore))}>
                        {overallScore ? `${overallScore.toFixed(1)}/10` : '—'}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span>Analyst:</span>
                    <span className={cn("font-medium text-right", getConsensusColor(consensus))}>{consensus ?? '-'}</span>
                </div>
                <div className="flex justify-between items-center align-middle">
                    <span>P/E:</span>
                    <span className={cn("font-medium",
                        !pe || pe < 0 || pe > 40 ? "text-red-500" :
                            pe < 25 ? "text-emerald-500" : "text-yellow-500"
                    )}>
                        {pe === undefined || pe === null ? '—' : pe < 0 ? 'Loss' : pe.toFixed(2)}
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

            <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
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

    if (!analysed) {
        const notRated = (
            <Badge variant="outline" className={cn("h-6 cursor-help gap-1.5 whitespace-nowrap px-2 text-muted-foreground", className)}>
                <Bot size={12} className="opacity-80" aria-hidden />
                Not rated
            </Badge>
        );
        return (
            <TooltipProvider delayDuration={0}>
                <div className="md:hidden">
                    <Popover>
                        <PopoverTrigger asChild>
                            <button type="button" className={cn(TRIGGER, "active:scale-95")} onClick={(e) => e.stopPropagation()}>
                                {notRated}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent side="bottom" align="center" collisionPadding={12} className="w-[min(300px,calc(100vw-1.5rem))] text-sm">
                            {NOT_RATED_NOTE}
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="hidden md:block">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button type="button" className={TRIGGER} onClick={(e) => e.stopPropagation()}>
                                {notRated}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="start" className="max-w-[280px] p-3 text-sm">
                            {NOT_RATED_NOTE}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </TooltipProvider>
        );
    }

    return (
        <TooltipProvider delayDuration={0}>
            {/* Mobile: Popover */}
            <div className="md:hidden">
                <Popover>
                    <PopoverTrigger asChild>
                        <button type="button" className={cn(TRIGGER, "active:scale-95")} onClick={(e) => e.stopPropagation()}>
                            {BadgeContent}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="center" collisionPadding={12} className="w-[min(300px,calc(100vw-1.5rem))]">
                        {TooltipBody}
                    </PopoverContent>
                </Popover>
            </div>

            {/* Desktop: Tooltip */}
            <div className="hidden md:block">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button type="button" className={cn(TRIGGER, "hover:scale-105")} onClick={(e) => e.stopPropagation()}>
                            {BadgeContent}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="w-[320px] max-w-[calc(100vw-1.5rem)] p-4">
                        {TooltipBody}
                    </TooltipContent>
                </Tooltip>
            </div>
        </TooltipProvider>
    );
};

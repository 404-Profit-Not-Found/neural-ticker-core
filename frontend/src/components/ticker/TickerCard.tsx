import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, Bot, Brain, Newspaper, ShieldCheck, AlertTriangle, Flame, MessageCircle } from 'lucide-react';
import { Sparkline } from '../ui/Sparkline';
import { cn } from '../../lib/api';
import { TickerLogo } from '../dashboard/TickerLogo';
import { VerdictBadge } from './VerdictBadge';

export interface TickerCardProps {
    symbol: string;
    name: string;
    logoUrl?: string;
    industry?: string;
    sector?: string;
    price: number;
    change: number;
    risk: number;
    overallScore?: number | null;
    upside: number;
    downside: number;
    pe?: number | null;
    consensus?: string | null;
    researchCount?: number;
    newsCount?: number;
    socialCount?: number;
    newsSentiment?: string;
    newsImpact?: number;
    sparkline?: number[];
    fiftyTwoWeekLow?: number;
    fiftyTwoWeekHigh?: number;
    className?: string;
    children?: React.ReactNode;
}

import { FiftyTwoWeekRange } from '../dashboard/FiftyTwoWeekRange';
import { useTickerMarketStatus, getSessionLabel, getSessionColor } from '../../hooks/useMarketStatus';

export function TickerCard({
    symbol,
    name,
    logoUrl,
    industry,
    sector,
    price,
    change,
    risk,
    overallScore,
    upside,
    downside,
    pe,
    consensus,
    researchCount = 0,
    newsCount = 0,
    socialCount = 0,
    newsSentiment,
    newsImpact,
    sparkline,
    fiftyTwoWeekLow,
    fiftyTwoWeekHigh,
    className,
    children
}: TickerCardProps) {
    const navigate = useNavigate();
    // Use per-ticker market status based on symbol's exchange
    const { data: marketStatus } = useTickerMarketStatus(symbol);

    // Market session display
    const sessionLabel = marketStatus?.session ? getSessionLabel(marketStatus.session) : 'Closed';
    const sessionColor = marketStatus?.session ? getSessionColor(marketStatus.session) : 'text-muted-foreground';

    // --- Risk Logic ---
    let riskColorClass = "text-muted-foreground";
    let RiskIcon = ShieldCheck;
    if (risk <= 3.5) {
        riskColorClass = "text-emerald-500 font-bold";
        RiskIcon = ShieldCheck;
    } else if (risk <= 6.5) {
        riskColorClass = "text-yellow-500 font-bold";
        RiskIcon = AlertTriangle;
    } else {
        riskColorClass = "text-red-500 font-bold";
        RiskIcon = Flame;
    }

    return (
        <div
            onClick={() => navigate(`/ticker/${symbol}`)}
            className={cn(
                "group flex flex-col p-4 rounded-lg border border-border sm:border-border/50 bg-transparent hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow-md h-full relative w-full min-w-[320px] sm:min-w-0",
                className
            )}
        >
            {/* Header: Logo, Symbol, Badges */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 w-full">
                    <TickerLogo url={logoUrl} symbol={symbol} className="w-12 h-12 shrink-0" />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                            <div className="font-bold text-xl leading-none">{symbol}</div>
                            {/* AI Badge (Aligned Right) */}
                            <VerdictBadge
                                risk={risk}
                                upside={upside}
                                downside={downside}
                                overallScore={overallScore}
                                consensus={consensus || undefined}
                                pe={pe as number}
                                newsSentiment={newsSentiment}
                                newsImpact={newsImpact}
                                className="ml-auto"
                            />
                        </div>
                        <div className="flex flex-col gap-0.5 mt-1">
                            <div className="text-sm text-muted-foreground line-clamp-1">{name}</div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                <div className="text-xs text-muted-foreground/70 truncate">
                                    {industry || sector || 'Unknown'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Price section & Sparkline */}
            <div className="mt-auto space-y-2">
                <div className="flex items-end justify-between border-b border-border/50 pb-2">
                    {/* Left: Price and Change */}
                    <div className="flex flex-col">
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-mono font-bold">
                                ${price.toFixed(2)}
                            </span>
                            <div className={cn("flex items-center gap-0.5 text-xs font-mono font-bold", change >= 0 ? "text-emerald-500" : "text-red-500")}>
                                {change >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                                {Math.abs(change).toFixed(2)}%
                            </div>
                        </div>
                        <span className={cn("text-[10px] uppercase tracking-widest opacity-70 font-bold mt-1", sessionColor)}>
                            {sessionLabel}
                        </span>
                    </div>

                    {/* Right: Sparkline (Fixed Width) */}

                    <div className="flex items-end gap-2 h-12 -my-2 py-1">
                        <span className="text-[9px] text-muted-foreground/40 font-mono font-medium mb-0.5">14d</span>
                        <div className="flex items-center h-full pl-3 border-l border-border/50 bg-muted/5 rounded-r-sm">
                            <div className="w-[100px] h-10 flex items-center justify-center relative">
                                {sparkline && sparkline.length > 0 ? (
                                    <Sparkline
                                        data={sparkline}
                                        width={100}
                                        height={40}
                                        className="opacity-80 group-hover:opacity-100 transition-opacity"
                                    />
                                ) : (
                                    <div className="text-[10px] text-muted-foreground/30 font-medium italic text-right w-full">No trend</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 52-Week Range Bar */}
                {fiftyTwoWeekLow && fiftyTwoWeekHigh && (
                    <div className="pt-2 pb-1">
                        <FiftyTwoWeekRange
                            low={fiftyTwoWeekLow}
                            high={fiftyTwoWeekHigh}
                            current={price}
                            showLabels={true}
                            className="w-full"
                        />
                    </div>
                )}

                {/* Stats Grid */}
                <div className="flex items-center gap-2 mt-3 mb-1 w-full">
                    <div className="flex-1 flex items-center justify-center gap-1.5 text-[10px] bg-muted/50 px-2 py-1 rounded font-medium border border-border/50">
                        <RiskIcon size={12} className={riskColorClass.replace('text-', 'text-').split(' ')[0]} />
                        <span className="text-muted-foreground whitespace-nowrap">Risk:</span>
                        <span className={riskColorClass}>
                            {Math.round(risk)}
                        </span>
                    </div>

                    <div className="flex-1 flex items-center justify-center gap-1.5 text-[10px] bg-muted/50 px-2 py-1 rounded font-medium border border-border/50">
                        <Bot size={12} className={overallScore && overallScore >= 7.5 ? "text-emerald-500" : overallScore && overallScore >= 5.0 ? "text-yellow-500" : "text-red-500"} />
                        <span className="text-muted-foreground whitespace-nowrap">R/R:</span>
                        <span className={cn("font-bold", overallScore && overallScore >= 7.5 ? "text-emerald-500" : overallScore && overallScore >= 5.0 ? "text-yellow-500" : "text-red-500")}>
                            {Number(overallScore || 0).toFixed(1)}
                        </span>
                    </div>

                    <div className="flex-1 flex items-center justify-center gap-1.5 text-[10px] bg-muted/50 px-2 py-1 rounded font-medium border border-border/50">
                        <ArrowUp size={12} className={upside > 0 ? "text-emerald-500" : "text-muted-foreground"} />
                        <span className="text-muted-foreground whitespace-nowrap">Upside:</span>
                        <span className={upside > 0 ? "text-emerald-500 font-bold" : "text-muted-foreground font-bold"}>
                            {upside > 0 ? '+' : ''}{upside.toFixed(1)}%
                        </span>
                    </div>
                </div>

                {/* Footer Counts */}
                <div className="flex items-center gap-3 pt-2 border-t border-border/50 text-xs">
                    {researchCount > 0 && (
                        <span className="flex items-center gap-1 text-purple-400 font-medium bg-purple-400/10 px-1.5 py-0.5 rounded">
                            <Brain size={12} /> {researchCount}
                        </span>
                    )}
                    {newsCount > 0 && (
                        <span className="flex items-center gap-1 text-sky-400 font-medium bg-sky-400/10 px-1.5 py-0.5 rounded">
                            <Newspaper size={12} /> {newsCount}
                        </span>
                    )}
                    {socialCount > 0 && (
                        <span className="flex items-center gap-1 text-blue-400 font-medium bg-blue-400/10 px-1.5 py-0.5 rounded">
                            <MessageCircle size={12} /> {socialCount}
                        </span>
                    )}

                    <span className="ml-auto flex items-center gap-1.5 text-[10px] bg-muted/50 px-2 py-0.5 rounded font-medium border border-border/50">
                        <ArrowDown size={10} className={risk > 6.5 ? "text-red-500" : "text-amber-500"} />
                        <span className="text-muted-foreground">Downside:</span>
                        <span className={risk > 6.5 ? "text-red-500 font-bold" : "text-amber-500 font-bold"}>
                            {downside.toFixed(1)}%
                        </span>
                    </span>
                </div>
            </div>
            {children}
        </div>
    );
}

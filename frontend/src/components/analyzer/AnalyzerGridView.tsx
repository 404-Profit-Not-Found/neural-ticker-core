// Match WatchlistGridView imports
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, Bot, Brain, Newspaper, ShieldCheck, AlertTriangle, Flame, MessageCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/api';
import { TickerLogo } from '../dashboard/TickerLogo';
import type { StockSnapshot } from '../../hooks/useStockAnalyzer';
import { calculateAiRating } from '../../lib/rating-utils';

interface AnalyzerGridViewProps {
    data: StockSnapshot[];
    isLoading: boolean;
}

export function AnalyzerGridView({ data, isLoading }: AnalyzerGridViewProps) {
    const navigate = useNavigate();

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-48 rounded-lg border border-border bg-card animate-pulse" />
                ))}
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground bg-card/50 rounded-lg border border-border">
                No stocks found.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.map((item) => {
                const { ticker, latestPrice, aiAnalysis, fundamentals, counts } = item;
                const price = latestPrice?.close ?? 0;
                const change = latestPrice?.change ?? 0;
                const risk = aiAnalysis?.financial_risk ?? 0;

                const basePrice = aiAnalysis?.base_price;
                const bearPrice = aiAnalysis?.bear_price;

                let upside = 0;
                if (typeof basePrice === 'number' && price > 0) {
                    upside = ((basePrice - price) / price) * 100;
                } else {
                    upside = Number(aiAnalysis?.upside_percent ?? 0);
                }

                let downside = 0;
                if (typeof bearPrice === 'number' && price > 0) {
                    downside = ((bearPrice - price) / price) * 100;
                } else if (risk >= 8) {
                    downside = -100;
                } else {
                    downside = -(risk * 2.5);
                }

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

                const { rating, variant } = calculateAiRating(risk, upside);
                
                // --- Analyst Consensus Logic ---
                const consensus = fundamentals?.consensus_rating;

                return (
                    <div
                        key={ticker.symbol}
                        onClick={() => navigate(`/ticker/${ticker.symbol}`)}
                        className="group flex flex-col p-4 rounded-lg border border-border bg-transparent hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow-md h-full relative"
                    >
                        {/* Header: Logo, Symbol, Badges */}
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3 w-full">
                                <TickerLogo url={ticker.logo_url} symbol={ticker.symbol} className="w-12 h-12 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="font-bold text-xl leading-none">{ticker.symbol}</div>
                                        {/* AI Badge (Aligned Right) */}
                                        <Badge variant={variant} className="text-xs h-6 px-2 whitespace-nowrap gap-1 ml-auto">
                                            <Bot size={12} className="opacity-80" />
                                            {rating}
                                        </Badge>
                                    </div>
                                    <div className="flex flex-col gap-0.5 mt-1">
                                        <div className="text-sm text-muted-foreground line-clamp-1">{ticker.name}</div>
                                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                            <div className="text-xs text-muted-foreground/70 truncate">
                                                {ticker.industry || ticker.sector || fundamentals?.sector || 'Unknown'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Price Section */}
                        <div className="mt-auto space-y-3">
                            <div className="flex items-end justify-between border-b border-border pb-3">
                                <div className="flex flex-col items-start gap-1">
                                    <span className="text-lg font-mono font-medium">
                                        ${price.toFixed(2)}
                                    </span>
                                    {/* Analyst Consensus (Under Price) */}
                                    {consensus && consensus !== '-' && (() => {
                                        const rStr = String(consensus);
                                        const rLower = rStr.toLowerCase();
                                        let displayRating = 'Hold';
                                        let analystVariant: "default" | "strongBuy" | "buy" | "hold" | "sell" | "outline" = "hold";

                                        if (rLower.includes('strong buy')) {
                                           displayRating = 'Strong Buy';
                                           analystVariant = 'strongBuy';
                                        } else if (rLower.includes('buy')) {
                                           displayRating = 'Buy';
                                           analystVariant = 'buy';
                                        } else if (rLower.includes('sell')) {
                                           displayRating = 'Sell';
                                           analystVariant = 'sell';
                                        } else {
                                           displayRating = 'Hold';
                                           analystVariant = 'hold';
                                        }

                                        return (
                                            <Badge variant={analystVariant} className="h-4 px-1.5 whitespace-nowrap gap-1">
                                                <span className="opacity-70 font-normal mr-0.5">Consensus:</span>
                                                {displayRating} {counts?.analysts ? `(${counts.analysts})` : ''}
                                            </Badge>
                                        );
                                    })()}
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Today</span>
                                    <div className={cn("flex items-center gap-0.5 text-lg font-mono font-bold", change >= 0 ? "text-emerald-500" : "text-red-500")}>
                                        {change >= 0 ? <ArrowUp size={20} /> : <ArrowDown size={20} />}
                                        {Math.abs(change).toFixed(2)}%
                                    </div>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="flex flex-wrap items-center gap-2 mt-3 mb-1">
                                <div className="flex items-center gap-1.5 text-[10px] bg-muted/50 px-2 py-1 rounded font-medium border border-border/50">
                                    <RiskIcon size={12} className={riskColorClass.replace('text-', 'text-').split(' ')[0]} />
                                    <span className="text-muted-foreground">Risk:</span>
                                    <span className={riskColorClass}>
                                        {Math.round(risk)}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1.5 text-[10px] bg-muted/50 px-2 py-1 rounded font-medium border border-border/50">
                                    <Bot size={12} className={aiAnalysis?.overall_score && aiAnalysis.overall_score >= 7.5 ? "text-emerald-500" : aiAnalysis?.overall_score && aiAnalysis.overall_score >= 5.0 ? "text-yellow-500" : "text-red-500"} />
                                    <span className="text-muted-foreground">R/R:</span>
                                    <span className={cn("font-bold", aiAnalysis?.overall_score && aiAnalysis.overall_score >= 7.5 ? "text-emerald-500" : aiAnalysis?.overall_score && aiAnalysis.overall_score >= 5.0 ? "text-yellow-500" : "text-red-500")}>
                                        {Number(aiAnalysis?.overall_score || 0).toFixed(1)}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1.5 text-[10px] bg-muted/50 px-2 py-1 rounded font-medium border border-border/50">
                                    <ArrowUp size={12} className={upside > 0 ? "text-emerald-500" : "text-muted-foreground"} />
                                    <span className="text-muted-foreground">Upside:</span>
                                    <span className={upside > 0 ? "text-emerald-500 font-bold" : "text-muted-foreground font-bold"}>
                                        {upside > 0 ? '+' : ''}{upside.toFixed(1)}%
                                    </span>
                                </div>
                            </div>

                            {/* Footer Counts */}
                            <div className="flex items-center gap-3 pt-2 border-t border-border/50 text-xs">
                                {counts?.research ? counts.research > 0 && (
                                    <span className="flex items-center gap-1 text-purple-400 font-medium bg-purple-400/10 px-1.5 py-0.5 rounded">
                                        <Brain size={12} /> {counts.research}
                                    </span>
                                ) : null}
                                {counts?.news ? counts.news > 0 && (
                                    <span className="flex items-center gap-1 text-sky-400 font-medium bg-sky-400/10 px-1.5 py-0.5 rounded">
                                        <Newspaper size={12} /> {counts.news}
                                    </span>
                                ) : null}
                                {counts?.social ? counts.social > 0 && (
                                    <span className="flex items-center gap-1 text-blue-400 font-medium bg-blue-400/10 px-1.5 py-0.5 rounded">
                                        <MessageCircle size={12} /> {counts.social}
                                    </span>
                                ) : null}

                                <span className="ml-auto flex items-center gap-1.5 text-[10px] bg-muted/50 px-2 py-0.5 rounded font-medium border border-border/50">
                                    <ArrowDown size={10} className={risk > 6.5 ? "text-red-500" : "text-amber-500"} />
                                    <span className="text-muted-foreground">Downside:</span>
                                    <span className={risk > 6.5 ? "text-red-500 font-bold" : "text-amber-500 font-bold"}>
                                        {downside.toFixed(1)}%
                                    </span>
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

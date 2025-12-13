import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, Bot, ShieldCheck, AlertTriangle, Flame } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/api';
import type { StockSnapshot } from '../../hooks/useStockAnalyzer';

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
            <div className="text-center py-12 text-muted-foreground bg-card rounded-lg border border-border">
                No stocks found.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.map((item) => {
                const { ticker, latestPrice, aiAnalysis } = item;
                const price = latestPrice?.close ?? 0;
                const change = latestPrice?.change ?? 0;
                const rawRisk = aiAnalysis?.overall_score;
                const risk = typeof rawRisk === 'number' ? rawRisk : Number(rawRisk || 0);
                const rawUpside = aiAnalysis?.upside_percent;
                const upside = typeof rawUpside === 'number' ? rawUpside : Number(rawUpside || 0);
                
                // --- Risk Logic (Match WatchlistTable) ---
                // Color scale: 0-3.5 Green, 3.5-6.5 Yellow, >6.5 Red
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

                // --- AI Rating Logic (Match WatchlistTable) ---
                let rating = 'Hold';
                let variant: "default" | "strongBuy" | "buy" | "hold" | "sell" | "outline" = "outline";
                
                // Matches WatchlistTable computed logic
                if (upside > 10 && risk <= 7) {
                    rating = 'Buy';
                    variant = 'buy';
                }
                if (upside > 20 && risk <= 6) {
                    rating = 'Strong Buy';
                    variant = 'strongBuy';
                }
                if (upside < 0 || risk >= 8) {
                    rating = 'Sell';
                    variant = 'sell';
                }
                if (rating === 'Hold') variant = 'hold';

                return (
                    <div
                        key={ticker.symbol}
                        onClick={() => navigate(`/ticker/${ticker.symbol}`)}
                        className="group flex flex-col p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow-md h-full"
                    >
                        {/* Header: Logo, Symbol, Badge */}
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                {ticker.logo_url ? (
                                    <img
                                        src={ticker.logo_url}
                                        alt={ticker.symbol}
                                        className="w-10 h-10 rounded-full bg-muted object-contain p-1"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-bold">
                                        {ticker.symbol.substring(0, 2)}
                                    </div>
                                )}
                                <div>
                                     <div className="flex items-center gap-2">
                                        <div className="font-bold text-lg leading-none">{ticker.symbol}</div>
                                         <Badge variant={variant} className="text-[10px] h-5 px-1.5 whitespace-nowrap">
                                            {rating}
                                        </Badge>
                                    </div>
                                    <div className="text-xs text-muted-foreground line-clamp-1 mt-1">{ticker.name}</div>
                                </div>
                            </div>
                        </div>

                        {/* Price Section */}
                        <div className="mt-auto space-y-3">
                            <div className="flex items-baseline justify-between border-b border-border pb-3">
                                <span className="text-2xl font-mono font-medium">
                                    ${price.toFixed(2)}
                                </span>
                                <div className={`flex items-center gap-0.5 text-sm font-mono font-bold ${change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {change >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                                    {Math.abs(change).toFixed(2)}%
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Score</span>
                                    <div className={cn("flex items-center gap-1.5", riskColorClass)}>
                                        <RiskIcon size={14} />
                                        {risk.toFixed(1)}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 text-right">
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Exp. Upside</span>
                                    <div className={`font-bold ${upside > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                        {upside > 0 ? '+' : ''}{upside.toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                            
                            {/* Footer Badges */}
                             <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                                    <Bot size={10} className="opacity-70" /> AI Analysis
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

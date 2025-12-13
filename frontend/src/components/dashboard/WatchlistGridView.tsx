import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, Bot, Brain, Newspaper, ShieldCheck, AlertTriangle, Flame, Trash2, MessageCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/api';
import { TickerLogo } from './TickerLogo';
import type { TickerData } from './WatchlistTableView';

interface WatchlistGridViewProps {
    data: TickerData[];
    isLoading: boolean;
    onRemove?: (itemId: string, symbol: string) => void;
}

export function WatchlistGridView({ data, isLoading, onRemove }: WatchlistGridViewProps) {
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
                Watchlist is empty.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.map((item) => {
                const { symbol, logo, company, price, change, riskScore, potentialUpside, aiRating, itemId } = item;
                const risk = riskScore || 0;
                const upside = potentialUpside || 0;

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

                // --- AI Rating Variant ---
                let variant: "default" | "strongBuy" | "buy" | "hold" | "sell" | "outline" = "outline";
                if (aiRating === 'Strong Buy') variant = 'strongBuy';
                else if (aiRating === 'Buy') variant = 'buy';
                else if (aiRating === 'Hold') variant = 'hold';
                else if (aiRating === 'Sell') variant = 'sell';

                return (
                    <div
                        key={symbol}
                        className="watchlist-tile group flex flex-col p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-all shadow-sm hover:shadow-md h-full relative"
                    >
                        {/* Remove Action (Absolute Top Right) - Only if onRemove is provided */}
                        {onRemove && (
                            <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive bg-card/80 backdrop-blur-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemove(itemId || '', symbol);
                                    }}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        )}

                        {/* Top Section Clickable */}
                        <div className="cursor-pointer flex-1" onClick={() => navigate(`/ticker/${symbol}`)}>
                            {/* Header: Logo, Symbol, Badges */}
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3 w-full">
                                    <TickerLogo url={logo} symbol={symbol} className="w-10 h-10 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="font-bold text-lg leading-none">{symbol}</div>
                                            {/* AI Badge (Aligned Right) */}
                                            {aiRating && aiRating !== '-' && (
                                                <Badge variant={variant} className="text-[10px] h-5 px-1.5 whitespace-nowrap gap-1 ml-auto">
                                                    <Bot size={10} className="opacity-80" />
                                                    {aiRating}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-0.5 mt-1">
                                            <div className="text-xs text-muted-foreground line-clamp-1">{company}</div>
                                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                                <div className="text-[10px] text-muted-foreground/70 truncate">{item.sector}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Price Section */}
                            <div className="mt-auto space-y-3">
                                <div className="flex items-end justify-between border-b border-border pb-3">
                                    <div className="flex flex-col items-start gap-1">
                                        <span className="text-2xl font-mono font-medium">
                                            ${typeof price === 'number' ? price.toFixed(2) : '0.00'}
                                        </span>
                                        {/* Analyst Badge (Under Price) */}
                                        {item.rating && item.rating !== '-' && (() => {
                                            let analystVariant: "default" | "strongBuy" | "buy" | "hold" | "sell" | "outline" = "outline";
                                            if (item.rating === 'Strong Buy') analystVariant = 'strongBuy';
                                            else if (item.rating === 'Buy') analystVariant = 'buy';
                                            else if (item.rating === 'Hold') analystVariant = 'hold';
                                            else if (item.rating === 'Sell') analystVariant = 'sell';

                                            return (
                                                <Badge variant={analystVariant} className="text-[10px] h-4 px-1.5 whitespace-nowrap gap-1">
                                                    <span className="opacity-70 font-normal mr-0.5">Consensus:</span>
                                                    {item.rating} {item.analystCount > 0 ? `(${item.analystCount})` : ''}
                                                </Badge>
                                            );
                                        })()}
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Today</span>
                                        <div className={cn("flex items-center gap-0.5 text-sm font-mono font-bold", change >= 0 ? "text-emerald-500" : "text-red-500")}>
                                            {change >= 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                                            {typeof change === 'number' ? Math.abs(change).toFixed(2) : '0.00'}%
                                        </div>
                                    </div>
                                </div>

                                {/* Stats Grid */}
                                <div className="flex items-center justify-between gap-2 mt-3 mb-1">
                                    <div className="flex items-center gap-1.5 text-[10px] bg-muted/50 px-2 py-1 rounded font-medium border border-border/50">
                                        <RiskIcon size={12} className={riskColorClass.replace('text-', 'text-').split(' ')[0]} />
                                        <span className="text-muted-foreground">Risk:</span>
                                        <span className={riskColorClass}>
                                            {typeof risk === 'number' ? risk.toFixed(1) : '0.0'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 text-[10px] bg-muted/50 px-2 py-1 rounded font-medium border border-border/50">
                                        <ArrowUp size={12} className={upside > 0 ? "text-emerald-500" : "text-muted-foreground"} />
                                        <span className="text-muted-foreground">Upside:</span>
                                        <span className={upside > 0 ? "text-emerald-500 font-bold" : "text-muted-foreground font-bold"}>
                                            {upside > 0 ? '+' : ''}
                                            {typeof upside === 'number' ? upside.toFixed(1) : '0.0'}%
                                        </span>
                                    </div>
                                </div>

                                {/* Footer Counts */}
                                <div className="flex items-center gap-3 pt-2 border-t border-border/50 text-xs">
                                    {item.researchCount > 0 && (
                                        <span className="flex items-center gap-1 text-purple-400 font-medium bg-purple-400/10 px-1.5 py-0.5 rounded">
                                            <Brain size={12} /> {item.researchCount}
                                        </span>
                                    )}
                                    {item.newsCount > 0 && (
                                        <span className="flex items-center gap-1 text-sky-400 font-medium bg-sky-400/10 px-1.5 py-0.5 rounded">
                                            <Newspaper size={12} /> {item.newsCount}
                                        </span>
                                    )}
                                    {item.socialCount > 0 && (
                                        <span className="flex items-center gap-1 text-blue-400 font-medium bg-blue-400/10 px-1.5 py-0.5 rounded">
                                            <MessageCircle size={12} /> {item.socialCount}
                                        </span>
                                    )}
                                    <span className="ml-auto flex items-center gap-1.5 text-[10px] bg-muted/50 px-2 py-0.5 rounded font-medium border border-border/50">
                                        <ArrowDown size={10} className={risk > 5 ? "text-red-500" : "text-amber-500"} />
                                        <span className="text-muted-foreground">Downside:</span>
                                        <span className={risk > 5 ? "text-red-500 font-bold" : "text-amber-500 font-bold"}>
                                            -{typeof risk === 'number' ? (risk * 2.5).toFixed(1) : '0.0'}%
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

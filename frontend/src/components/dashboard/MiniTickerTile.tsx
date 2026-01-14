import { Badge } from '../ui/badge';
import { cn } from '../../lib/api';

interface MiniTickerTileProps {
    symbol: string;
    company?: string;
    price: number;
    change: number;
    changeAmount?: number;
    riskScore: number;
    href: string;
}

export function MiniTickerTile({ symbol, company, price, change, changeAmount, riskScore, href }: MiniTickerTileProps) {
    return (
        <a
            href={href}
            className="flex flex-col p-3 rounded-lg bg-card hover:bg-card/90 border border-border/40 hover:border-primary/30 transition-all group shadow-sm"
        >
            <div className="flex justify-between items-start mb-2">
                <div>
                    <span className="font-bold text-sm block group-hover:text-primary transition-colors">{symbol}</span>
                    {company && <span className="text-[10px] text-muted-foreground line-clamp-1">{company}</span>}
                </div>
                <div className="flex flex-col items-end gap-0.5">
                    <Badge variant={change >= 0 ? "outline" : "destructive"} className={cn("text-[10px] px-1.5 h-5 font-mono", change >= 0 ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/5" : "text-red-500 border-red-500/20 bg-red-500/5")}>
                        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </Badge>
                    {changeAmount !== undefined && (
                        <span className={cn("text-[10px] font-mono", changeAmount >= 0 ? "text-emerald-500" : "text-red-500")}>
                            {changeAmount >= 0 ? '+' : ''}{changeAmount.toFixed(2)}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex justify-between items-end mt-auto">
                <span className="text-xs font-semibold font-mono">${price.toFixed(2)}</span>

                <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-sm",
                    riskScore <= 3 ? "text-emerald-500 bg-emerald-500/10" :
                        riskScore <= 6 ? "text-yellow-500 bg-yellow-500/10" : "text-red-500 bg-red-500/10"
                )}>
                    R{riskScore}
                </span>
            </div>
        </a>
    );
}

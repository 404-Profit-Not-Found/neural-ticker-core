import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, ArrowUp, Bot, Edit2 } from 'lucide-react';
import { Button } from '../ui/button';
import { TickerLogo } from '../dashboard/TickerLogo';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { calculateAiRating, calculateUpside } from '../../lib/rating-utils';
import { Skeleton } from '../ui/skeleton';

interface PortfolioItem {
  id: string;
  symbol: string;
  current_price: number;
  current_value: number;
  change_percent: number;
  gain_loss: number;
  gain_loss_percent: number;
  ticker?: {
    logo_url?: string;
    name?: string;
  };
  aiAnalysis?: {
    base_price?: number;
    upside_percent?: number;
    financial_risk?: number;
    overall_score?: number;
  };
  currency?: string;
}

interface PortfolioGridViewProps {
  data: PortfolioItem[];
  isLoading: boolean;
  onEdit: (position: PortfolioItem) => void;
}

export function PortfolioGridView({ data, isLoading, onEdit }: PortfolioGridViewProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-500">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[200px] border border-border/50 rounded-lg p-4 bg-card/50 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-8 w-full" />
            <div className="flex justify-between">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const formatCurrency = (val: number, curr?: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: curr || 'USD' }).format(val);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-500">
      {data.map((item) => {
        // const risk = item.aiAnalysis?.financial_risk ?? 0;
        const upside = item.aiAnalysis?.base_price
          ? ((Number(item.aiAnalysis.base_price) - item.current_price) / item.current_price) * 100
          : (Number(item.aiAnalysis?.upside_percent) || 0);

        const isProfit = item.gain_loss >= 0;

        // Removed unused RiskIcon/Color logic to fix build


        return (
          <div
            key={item.id}
            className="group relative flex flex-col justify-between rounded-xl border border-border/50 bg-card p-5 transition-all hover:shadow-lg hover:border-primary/50 cursor-pointer"
            onClick={() => navigate(`/ticker/${item.symbol}`)}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <TickerLogo
                  url={item.ticker?.logo_url}
                  symbol={item.symbol}
                  className="w-10 h-10 rounded-full border border-border/50"
                />
                <div>
                  <div className="font-bold text-lg leading-none">{item.symbol}</div>
                  <div className="text-xs text-muted-foreground mt-1 truncate max-w-[120px]">
                    {item.ticker?.name || 'Unknown'}
                  </div>
                </div>
              </div>
              {/* AI Rating Badge */}
              {(() => {
                const risk = Number(item.aiAnalysis?.financial_risk ?? 0);
                const currentPrice = Number(item.current_price ?? 0);
                const upsideVal = calculateUpside(currentPrice, item.aiAnalysis?.base_price, item.aiAnalysis?.upside_percent);
                const { rating, variant } = calculateAiRating(risk, upsideVal, item.aiAnalysis?.overall_score);

                return (
                  <div className="flex items-center gap-1">
                    <Badge variant={variant} className="text-[10px] h-5 gap-1 px-1.5 cursor-default">
                      <Bot size={10} />
                      {rating}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 -mr-1 text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(item);
                      }}
                    >
                      <Edit2 size={12} />
                    </Button>
                  </div>
                );
              })()}
            </div>

            {/* Price / Value Block */}
            <div className="flex items-end justify-between mb-4">
              <div>
                <div className="text-sm text-muted-foreground">Value</div>
                <div className="text-xl font-bold tracking-tight">
                  {formatCurrency(item.current_value, item.currency)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Today</div>
                <div className={cn("font-bold flex items-center justify-end text-sm", item.change_percent >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {item.change_percent >= 0 ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                  {Math.abs(item.change_percent).toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Stats Footer */}
            <div className="mt-auto grid grid-cols-2 gap-2 pt-4 border-t border-border/50">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold">Total Return</span>
                <div className={cn("text-xs font-bold flex items-center", isProfit ? "text-emerald-500" : "text-red-500")}>
                  {isProfit ? '+' : ''}{item.gain_loss_percent.toFixed(2)}%
                </div>
              </div>
              <div className="flex flex-col gap-1 items-end">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold">AI Upside</span>
                <div className="text-xs font-bold flex items-center text-emerald-500">
                  <ArrowUp size={12} className="mr-0.5" />
                  {upside.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div >
  );
}

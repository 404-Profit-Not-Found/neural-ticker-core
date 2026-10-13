import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, ArrowUp, ArrowDown, Bot, Edit2, Banknote, ShoppingCart } from 'lucide-react';
import { Button } from '../ui/button';
import { TickerLogo } from '../dashboard/TickerLogo';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { positionVerdict, type PositionVerdictInput } from './position-verdict';
import { Skeleton } from '../ui/skeleton';

interface PortfolioItem extends PositionVerdictInput {
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
    news_sentiment?: string | null;
    news_impact_score?: number | string | null;
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
  onSell?: (position: PortfolioItem) => void;
  onBuy?: (position: PortfolioItem) => void;
}

export function PortfolioGridView({ data, isLoading, onEdit, onSell, onBuy }: PortfolioGridViewProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-500">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[200px] space-y-4 rounded-lg bg-card p-4">
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
        // One derivation for the whole app (lib/ticker-metrics via position-verdict).
        const verdict = positionVerdict(item);
        const upside = verdict.upside ?? 0;

        const isProfit = item.gain_loss >= 0;

        // Removed unused RiskIcon/Color logic to fix build


        return (
          <div
            key={item.id}
            className="group relative flex cursor-pointer flex-col justify-between rounded-lg bg-card p-4 transition-colors hover:bg-muted/60 sm:p-5"
            onClick={() => navigate(`/ticker/${item.symbol}`)}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <TickerLogo
                  url={item.ticker?.logo_url}
                  symbol={item.symbol}
                  className="h-10 w-10 shrink-0 rounded-full"
                />
                <div className="min-w-0">
                  <div className="font-bold text-lg leading-none">{item.symbol}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {item.ticker?.name || 'Unknown'}
                  </div>
                </div>
              </div>
              {/* AI Rating Badge */}
              {(() => {
                const rating = verdict.variant ? verdict.rating : 'Not rated';
                const variant = verdict.variant ?? 'outline';

                return (
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant={variant} className="h-5 cursor-default gap-1 whitespace-nowrap px-1.5 text-[11px]">
                      <Bot size={10} />
                      {rating}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-mr-2 -mt-2 h-11 w-11 text-muted-foreground lg:h-8 lg:w-8"
                      aria-label={`Edit ${item.symbol} position`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(item);
                      }}
                      title="Edit Position"
                    >
                      <Edit2 size={14} />
                    </Button>
                  </div>
                );
              })()}
            </div>

            {/* Price / Value Block */}
            <div className="flex items-end justify-between mb-4">
              <div>
                <div className="text-sm text-muted-foreground">Value</div>
                <div className="num text-xl font-bold tracking-tight">
                  {formatCurrency(item.current_value, item.currency)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Today</div>
                <div className={cn("num flex items-center justify-end text-sm font-semibold", item.change_percent >= 0 ? "text-up" : "text-down")}>
                  {item.change_percent >= 0 ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                  {Math.abs(item.change_percent).toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Buy / Sell actions */}
            {(onBuy || onSell) && (
              <div className="flex items-center gap-2 mb-4">
                {onBuy && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 flex-1 gap-1.5 text-xs font-semibold lg:h-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBuy(item);
                    }}
                    title="Buy more shares at the market price"
                  >
                    <ShoppingCart size={13} />
                    Buy
                  </Button>
                )}
                {onSell && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 flex-1 gap-1.5 text-xs font-semibold lg:h-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSell(item);
                    }}
                    title="Sell shares from this position"
                  >
                    <Banknote size={13} />
                    Sell
                  </Button>
                )}
              </div>
            )}

            {/* Stats Footer */}
            <div className="mt-auto grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="label-micro">Total Return</span>
                <div className={cn("num flex items-center text-xs font-semibold", isProfit ? "text-up" : "text-down")}>
                  {isProfit ? '+' : ''}{item.gain_loss_percent.toFixed(2)}%
                </div>
              </div>
              <div className="flex flex-col gap-1 items-end">
                <span className="label-micro">AI Upside</span>
                <div className={cn("num flex items-center text-xs font-semibold", upside > 0 ? "text-up" : upside < 0 ? "text-down" : "text-muted-foreground")}>
                  {upside > 0 ? <ArrowUp size={12} className="mr-0.5" /> : upside < 0 ? <ArrowDown size={12} className="mr-0.5" /> : null}
                  {Math.abs(upside).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div >
  );
}

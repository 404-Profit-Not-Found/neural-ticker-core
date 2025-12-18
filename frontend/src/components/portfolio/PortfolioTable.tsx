import { Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Position {
  id: string;
  symbol: string;
  shares: string | number;
  buy_price: string | number;
  current_price: number;
  current_value: number;
  cost_basis: number;
  gain_loss: number;
  gain_loss_percent: number;
}

interface PortfolioTableProps {
  positions: Position[];
  onDelete: (id: string) => void;
  loading: boolean;
}

// Helper for currency format
const formatCurrency = (val: number) => 
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

const formatPct = (val: number) => 
  `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;

export function PortfolioTable({ positions, onDelete, loading }: PortfolioTableProps) {
  if (loading) {
    return (
        <div className="w-full mt-8 space-y-4">
            {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 w-full bg-card/30 animate-pulse rounded-md border border-border/50" />
            ))}
        </div>
    );
  }

  if (positions.length === 0) {
    return (
        <div className="mt-8 p-12 text-center border border-dashed border-border rounded-xl bg-muted/20">
            <h3 className="text-xl font-medium text-foreground">Your portfolio is empty</h3>
            <p className="text-muted-foreground mt-2">Add your first position to start tracking performance and get AI insights.</p>
        </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm mt-6">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase bg-muted/50 text-muted-foreground border-b border-border">
          <tr>
            <th className="px-6 py-4 font-medium tracking-wider">Ticker</th>
            <th className="px-6 py-4 font-medium tracking-wider text-right">Shares</th>
            <th className="px-6 py-4 font-medium tracking-wider text-right">Avg Cost</th>
            <th className="px-6 py-4 font-medium tracking-wider text-right">Last Price</th>
            <th className="px-6 py-4 font-medium tracking-wider text-right">Market Value</th>
            <th className="px-6 py-4 font-medium tracking-wider text-right">Total Return</th>
            <th className="px-6 py-4 font-medium tracking-wider text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {positions.map((pos) => {
             const isProfit = pos.gain_loss >= 0;
             const RowIcon = isProfit ? TrendingUp : TrendingDown;

             return (
              <tr key={pos.id} className="group hover:bg-muted/30 transition-colors">
                <td className="px-6 py-4 font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">
                            {pos.symbol[0]}
                        </span>
                        {pos.symbol}
                    </div>
                </td>
                <td className="px-6 py-4 text-right text-muted-foreground">{Number(pos.shares).toFixed(2)}</td>
                <td className="px-6 py-4 text-right text-muted-foreground">{formatCurrency(Number(pos.buy_price))}</td>
                <td className="px-6 py-4 text-right font-mono text-foreground">{formatCurrency(pos.current_price)}</td>
                <td className="px-6 py-4 text-right font-medium text-foreground">{formatCurrency(pos.current_value)}</td>
                <td className="px-6 py-4 text-right">
                    <div className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                        isProfit 
                            ? "bg-green-500/10 text-green-400 border-green-500/20" 
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                    )}>
                        <RowIcon size={12} />
                        <span>{formatCurrency(pos.gain_loss)}</span>
                        <span className="opacity-70">({formatPct(pos.gain_loss_percent)})</span>
                    </div>
                </td>
                <td className="px-6 py-4 text-center">
                    <button 
                        onClick={() => onDelete(pos.id)}
                        className="p-2 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Delete Position"
                    >
                        <Trash2 size={16} />
                    </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

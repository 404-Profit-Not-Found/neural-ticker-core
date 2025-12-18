import { useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, ShieldCheck, PieChart, Bot, Plus, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

interface PortfolioStatsProps {
  totalValue: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  positionCount: number;
  avgRisk: number | null;
  onAddPosition: () => void;
  onAnalyze: () => void;
}

function StatPill({
  icon: Icon,
  label,
  value,
  subValue,
  tone = 'muted',
}: {
  icon: any;
  label: string;
  value: string;
  subValue?: React.ReactNode;
  tone?: 'primary' | 'muted' | 'accent' | 'emerald' | 'rose';
}) {
  const gradients: Record<string, string> = {
    primary: 'linear-gradient(90deg, #22d3ee, #2563eb)',
    muted: 'linear-gradient(90deg, #a855f7, #6366f1)',
    accent: 'linear-gradient(90deg, #6366f1, #a855f7)',
    emerald: 'linear-gradient(90deg, #22c55e, #14b8a6)',
    rose: 'linear-gradient(90deg, #f472b6, #e11d48)',
  };

  const iconColors: Record<string, string> = {
    primary: 'text-blue-600 dark:text-blue-400',
    muted: 'text-purple-600 dark:text-purple-300',
    accent: 'text-indigo-600 dark:text-indigo-300',
    emerald: 'text-emerald-600 dark:text-emerald-300',
    rose: 'text-rose-600 dark:text-rose-300',
  };

  return (
    <div
      className={cn(
        'style-kpi relative overflow-hidden rounded-md border px-3 py-2 sm:px-4 sm:py-3',
      )}
      style={{
        background:
          'linear-gradient(rgb(var(--card)), rgb(var(--card))) padding-box, ' +
          `${gradients[tone] || gradients.primary} border-box`,
      }}
    >
      <div
        className="style-kpi-grid absolute inset-0 opacity-25 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
        aria-hidden
      />
      <div className="relative z-10 flex items-start justify-between gap-2 sm:gap-3">
        <div className="space-y-0.5 sm:space-y-1">
          <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <div className="flex items-baseline gap-2">
             <p className="text-lg sm:text-2xl font-bold text-foreground leading-tight">
                {value}
             </p>
             {subValue && (
                <span className="text-xs font-medium">
                    {subValue}
                </span>
             )}
          </div>
        </div>
        <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5', iconColors[tone])} />
      </div>
    </div>
  );
}

export function PortfolioStats({
  totalValue,
  totalGainLoss,
  totalGainLossPercent,
  positionCount,
  avgRisk,
  onAddPosition,
  onAnalyze,
}: PortfolioStatsProps) {
  const [isFabOpen, setIsFabOpen] = useState(false);
  
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const isProfit = totalGainLoss >= 0;

  return (
    <section className="style-hero rgb-border relative overflow-hidden rounded-lg border border-border bg-card p-6 sm:p-8">
        <div
            className="style-hero-grid absolute inset-0 pointer-events-none"
            aria-hidden
        />
        <div className="absolute inset-x-8 bottom-6 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-70" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between z-50">
            <div className="space-y-4 max-w-3xl">
                <div className="flex items-center gap-3">
                    <Wallet className="w-10 h-10 text-primary" />
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight">
                            My Portfolio
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Track your performance and analyze risk exposure.
                        </p>
                    </div>
                </div>
            </div>

            <div className="hidden sm:flex items-center gap-3">
                 <Button onClick={onAnalyze} variant="outline" className="gap-2 border-primary/30 hover:border-primary/60 bg-primary/5">
                    <Bot size={16} className="text-primary" />
                    AI Analyzer
                 </Button>
                 <Button onClick={onAddPosition} className="gap-2">
                    <PieChart size={16} />
                    Add Position
                 </Button>
            </div>

            {/* Mobile Expandable FAB (Bottom Right) */}
            <div className="sm:hidden fixed bottom-8 right-6 flex flex-col items-end gap-4 z-[999]">
                 {/* Menu Items (Stacked bottom-to-top) */}
                 {isFabOpen && (
                    <div className="flex flex-col items-end gap-4 mb-2 animate-in fade-in slide-in-from-bottom-6 duration-300">
                        {/* 2nd Item: Add Position (Further from thumb) */}
                        <div className="flex items-center gap-3">
                            <span className="bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border border-blue-500/20 text-blue-400">Add Position</span>
                            <Button 
                                onClick={() => { onAddPosition(); setIsFabOpen(false); }}
                                className="h-14 w-14 rounded-full shadow-[0_8px_30px_rgb(59,130,246,0.3)] flex items-center justify-center p-0 bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                                <PieChart size={24} />
                            </Button>
                        </div>

                        {/* 1st Item: AI Analysis (Closest to thumb) */}
                        <div className="flex items-center gap-3">
                            <span className="bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border border-purple-500/20 text-purple-400">AI Analysis</span>
                            <Button 
                                onClick={() => { onAnalyze(); setIsFabOpen(false); }} 
                                className="h-14 w-14 rounded-full shadow-[0_8px_30px_rgb(168,85,247,0.4)] bg-gradient-to-r from-violet-600 to-fuchsia-600 border-0 flex items-center justify-center p-0 transition-all active:scale-90"
                            >
                                <Bot size={26} className="text-white" />
                            </Button>
                        </div>
                    </div>
                 )}

                 {/* Main Trigger Button */}
                 <Button 
                    onClick={() => setIsFabOpen(!isFabOpen)} 
                    className={cn(
                        "rounded-full flex items-center justify-center p-0 transition-all duration-300",
                        isFabOpen 
                            ? "h-12 w-12 rotate-90 bg-slate-800 hover:bg-slate-700 shadow-none mr-2" 
                            : "h-16 w-16 shadow-[0_12px_40px_rgb(168,85,247,0.4)] hover:scale-110 active:scale-95 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white"
                    )}
                 >
                    {isFabOpen ? <X size={24} /> : <Plus size={32} />}
                 </Button>
            </div>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-2 sm:gap-4 sm:mt-8 lg:grid-cols-4">
            <StatPill 
                icon={TrendingUp} // Or Wallet
                label="Total Value"
                value={formatCurrency(totalValue)}
                tone="primary"
            />
            
            <StatPill 
                icon={isProfit ? TrendingUp : TrendingDown}
                label="Total Gain/Loss"
                value={formatCurrency(totalGainLoss)}
                subValue={
                    <span className={isProfit ? "text-emerald-500" : "text-red-500"}>
                        {totalGainLossPercent > 0 ? '+' : ''}{totalGainLossPercent.toFixed(2)}%
                    </span>
                }
                tone={isProfit ? "emerald" : "rose"}
            />
            
            <StatPill 
                icon={PieChart}
                label="Positions"
                value={String(positionCount)}
                tone="muted"
            />

            <StatPill 
                icon={ShieldCheck}
                label="Avg Risk"
                value={avgRisk ? avgRisk.toFixed(1) : '-'}
                tone="accent"
            />
        </div>
    </section>
  );
}

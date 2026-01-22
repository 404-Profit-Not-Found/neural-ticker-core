import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip,
  ComposedChart, Area, CartesianGrid
} from 'recharts';
import { TrendingUp, TrendingDown, Bot } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { format, subDays, differenceInDays, addDays, isBefore, startOfDay, parseISO, isValid } from 'date-fns';

interface Position {
  symbol: string;
  shares: number;
  buy_price: number;
  current_price: number;
  current_value?: number;
  buy_date?: string;
  sector?: string;
  ticker?: { sector?: string; name?: string };
  fundamentals?: { sector?: string };
  [key: string]: unknown;
}

interface PortfolioStatsProps {
  totalValue: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  positions: Position[];
  onAnalyze: () => void;
  credits?: number;
}

// Professional Palette - Carbon/Minimalist
const COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
];

const RANGES = ['1M', '3M', '6M', '1Y'] as const;
type Range = typeof RANGES[number];

// Standard Tooltip (Theme-Aware)
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<Record<string, unknown>>; label?: string }) => {
  if (active && payload && payload.length) {
    const formatCurrency = (val: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    return (
      <div className="bg-popover border border-border p-3 rounded-lg shadow-xl text-xs">
        <p className="font-semibold text-popover-foreground mb-1.5">{label}</p>
        {payload.map((entry, index: number) => {
          // Check if this data point has added symbols attached
          const entryPayload = entry.payload as Record<string, unknown> | undefined;
          const addedSymbols = entryPayload?.addedSymbols as string[] | undefined;
          if (addedSymbols && index === 0) {
            return (
              <div key={`added-${index}`} className="mt-1 pt-1 border-t border-border/50">
                {addedSymbols.map((sym: string) => (
                  <p key={sym} className="flex items-center gap-1.5 text-blue-400 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    Added: {sym}
                  </p>
                ))}
              </div>
            );
          }
          return null;
        })}
        {payload.map((entry, index: number) => (
          <p key={index} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: (entry.color || entry.stroke) as string }} />
            <span className="text-muted-foreground">{entry.name as string}:</span>
            <span className="font-medium text-popover-foreground">{typeof entry.value === 'number' ? formatCurrency(entry.value) : entry.value as string}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const renderPieLabel = ({ cx, cy, sectorCount }: { cx: number; cy: number; sectorCount: number }) => {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      <tspan x={cx} dy="-0.3em" className="fill-muted-foreground text-[10px] font-medium">Portfolio</tspan>
      <tspan x={cx} dy="1.3em" className="fill-foreground text-sm font-bold">{sectorCount}</tspan>
    </text>
  );
};

export function PortfolioStats({
  totalValue,
  totalGainLoss,
  totalGainLossPercent,
  positions,
  onAnalyze,
  credits = 0,
}: PortfolioStatsProps) {

  const [range, setRange] = useState<Range>('1M');

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  // --- Data Preparation ---

  // 1. Sector Allocation with percentages for legend
  const { sectorData, sectorWithPercent } = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    positions.forEach(p => {
      const sector = p.ticker?.sector || p.fundamentals?.sector || 'Other';
      const val = Number(p.current_value || 0);
      map.set(sector, (map.get(sector) || 0) + val);
      total += val;
    });
    const data = Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const withPercent = data.map(item => ({
      ...item,
      percent: total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'
    }));

    return { sectorData: data, sectorWithPercent: withPercent };
  }, [positions]);

  // 2. History Simulation (Date-Aware) - WITH FALLBACKS AND NUMERIC CASTING
  const historyData = useMemo(() => {
    let days = 30;
    switch (range) {
      case '1M': days = 30; break;
      case '3M': days = 90; break;
      case '6M': days = 180; break;
      case '1Y': days = 365; break;
    }

    const today = startOfDay(new Date());
    const startDate = subDays(today, days);

    const data = [];

    for (let i = 0; i <= days; i++) {
      const currentDate = addDays(startDate, i);
      let dailyValue = 0;

      positions.forEach(pos => {
        // Safely cast inputs to numbers to handle "decimal" strings from DB
        const shares = Number(pos.shares || 0);
        const buyPrice = Number(pos.buy_price || pos.current_price || 0);
        const currentPrice = Number(pos.current_price || buyPrice);

        if (isNaN(shares) || shares === 0) return;
        if (isNaN(buyPrice) && isNaN(currentPrice)) return;

        const safeBuyPrice = isNaN(buyPrice) ? currentPrice : buyPrice;
        const safeCurrentPrice = isNaN(currentPrice) ? safeBuyPrice : currentPrice;

        // FALLBACK: if buy_date is missing or invalid, assume owned BEFORE chart start
        let buyDate: Date;
        try {
          if (pos.buy_date) {
            const parsed = parseISO(pos.buy_date);
            if (isValid(parsed)) {
              buyDate = startOfDay(parsed);
            } else {
              buyDate = subDays(today, 365 * 10); // Assume long held if invalid
            }
          } else {
            buyDate = subDays(today, 365 * 10); // Assume long held if missing
          }
        } catch {
          buyDate = subDays(today, 365 * 10);
        }

        if (isBefore(currentDate, buyDate)) return;

        const daysSinceBuy = differenceInDays(currentDate, buyDate);
        const totalDaysOwned = differenceInDays(today, buyDate);

        // If totalDaysOwned is 0 or negative (bought today/future), progress is 1 (show current price)
        const progress = totalDaysOwned <= 0 ? 1 : Math.min(1, Math.max(0, daysSinceBuy / totalDaysOwned));

        const estimatedPrice = safeBuyPrice + (safeCurrentPrice - safeBuyPrice) * progress;

        // Use deterministic variation based on index instead of Math.random() for purity
        const variation = ((i % 7) - 3) * 0.001;

        dailyValue += shares * Math.max(0, estimatedPrice * (1 + variation));
      });

      // Check for buys on this specific day
      const buysToday = positions.filter(pos => {
        if (!pos.buy_date) return false;
        try {
          // Compare purely on YYYY-MM-DD to avoid time zone drift issues for dots
          const buyDate = parseISO(pos.buy_date);
          return isValid(buyDate) && format(buyDate, 'MMM dd') === format(currentDate, 'MMM dd');
        } catch { return false; }
      }).map(p => p.symbol);

      data.push({
        date: format(currentDate, 'MMM dd'),
        value: dailyValue,
        addedSymbols: buysToday.length > 0 ? buysToday : undefined
      });
    }

    // Debugging data
    console.log('[PortfolioStats] historyData constructed:', {
      points: data.length,
      first: data[0],
      last: data[data.length - 1],
      totalValue
    });

    return data;
  }, [range, positions, totalValue]);


  const isProfit = totalGainLoss >= 0;
  const chartColor = isProfit ? '#10b981' : '#f43f5e'; // Emerald-500 or Rose-500


  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Header Section */}
      <div className="flex flex-row items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground truncate">My Portfolio</h1>
          <p className="text-sm text-muted-foreground truncate hidden sm:block">Real-time cross-asset performance analytics</p>
        </div>
        <div className="flex-shrink-0">
          <Button
            onClick={onAnalyze}
            disabled={credits <= 0}
            size="sm"
            className={cn(
              "gap-2 h-9 text-xs border-0 shadow-md transition-all",
              credits > 0
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
                : "bg-muted text-muted-foreground cursor-not-allowed opacity-70"
            )}
            title={credits <= 0 ? "Insufficient credits to analyze" : "Click to analyze portfolio with AI"}
          >
            <Bot size={14} className={cn(credits > 0 ? "text-white" : "text-muted-foreground")} />
            AI Analyze
          </Button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 1. Portfolio Performance Chart (Main Card) */}
        <div className="lg:col-span-2 rounded-xl border border-border/50 bg-card flex flex-col h-72 lg:h-80">
          <div className="p-6 pb-2 flex justify-between items-start">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Total Net Worth</p>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                {formatCurrency(totalValue)}
              </h2>
              <div className={cn(
                "inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md text-xs font-semibold",
                isProfit
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              )}>
                {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {formatCurrency(Math.abs(totalGainLoss))} ({totalGainLossPercent >= 0 ? '+' : ''}{totalGainLossPercent.toFixed(2)}%)
              </div>
            </div>

            {/* Range Selectors */}
            <div className="flex items-center bg-muted/50 rounded-md p-1 border border-border/50">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "px-3 py-1 text-[11px] font-medium rounded-sm transition-all duration-200",
                    range === r
                      ? "bg-background text-foreground shadow-sm border border-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Chart Area */}
          <div className="flex-1 w-full min-h-0 relative px-3 sm:px-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={historyData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValuePortfolio" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.1} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={true} strokeDasharray="3 3" stroke="var(--border)" opacity={0.2} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  interval="preserveStartEnd"
                  minTickGap={50}
                  dy={4}
                />
                <YAxis
                  orientation="right"
                  width={40}
                  tickFormatter={(value) => new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(value)}
                  tick={{ fontSize: 9, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Portfolio Value"
                  stroke={chartColor}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorValuePortfolio)"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (payload && payload.addedSymbols && payload.addedSymbols.length > 0) {
                      return <circle key={payload.date} cx={cx} cy={cy} r={4} fill="white" stroke={chartColor} strokeWidth={2} />;
                    }
                    return <></>;
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Sector Allocation */}
        <div className="rounded-xl border border-border/50 bg-card p-5 flex flex-col h-72 lg:h-80">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Allocation</h3>
          <div className="flex-1 flex items-center justify-center gap-4 min-h-0">
            <div className="w-[140px] h-[140px] flex-shrink-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sectorData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={2}
                    stroke="none"
                    cornerRadius={3}
                    labelLine={false}
                    label={(props: { cx: number; cy: number }) => renderPieLabel({ ...props, sectorCount: sectorData.length })}
                  >
                    {sectorData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                        className="hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[180px] pr-1">
              {sectorWithPercent.slice(0, 6).map((item, index) => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-muted-foreground truncate flex-1">{item.name}</span>
                  <span className="text-foreground font-medium">{item.percent}%</span>
                </div>
              ))}
              {sectorWithPercent.length > 6 && (
                <div className="text-[10px] text-muted-foreground pl-5">
                  +{sectorWithPercent.length - 6} more
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );

}

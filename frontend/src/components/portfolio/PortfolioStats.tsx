import { useMemo, useState } from 'react';
import { 
  ResponsiveContainer, PieChart, Pie, Cell, 
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ComposedChart, Area, Scatter, CartesianGrid
} from 'recharts';
import { TrendingUp, TrendingDown, Bot } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { format, subDays, differenceInDays, addDays, isBefore, startOfDay, parseISO, isValid } from 'date-fns';

interface PortfolioStatsProps {
  totalValue: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  positions: any[]; 
  onAnalyze: () => void;
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

export function PortfolioStats({
  totalValue,
  totalGainLoss,
  totalGainLossPercent,
  positions,
  onAnalyze,
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

  // 2. Risk Distribution
  const riskData = useMemo(() => {
    const buckets = [
      { name: 'Low', count: 0, color: '#10b981' }, 
      { name: 'Medium', count: 0, color: '#f59e0b' },
      { name: 'High', count: 0, color: '#ef4444' },
    ];
    positions.forEach(p => {
      const r = p.aiAnalysis?.financial_risk;
      if (typeof r === 'number') {
        if (r <= 3.5) buckets[0].count += 1;
        else if (r <= 6.5) buckets[1].count += 1;
        else buckets[2].count += 1;
      }
    });
    return buckets;
  }, [positions]);

  // 3. History Simulation (Date-Aware) - WITH FALLBACKS AND NUMERIC CASTING
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
           
           // Very subtle noise for smoothness
           const noise = (Math.random() - 0.5) * (estimatedPrice * 0.003);
           
           dailyValue += shares * Math.max(0, estimatedPrice + noise);
       });

       data.push({ 
           date: format(currentDate, 'MMM dd'),
           value: dailyValue,
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

  // 4. Calculate Buy Markers (Positions added within range)
  const buyMarkers = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];
    
    // Create a set of valid dates in the chart for quick lookup
    const validDates = new Set(historyData.map(d => d.date));
    
    return positions.flatMap(pos => {
      if (!pos.buy_date) return [];
      try {
        const buyDate = parseISO(pos.buy_date);
        if (!isValid(buyDate)) return [];
        
        const dateKey = format(buyDate, 'MMM dd');
        if (!validDates.has(dateKey)) return []; // Bought outside range
        
        // Find approximate value at that date (or linear interpolation if needed, but strict match is safer for dots)
        const point = historyData.find(d => d.date === dateKey);
        
        return [{
            date: dateKey,
            value: point?.value || 0,
            symbol: pos.symbol
        }];
      } catch { 
        return []; 
      }
    });
  }, [positions, historyData]);


  const isProfit = totalGainLoss >= 0;
  const chartColor = isProfit ? '#10b981' : '#f43f5e'; // Emerald-500 or Rose-500

  // Standard Tooltip (Theme-Aware)
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
         <div className="bg-popover border border-border p-3 rounded-lg shadow-xl text-xs">
          <p className="font-semibold text-popover-foreground mb-1.5">{label}</p>
          {payload.map((entry: any, index: number) => {
            if (entry.name === 'Added') {
              return (
                 <div key={index} className="mt-1 pt-1 border-t border-border/50">
                    <p className="flex items-center gap-1.5 text-blue-400 font-semibold">
                       <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                       Added: {entry.payload.symbol}
                    </p>
                 </div>
              );
            }
            return (
             <p key={index} className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.stroke }} />
               <span className="text-muted-foreground">{entry.name}:</span>
               <span className="font-medium text-popover-foreground">{typeof entry.value === 'number' ? formatCurrency(entry.value) : entry.value}</span>
            </p>
            );
          })}
        </div>
      );
    }
    return null;
  };

  const renderPieLabel = ({ cx, cy }: any) => {
    return (
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
        <tspan x={cx} dy="-0.3em" className="fill-muted-foreground text-[10px] font-medium">Portfolio</tspan>
        <tspan x={cx} dy="1.3em" className="fill-foreground text-sm font-bold">{sectorData.length}</tspan>
      </text>
    );
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">My Portfolio</h1>
              <p className="text-sm text-muted-foreground">Real-time cross-asset performance analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-end md:self-auto">
             <Button onClick={onAnalyze} size="sm" className="gap-2 h-9 text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-md">
                <Bot size={14} className="text-white" />
                AI Analyze
             </Button>
          </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 1. Portfolio Performance Chart (Main Card) */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card flex flex-col h-[450px]">
           <div className="p-6 pb-2 flex justify-between items-start">
              <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Total Net Worth</p>
                  <h2 className="text-4xl font-bold tracking-tight text-foreground">
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
              <div className="flex items-center bg-muted/50 rounded-md p-1 border border-border">
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
           <div className="flex-1 w-full min-h-0 relative px-4 pb-4">
               <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={historyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorValuePortfolio" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartColor} stopOpacity={0.1}/>
                        <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={true} strokeDasharray="3 3" stroke="var(--border)" opacity={0.2} />
                    <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 10, fill: '#9ca3af'}} 
                        interval="preserveStartEnd"
                        minTickGap={60}
                        dy={8}
                    />
                    <YAxis 
                        orientation="right"
                        width={60} 
                        tickFormatter={(value) => new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(value)}
                        tick={{fontSize: 10, fill: '#9ca3af'}}
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
                        animationDuration={1000}
                    />
                    <Scatter 
                      data={buyMarkers}
                      name="Added"
                      fill="white"
                      shape="circle"
                    >
                      {buyMarkers.map((_, index) => (
                        <Cell key={`cell-${index}`} fill="white" stroke={chartColor} strokeWidth={2} />
                      ))}
                    </Scatter>
                  </ComposedChart>
               </ResponsiveContainer>
           </div>
        </div>

        {/* 2. Secondary Stats - Vertical Stack */}
        <div className="flex flex-col gap-6">
            
            {/* Sector Allocation */}
            <div className="flex-1 rounded-lg border border-border bg-card p-5 flex flex-col min-h-[213px]">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Allocation</h3>
                <div className="flex-1 flex items-center gap-3 min-h-0">
                    <div className="w-[120px] h-[120px] flex-shrink-0 relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={sectorData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={38}
                                outerRadius={55}
                                paddingAngle={2}
                                stroke="none"
                                cornerRadius={3}
                                labelLine={false}
                                label={renderPieLabel}
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
                    <div className="flex-1 space-y-2 overflow-y-auto max-h-[130px] pr-1">
                      {sectorWithPercent.slice(0, 5).map((item, index) => (
                        <div key={item.name} className="flex items-center gap-2 text-[10px]">
                          <span 
                            className="w-2 h-2 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-muted-foreground truncate flex-1">{item.name}</span>
                          <span className="text-foreground font-medium">{item.percent}%</span>
                        </div>
                      ))}
                      {sectorWithPercent.length > 5 && (
                        <div className="text-[9px] text-muted-foreground pl-4">
                          +{sectorWithPercent.length - 5} more
                        </div>
                      )}
                    </div>
                </div>
            </div>

            {/* Risk Exposure - Vertical Bars */}
            <div className="flex-1 rounded-lg border border-border bg-card p-5 flex flex-col min-h-[213px]">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Risk Analysis</h3>
                <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={riskData} margin={{ top: 10, right: 0, left: 0, bottom: 5 }} barCategoryGap="30%">
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                            <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 500}} 
                                dy={8}
                            />
                            <YAxis hide domain={[0, 'auto']} />
                            <Tooltip 
                              cursor={{fill: 'hsl(var(--muted))', opacity: 0.2, radius: 4}} 
                              formatter={(value: number, name: string) => [`${value} positions`, name]}
                              labelFormatter={(label) => `${label} Risk`}
                              contentStyle={{
                                backgroundColor: 'hsl(var(--popover))',
                                borderColor: 'hsl(var(--border))',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                fontSize: '11px',
                                color: 'hsl(var(--popover-foreground))'
                              }}
                              itemStyle={{ color: 'hsl(var(--muted-foreground))' }}
                              labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: '4px' }}
                            />
                            <Bar 
                                dataKey="count" 
                                radius={[4, 4, 0, 0]} 
                                maxBarSize={40}
                            >
                              {riskData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

        </div>

      </div>
    </div>
  );

}

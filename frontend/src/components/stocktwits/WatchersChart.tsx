
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';

interface WatcherData {
    id: string;
    symbol: string;
    count: number;
    timestamp: string;
}

interface WatchersChartProps {
    data: WatcherData[];
}

interface TooltipProps {
    active?: boolean;
    payload?: { payload: WatcherData }[];
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const dateObj = new Date(data.timestamp);
        
        // European format
        const dateStr = dateObj.toLocaleDateString('en-GB', { 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
        });

        return (
            <div className="bg-zinc-950/95 border border-zinc-800 p-3 rounded-lg shadow-xl backdrop-blur-sm min-w-[140px]">
                <div className="text-xs font-medium text-zinc-300 mb-2">{dateStr}</div>
                
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-xl font-bold text-white tabular-nums">{data.count.toLocaleString()}</span>
                    <span className="text-[10px] text-zinc-400 font-medium">WATCHERS</span>
                </div>
            </div>
        );
    }
    return null;
};

export const WatchersChart = ({ data }: WatchersChartProps) => {
    // Trending usually needs at least 2 points
    if (!data || data.length < 2) {
        return null;
    }

    // Sort by date ascending for chart
    const sortedData = [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    // Calculate Change
    const first = sortedData[0]?.count || 0;
    const last = sortedData[sortedData.length - 1]?.count || 0;
    const diff = last - first;
    const isPositive = diff >= 0;

    return (
        <div className="w-full h-[200px] relative">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sortedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorWatchers" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis 
                        dataKey="timestamp" 
                        hide={false}
                        tick={{ fontSize: 10, fill: '#71717a' }}
                        tickFormatter={(val) => new Date(val).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}
                        stroke="#3f3f46"
                        minTickGap={30}
                    />
                    <YAxis 
                         domain={['auto', 'auto']}
                         tick={{ fontSize: 10, fill: '#71717a' }}
                         stroke="#3f3f46"
                         width={40}
                         tickFormatter={(val) => val.toLocaleString()}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#3f3f46', strokeDasharray: '3 3' }} />
                    <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorWatchers)"
                    />
                </AreaChart>
            </ResponsiveContainer>
            
            {/* Trend Indicator Overlay */}
            <div className="absolute top-0 right-4 text-right pointer-events-none">
                <div className="text-2xl font-bold tabular-nums text-amber-500">
                    {last.toLocaleString()}
                </div>
                <div className={`text-[10px] font-medium tracking-wider flex items-center justify-end gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    <span>{diff > 0 ? '+' : ''}{diff} (30d)</span>
                </div>
            </div>
        </div>
    );
};

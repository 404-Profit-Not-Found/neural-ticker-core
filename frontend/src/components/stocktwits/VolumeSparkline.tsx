import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

interface VolumeSparklineProps {
    data: { date: string; count: number; topics?: string[] }[];
    startDate?: string;
    endDate?: string;
}

interface TooltipProps {
    active?: boolean;
    payload?: { payload: { date: string; count: number; topics?: string[] } }[];
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const dateObj = new Date(data.date);
        
        // Format: "Monday, Jan 8"
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        return (
            <div className="bg-zinc-950/95 border border-zinc-800 p-3 rounded-lg shadow-xl backdrop-blur-sm min-w-[140px]">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold mb-0.5">{dayName}</div>
                <div className="text-xs font-medium text-zinc-300 mb-2">{dateStr}</div>
                
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-xl font-bold text-white tabular-nums">{data.count}</span>
                    <span className="text-[10px] text-zinc-400 font-medium">POSTS</span>
                </div>

                {data.topics && data.topics.length > 0 ? (
                    <div className="border-t border-zinc-800 pt-2 mt-1">
                        <div className="text-[9px] uppercase tracking-wider text-green-500 font-bold mb-1.5 px-0.5">Top Drivers</div>
                        <div className="flex flex-wrap gap-1.5">
                           {data.topics.map((t: string, i: number) => (
                               <span key={i} className="text-[10px] bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-800/50">
                                   {t}
                               </span>
                           ))}
                        </div>
                    </div>
                ) : (
                    <div className="border-t border-zinc-800 pt-2 mt-1">
                        <div className="text-[10px] italic text-zinc-600">No analysis for this day</div>
                    </div>
                )}
            </div>
        );
    }
    return null;
};

export const VolumeSparkline = ({ data, startDate, endDate }: VolumeSparklineProps) => {
    if (!data || data.length === 0) {
        return <div className="h-full flex items-center justify-center text-muted-foreground text-xs">No Volume Data</div>;
    }

    return (
        <div className="w-full h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#3f3f46', strokeDasharray: '3 3' }} />
                    <XAxis 
                        dataKey="date" 
                        hide 
                    />
                    <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorVolume)"
                    />
                </AreaChart>
            </ResponsiveContainer>
            
            {/* Context Labels */}
            <div className="flex justify-between px-2 mt-1">
                 <span className="text-[10px] text-muted-foreground/50">{startDate || '30 Days Ago'}</span>
                 <span className="text-[10px] text-muted-foreground/50">{endDate || 'Today'}</span>
            </div>
            
             {/* Latest Value Highligher */}
            <div className="absolute top-2 right-4 text-right">
                <div className="text-2xl font-bold tabular-nums text-blue-400">
                    {data[data.length - 1]?.count || 0}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Posts Today</div>
            </div>
        </div>
    );
};

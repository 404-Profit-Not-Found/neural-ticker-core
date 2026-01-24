import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

interface VolumeSparklineProps {
    data: { date: string; count: number }[];
    startDate?: string;
    endDate?: string;
}

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
                    <Tooltip
                        contentStyle={{ 
                            backgroundColor: '#09090b', 
                            borderColor: '#27272a',
                            fontSize: '11px',
                            color: '#e4e4e7',
                            borderRadius: '6px'
                        }}
                        itemStyle={{ color: '#60a5fa' }}
                        cursor={{ stroke: '#3f3f46', strokeDasharray: '3 3' }}
                        labelFormatter={(label) => new Date(label).toLocaleDateString()}
                    />
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

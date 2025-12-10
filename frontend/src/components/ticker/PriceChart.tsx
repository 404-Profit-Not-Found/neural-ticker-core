import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface PricePoint {
    time: string;
    close: number;
}

interface PriceChartProps {
    data: PricePoint[];
}

export function PriceChart({ data }: PriceChartProps) {
    if (!data || data.length === 0) {
        return <div className="h-64 flex items-center justify-center text-muted-foreground">No price history available</div>;
    }

    // Sort by date just in case
    const sortedData = [...data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const stats = {
        min: Math.min(...sortedData.map(d => d.close)),
        max: Math.max(...sortedData.map(d => d.close)),
        start: sortedData[0]?.close || 0,
        end: sortedData[sortedData.length - 1]?.close || 0,
    };

    const isPositive = stats.end >= stats.start;
    const color = isPositive ? '#10b981' : '#ef4444'; // Green or Red

    return (
        <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sortedData}>
                    <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="time"
                        hide
                        tickFormatter={(str) => new Date(str).toLocaleDateString()}
                    />
                    <YAxis
                        domain={['auto', 'auto']}
                        orientation="right"
                        tick={{ fontSize: 12, fill: '#888' }}
                        tickFormatter={(val) => `$${val.toFixed(0)}`}
                        width={40}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--foreground))',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}
                        labelFormatter={(label) => new Date(label).toLocaleDateString()}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
                    />
                    <Area
                        type="monotone"
                        dataKey="close"
                        stroke={color}
                        fillOpacity={1}
                        fill="url(#colorPrice)"
                        strokeWidth={2}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

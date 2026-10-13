import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatDate, formatDateShort } from '../../lib/datetime';
import { formatCount } from '../../lib/format';

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
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;

    return (
        <div className="min-w-[140px] rounded-md bg-popover p-3 text-popover-foreground shadow-xl">
            <div className="num text-xs text-muted-foreground">{formatDate(data.date)}</div>
            <div className="mt-1 flex items-baseline gap-1.5">
                <span className="num text-xl font-bold text-foreground">{formatCount(data.count)}</span>
                <span className="text-xs text-muted-foreground">posts</span>
            </div>
            {data.topics && data.topics.length > 0 && (
                <div className="mt-2">
                    <div className="label-micro mb-1.5">Top drivers</div>
                    <div className="flex flex-wrap gap-1.5">
                        {data.topics.map((topic, i) => (
                            <span key={i} className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-foreground/90">
                                {topic}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export const VolumeSparkline = ({ data, startDate, endDate }: VolumeSparklineProps) => {
    if (!data || data.length === 0) {
        return <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">No post volume recorded.</div>;
    }

    return (
        <div className="w-full">
            <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                        <defs>
                            <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgb(var(--muted-foreground) / 0.5)', strokeDasharray: '3 3' }} />
                        <XAxis dataKey="date" hide />
                        <Area isAnimationActive={false} type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorVolume)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <div className="num mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{startDate ? formatDateShort(startDate) : '30 days ago'}</span>
                <span>{endDate ? formatDateShort(endDate) : 'Today'}</span>
            </div>
        </div>
    );
};

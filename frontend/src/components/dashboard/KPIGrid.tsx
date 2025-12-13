import { useEffect, useState } from 'react';
import {
    TrendingUp,
    Newspaper,
    BrainCircuit,
    BarChart3,
    Calendar
} from 'lucide-react';
import { cn, api } from '../../lib/api';
import { Card, CardContent } from '../ui/card';

interface KPIItem {
    title: string;
    value: string;
    subtext: string;
    subtextColor?: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    color: string;
    glow: string;
}

const COLORS: Record<string, string> = {
    green: "text-green-500",
    blue: "text-blue-500",
    purple: "text-purple-500",
    cyan: "text-cyan-500",
    yellow: "text-yellow-500",
    red: "text-red-500"
};

export function KPIGrid() {
    const [tickerCount, setTickerCount] = useState<number | null>(null);
    const [strongBuyCount, setStrongBuyCount] = useState<number | null>(null);
    const [sellCount, setSellCount] = useState<number | null>(null);

    useEffect(() => {
        // Fetch all stats in parallel
        Promise.all([
            api.get<{ count: number }>('/tickers/count'),
            api.get<{ count: number; symbols: string[] }>('/stats/strong-buy'),
            api.get<{ count: number; symbols: string[] }>('/stats/sell'),
        ]).then(([tickersRes, strongBuyRes, sellRes]) => {
            setTickerCount(tickersRes.data.count);
            setStrongBuyCount(strongBuyRes.data.count);
            setSellCount(sellRes.data.count);
        }).catch(() => {
            setTickerCount(0);
            setStrongBuyCount(0);
            setSellCount(0);
        });
    }, []);

    const KPI_DATA: KPIItem[] = [
        {
            title: "Strong Buy",
            value: strongBuyCount !== null ? String(strongBuyCount) : "...",
            subtext: `Sell: ${sellCount !== null ? sellCount : "..."}`,
            subtextColor: "text-red-400",
            icon: TrendingUp,
            color: "green",
            glow: "shadow-[0_0_20px_-10px_rgba(34,197,94,0.5)]"
        },
        {
            title: "News",
            value: "25",
            subtext: "New: 25 / Overall: 200",
            icon: Newspaper,
            color: "blue",
            glow: "shadow-[0_0_20px_-10px_rgba(59,130,246,0.5)]"
        },
        {
            title: "Research",
            value: "5",
            subtext: "Completed",
            icon: BrainCircuit,
            color: "purple",
            glow: "shadow-[0_0_20px_-10px_rgba(168,85,247,0.5)]"
        },
        {
            title: "Tickers",
            value: tickerCount !== null ? String(tickerCount) : "...",
            subtext: "In Database",
            icon: BarChart3,
            color: "cyan",
            glow: "shadow-[0_0_20px_-10px_rgba(6,182,212,0.5)]"
        },
        {
            title: "Events",
            value: "2",
            subtext: "This Week",
            icon: Calendar,
            color: "yellow",
            glow: "shadow-[0_0_20px_-10px_rgba(234,179,8,0.5)]"
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {KPI_DATA.map((kpi, index) => (
                <Card
                    key={index}
                    rgb={true}
                    className={cn(
                        "relative overflow-hidden group hover:border-accent transition-colors",
                        kpi.glow
                    )}
                >
                    {/* Grid Pattern Overlay */}
                    <div
                        className="absolute inset-0 opacity-[0.03] pointer-events-none"
                        style={{
                            backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
                            backgroundSize: '20px 20px',
                            color: 'var(--foreground)'
                        }}
                    />

                    <CardContent className="p-4 relative z-10">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-sm font-medium text-muted-foreground">{kpi.title}</span>
                            <kpi.icon size={18} className={cn(COLORS[kpi.color])} />
                        </div>

                        <div className="text-3xl font-bold text-foreground mb-1">
                            {kpi.value}
                        </div>

                        <div className={cn("text-xs text-muted-foreground", kpi.subtextColor)}>
                            {kpi.subtext}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

import {
    TrendingUp,
    Newspaper,
    BrainCircuit,
    AlertTriangle,
    Calendar
} from 'lucide-react';
import { cn } from '../../lib/api';

const KPI_DATA = [
    {
        title: "Strong Buy",
        value: "12",
        subtext: "Sell: 12",
        icon: TrendingUp,
        color: "green", // Success
        glow: "shadow-[0_0_20px_-10px_rgba(34,197,94,0.5)]"
    },
    {
        title: "News",
        value: "25",
        subtext: "New: 25 / Overall: 200",
        icon: Newspaper,
        color: "blue", // Primary Blue
        glow: "shadow-[0_0_20px_-10px_rgba(59,130,246,0.5)]"
    },
    {
        title: "Research",
        value: "5",
        subtext: "Completed",
        icon: BrainCircuit,
        color: "purple", // Purple
        glow: "shadow-[0_0_20px_-10px_rgba(168,85,247,0.5)]"
    },
    {
        title: "Problems",
        value: "3",
        subtext: "Alerts",
        icon: AlertTriangle,
        color: "red", // Danger
        glow: "shadow-[0_0_20px_-10px_rgba(239,68,68,0.5)]"
    },
    {
        title: "Events",
        value: "2",
        subtext: "This Week",
        icon: Calendar,
        color: "yellow", // Warning
        glow: "shadow-[0_0_20px_-10px_rgba(234,179,8,0.5)]"
    }
];

const COLORS: Record<string, string> = {
    green: "text-green-500",
    blue: "text-blue-500",
    purple: "text-purple-500",
    red: "text-red-500",
    yellow: "text-yellow-500"
};

export function KPIGrid() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {KPI_DATA.map((kpi, index) => (
                <div
                    key={index}
                    className={cn(
                        "relative bg-[#18181b] border border-[#27272a] rounded-md p-4 overflow-hidden group hover:border-[#3f3f46] transition-colors",
                        kpi.glow
                    )}
                >
                    {/* Grid Pattern Overlay */}
                    <div
                        className="absolute inset-0 opacity-[0.03] pointer-events-none"
                        style={{
                            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
                            backgroundSize: '20px 20px'
                        }}
                    />

                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-sm font-medium text-[#a1a1aa]">{kpi.title}</span>
                            <kpi.icon size={18} className={cn(COLORS[kpi.color])} />
                        </div>

                        <div className="text-3xl font-bold text-[#fafafa] mb-1">
                            {kpi.value}
                        </div>

                        <div className="text-xs text-[#a1a1aa]">
                            {kpi.subtext}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

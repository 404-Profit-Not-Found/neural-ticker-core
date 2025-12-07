import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/api';

interface StatCardProps {
    label: string;
    value: string;
    change?: string;
    isPositive?: boolean;
    icon: LucideIcon;
    color?: 'emerald' | 'blue' | 'purple' | 'orange';
}

const COLORS = {
    emerald: 'text-emerald-500 bg-emerald-500/10',
    blue: 'text-blue-500 bg-blue-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
    orange: 'text-orange-500 bg-orange-500/10',
};

export function StatCard({ label, value, change, isPositive, icon: Icon, color = 'emerald' }: StatCardProps) {
    return (
        <div className="glass-panel p-6 hover:border-white/20 transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-zinc-400 text-sm font-medium">{label}</h3>
                <div className={cn("p-2 rounded-lg transition-colors", COLORS[color])}>
                    <Icon size={18} />
                </div>
            </div>

            <div className="text-2xl font-bold tracking-tight text-white mb-2">
                {value}
            </div>

            {change && (
                <div className={cn(
                    "flex items-center text-xs font-medium",
                    isPositive ? "text-emerald-400" : "text-red-400"
                )}>
                    {isPositive ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                    {change}
                    <span className="text-zinc-600 ml-2 font-normal">vs yesterday</span>
                </div>
            )}
        </div>
    );
}

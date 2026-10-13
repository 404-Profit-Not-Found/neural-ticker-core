import { Users, CheckCircle, Clock, Sparkles, Crown, Ban } from 'lucide-react';
import { StatPill } from '../dashboard/StatPill';

export type AdminFilterKey = 'ALL' | 'ACTIVE' | 'WAITLIST' | 'BANNED' | 'PRO' | 'WHALE';

interface AdminStats {
    total: number;
    active: number;
    waitlist: number;
    banned: number;
    pro: number;
    whale: number;
}

interface AdminStatsBarProps {
    stats: AdminStats;
    selectedFilter: AdminFilterKey;
    onFilterChange: (filter: AdminFilterKey) => void;
}



export function AdminStatsBar({ stats, selectedFilter, onFilterChange }: AdminStatsBarProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <StatPill
                icon={Users}
                label="Total Users"
                value={stats.total}
                isActive={selectedFilter === 'ALL'}
                onClick={() => onFilterChange('ALL')}
                tone="primary"
            />
            <StatPill
                icon={CheckCircle}
                label="Active"
                value={stats.active}
                isActive={selectedFilter === 'ACTIVE'}
                onClick={() => onFilterChange('ACTIVE')}
                tone="emerald"
            />
            <StatPill
                icon={Clock}
                label="Waitlist"
                value={stats.waitlist}
                isActive={selectedFilter === 'WAITLIST'}
                onClick={() => onFilterChange('WAITLIST')}
                tone="amber"
            />
            <StatPill
                icon={Ban}
                label="Banned"
                value={stats.banned}
                isActive={selectedFilter === 'BANNED'}
                onClick={() => onFilterChange('BANNED')}
                tone="rose"
            />
            <StatPill
                icon={Sparkles}
                label="Pro"
                value={stats.pro}
                isActive={selectedFilter === 'PRO'}
                onClick={() => onFilterChange('PRO')}
                tone="muted"
            />
            <StatPill
                icon={Crown}
                label="Whales"
                value={stats.whale}
                isActive={selectedFilter === 'WHALE'}
                onClick={() => onFilterChange('WHALE')}
                tone="amber"
            />
        </div>
    );
}

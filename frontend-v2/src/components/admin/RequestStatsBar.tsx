import { List, CheckCircle, Clock, Ban } from 'lucide-react';
import { StatPill } from '../dashboard/StatPill';

export type RequestFilterKey = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

interface RequestStats {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
}

interface RequestStatsBarProps {
    stats: RequestStats;
    selectedFilter: RequestFilterKey;
    onFilterChange: (filter: RequestFilterKey) => void;
}

export function RequestStatsBar({ stats, selectedFilter, onFilterChange }: RequestStatsBarProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatPill
                icon={List}
                label="Total Requests"
                value={stats.total}
                isActive={selectedFilter === 'ALL'}
                onClick={() => onFilterChange('ALL')}
                tone="primary"
            />
            <StatPill
                icon={Clock}
                label="Pending"
                value={stats.pending}
                isActive={selectedFilter === 'PENDING'}
                onClick={() => onFilterChange('PENDING')}
                tone="amber"
            />
            <StatPill
                icon={CheckCircle}
                label="Approved"
                value={stats.approved}
                isActive={selectedFilter === 'APPROVED'}
                onClick={() => onFilterChange('APPROVED')}
                tone="emerald"
            />
            <StatPill
                icon={Ban}
                label="Rejected"
                value={stats.rejected}
                isActive={selectedFilter === 'REJECTED'}
                onClick={() => onFilterChange('REJECTED')}
                tone="rose"
            />
        </div>
    );
}

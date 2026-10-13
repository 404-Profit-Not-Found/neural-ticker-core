import { FilterChips } from './admin-ui';

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
    /** The list has not loaded: no counts yet. */
    loading?: boolean;
    className?: string;
}

/** The user counts, as the strip that filters the list by status or tier. */
export function AdminStatsBar({ stats, selectedFilter, onFilterChange, loading, className }: AdminStatsBarProps) {
    return (
        <FilterChips
            label="Filter users"
            className={className}
            loading={loading}
            value={selectedFilter}
            onChange={onFilterChange}
            options={[
                { value: 'ALL', label: 'All', count: stats.total },
                { value: 'ACTIVE', label: 'Active', count: stats.active },
                { value: 'WAITLIST', label: 'Waitlist', count: stats.waitlist },
                { value: 'BANNED', label: 'Banned', count: stats.banned },
                { value: 'PRO', label: 'Pro', count: stats.pro },
                { value: 'WHALE', label: 'Whale', count: stats.whale },
            ]}
        />
    );
}

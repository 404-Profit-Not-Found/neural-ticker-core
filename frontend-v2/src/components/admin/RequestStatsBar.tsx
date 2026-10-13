import { FilterChips } from './admin-ui';

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
    /** The list has not loaded: no counts yet. */
    loading?: boolean;
    className?: string;
}

/** The request counters, as the strip that filters the list by state. */
export function RequestStatsBar({ stats, selectedFilter, onFilterChange, loading, className }: RequestStatsBarProps) {
    return (
        <FilterChips
            label="Filter requests"
            className={className}
            loading={loading}
            value={selectedFilter}
            onChange={onFilterChange}
            options={[
                { value: 'ALL', label: 'All', count: stats.total },
                { value: 'PENDING', label: 'Pending', count: stats.pending },
                { value: 'APPROVED', label: 'Approved', count: stats.approved },
                { value: 'REJECTED', label: 'Rejected', count: stats.rejected },
            ]}
        />
    );
}

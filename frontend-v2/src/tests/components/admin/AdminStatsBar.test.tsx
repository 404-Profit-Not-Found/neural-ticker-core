import { render, screen, fireEvent } from '@testing-library/react';
import { AdminStatsBar } from '../../../components/admin/AdminStatsBar';
import { describe, it, expect, vi } from 'vitest';

describe('AdminStatsBar', () => {
    const mockStats = {
        total: 100,
        active: 80,
        waitlist: 20,
        banned: 0,
        pro: 10,
        whale: 5,
    };

    it('renders all stats correctly', () => {
        render(
            <AdminStatsBar
                stats={mockStats}
                selectedFilter="ALL"
                onFilterChange={vi.fn()}
            />
        );

        expect(screen.getByText('100')).toBeInTheDocument(); // Total
        expect(screen.getByText('80')).toBeInTheDocument();  // Active
        expect(screen.getByText('20')).toBeInTheDocument();  // Waitlist
        expect(screen.getByText('10')).toBeInTheDocument();  // Pro
        expect(screen.getByText('5')).toBeInTheDocument();   // Whale
    });

    it('calls onFilterChange when filterable items are clicked', () => {
        const onFilterChange = vi.fn();
        render(
            <AdminStatsBar
                stats={mockStats}
                selectedFilter="ALL"
                onFilterChange={onFilterChange}
            />
        );

        // Click Waitlist
        fireEvent.click(screen.getByText('Waitlist'));
        expect(onFilterChange).toHaveBeenCalledWith('WAITLIST');

        // Click Active
        fireEvent.click(screen.getByText('Active'));
        expect(onFilterChange).toHaveBeenCalledWith('ACTIVE');
    });

    it('marks the selected filter, and only that one', () => {
        render(
            <AdminStatsBar
                stats={mockStats}
                selectedFilter="WAITLIST"
                onFilterChange={vi.fn()}
            />
        );

        expect(screen.getByRole('button', { name: /Waitlist/ })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows no counts before the list has loaded', () => {
        render(
            <AdminStatsBar
                stats={{ total: 0, active: 0, waitlist: 0, banned: 0, pro: 0, whale: 0 }}
                selectedFilter="ALL"
                onFilterChange={vi.fn()}
                loading
            />
        );

        // A placeholder, never a zero that reads as "nobody".
        expect(screen.queryByText('0')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Active/ })).toBeInTheDocument();
    });
});

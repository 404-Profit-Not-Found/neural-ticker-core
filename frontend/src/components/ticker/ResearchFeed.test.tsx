import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ResearchFeed } from './ResearchFeed';
import type { ResearchItem } from '../../types/ticker';

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'user-123', role: 'admin', credits_balance: 100 } }),
}));

vi.mock('../../hooks/useTicker', () => ({
    useUpdateResearchTitle: () => ({ mutate: vi.fn() }),
    tickerKeys: {
        research: () => ['research'],
        details: () => ['details'],
    },
}));

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({
        invalidateQueries: vi.fn(),
    }),
}));

describe('ResearchFeed', () => {
    const baseProps = {
        research: [] as ResearchItem[],
        onTrigger: vi.fn(),
        onDelete: vi.fn(),
        defaultTicker: 'TEST',
    };

    it('disables the Research button and shows progress text while analyzing', () => {
        render(<ResearchFeed {...baseProps} isAnalyzing />);

        const researchButton = screen.getByRole('button', { name: /Research$/i });
        expect(researchButton).toBeDisabled();
        expect(screen.getByText(/Research in progress · Avg time ~0:45/i)).toBeInTheDocument();
    });

    it('keeps the Research button enabled and hides progress text when idle', () => {
        render(<ResearchFeed {...baseProps} isAnalyzing={false} />);

        const researchButton = screen.getByRole('button', { name: /Research$/i });
        expect(researchButton).not.toBeDisabled();
        expect(screen.queryByText(/Research in progress/i)).toBeNull();
    });
});

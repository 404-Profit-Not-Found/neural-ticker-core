import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ResearchFeed } from './ResearchFeed';
import type { ResearchItem } from '../../types/ticker';

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
    // Rows are real links now (they used to be clickable divs).
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a>,
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

    it('shows an explicit empty state when there is no research', () => {
        render(<ResearchFeed {...baseProps} isAnalyzing={false} />);
        expect(screen.getByText('No research yet')).toBeInTheDocument();
    });

    describe('rows', () => {
        const note = (id: string, extra: Partial<ResearchItem> = {}): ResearchItem => ({
            id,
            created_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
            status: 'completed',
            title: `Note ${id}`,
            tickers: ['TEST'],
            user: { nickname: 'SwiftFalcon482' },
            user_id: 'someone-else',
            provider: 'gemini',
            models_used: ['gemini-3-pro-preview'],
            tokens_in: 12000,
            tokens_out: 2748,
            ...extra,
        });

        it('links a completed note to its page and shows readable metadata', () => {
            render(<ResearchFeed {...baseProps} isAnalyzing={false} research={[note('7')]} />);

            expect(screen.getByRole('link', { name: 'Note 7' })).toHaveAttribute('href', '/ticker/TEST/research/7');
            expect(screen.getByRole('img', { name: 'Completed' })).toBeInTheDocument();
            // Relative time, thousands separators — not "10/13/2026, 5:36:24 AM" / "14748".
            expect(screen.getByText('5h ago')).toBeInTheDocument();
            expect(screen.getByText('14,748 tokens')).toBeInTheDocument();
            expect(screen.getByText('gemini-3-pro-preview')).toBeInTheDocument();
        });

        it('does not link a note that is still running, and says so', () => {
            render(<ResearchFeed {...baseProps} isAnalyzing research={[note('8', { status: 'processing', title: 'Preparing research...', models_used: [] })]} />);

            expect(screen.queryByRole('link', { name: 'Preparing research...' })).toBeNull();
            expect(screen.getByText('Preparing research...')).toBeInTheDocument();
            expect(screen.getByRole('img', { name: 'In progress' })).toBeInTheDocument();
            expect(screen.getByText('Running')).toBeInTheDocument();
        });

        it('marks a failed note as failed in words, not only by colour', () => {
            render(<ResearchFeed {...baseProps} isAnalyzing={false} research={[note('9', { status: 'failed', models_used: [] })]} />);

            expect(screen.getByRole('img', { name: 'Failed' })).toBeInTheDocument();
            expect(screen.getByText('Failed')).toBeInTheDocument();
            // Still reachable: the note page explains what went wrong.
            expect(screen.getByRole('link', { name: 'Note 9' })).toBeInTheDocument();
        });

        it('gives the row actions accessible names', () => {
            const onDelete = vi.fn();
            render(<ResearchFeed {...baseProps} onDelete={onDelete} isAnalyzing={false} research={[note('7')]} />);

            // The mocked user is an admin, so both actions are offered.
            expect(screen.getByRole('button', { name: 'Rename "Note 7"' })).toBeInTheDocument();
            screen.getByRole('button', { name: 'Delete "Note 7"' }).click();
            expect(onDelete).toHaveBeenCalledWith('7');
        });
    });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FavoriteStar } from './FavoriteStar';
import { useFavorite } from '../../hooks/useWatchlist';

// Mock the hook
vi.mock('../../hooks/useWatchlist', () => ({
    useFavorite: vi.fn(),
}));

describe('FavoriteStar', () => {
    const mockToggle = vi.fn();
    const symbol = 'AAPL';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders correctly when not favorite', () => {
        vi.mocked(useFavorite).mockReturnValue({
            isFavorite: false,
            toggle: mockToggle,
            isLoading: false,
        });

        render(<FavoriteStar symbol={symbol} />);

        // Check if the star is rendered (using title as accessible name or just presence)
        // The component has title attribute
        const starContainer = screen.getByTitle('Add to favorites');
        expect(starContainer).toBeInTheDocument();
    });

    it('renders correctly when favorite', () => {
        vi.mocked(useFavorite).mockReturnValue({
            isFavorite: true,
            toggle: mockToggle,
            isLoading: false,
        });

        render(<FavoriteStar symbol={symbol} />);

        const starContainer = screen.getByTitle('Remove from favorites');
        expect(starContainer).toBeInTheDocument();
    });

    it('calls toggle when clicked', () => {
        vi.mocked(useFavorite).mockReturnValue({
            isFavorite: false,
            toggle: mockToggle,
            isLoading: false,
        });

        render(<FavoriteStar symbol={symbol} />);
        const starContainer = screen.getByTitle('Add to favorites');

        fireEvent.click(starContainer);
        expect(mockToggle).toHaveBeenCalledTimes(1);
    });

    it('applies custom className', () => {
        vi.mocked(useFavorite).mockReturnValue({
            isFavorite: false,
            toggle: mockToggle,
            isLoading: false,
        });

        render(<FavoriteStar symbol={symbol} className="custom-class" />);
        // We need to find the element and check class
        // The div wrapper has the class
        const container = screen.getByTitle('Add to favorites');
        expect(container).toHaveClass('custom-class');
    });
});

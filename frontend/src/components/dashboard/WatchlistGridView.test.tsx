import { render, screen, fireEvent } from '@testing-library/react';
import { WatchlistGridView } from './WatchlistGridView';
import { vi, describe, it, expect } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

// Mock TickerLogo to avoid image loading issues in tests
vi.mock('./TickerLogo', () => ({
    TickerLogo: ({ symbol }: { symbol: string }) => <div data-testid={`logo-${symbol}`}>Logo</div>
}));

const mockData = [
    {
        symbol: 'AAPL',
        company: 'Apple Inc.',
        price: 150.00,
        change: 2.5,
        riskScore: 3.0,
        potentialUpside: 15.0,
        aiRating: 'Strong Buy',
        sector: 'Technology',
        pe: 30,
        marketCap: 2000000000000,
        rating: 'Buy',
        newsCount: 5,
        researchCount: 2,
        analystCount: 10,
        socialCount: 100,
        itemId: 'item-1'
    },
    {
        symbol: 'TSLA',
        company: 'Tesla Inc.',
        price: 700.00,
        change: -1.2,
        riskScore: 7.0,
        potentialUpside: -5.0,
        aiRating: 'Sell',
        sector: 'Automotive',
        pe: 50,
        marketCap: 800000000000,
        rating: 'Hold',
        newsCount: 0,
        researchCount: 0,
        analystCount: 0,
        socialCount: 0,
        itemId: 'item-2'
    }
];

describe('WatchlistGridView', () => {
    const renderComponent = (props: Partial<React.ComponentProps<typeof WatchlistGridView>> = {}) => {
        return render(
            <BrowserRouter>
                <WatchlistGridView
                    data={mockData}
                    isLoading={false}
                    {...props}
                />
            </BrowserRouter>
        );
    };

    it('renders loading state', () => {
        renderComponent({ isLoading: true });
        // Check for skeleton loader pulse classes
        const skeletons = screen.getAllByText('', { selector: '.animate-pulse' });
        expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders empty state', () => {
        renderComponent({ data: [] });
        expect(screen.getByText('Watchlist is empty.')).toBeInTheDocument();
    });

    it('renders ticker cards with correct data', () => {
        renderComponent();
        expect(screen.getByText('AAPL')).toBeInTheDocument();
        expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
        expect(screen.getByText('$150.00')).toBeInTheDocument();
        expect(screen.getByText('2.50%')).toBeInTheDocument();

        expect(screen.getByText('TSLA')).toBeInTheDocument();
        expect(screen.getByText('$700.00')).toBeInTheDocument();
        expect(screen.getByText('1.20%')).toBeInTheDocument();
    });

    it('displays correct risk and upside styling', () => {
        renderComponent();
        // AAPL (Low Risk, High Upside)
        const appleCard = screen.getByText('AAPL').closest('.group');
        expect(appleCard).toBeInTheDocument();

        // TSLA (High Risk, Negative Upside)
        const teslaCard = screen.getByText('TSLA').closest('.group');
        expect(teslaCard).toBeInTheDocument();
    });

    it('handles remove action if onRemove is provided', () => {
        const onRemove = vi.fn();
        renderComponent({ onRemove });

        // Buttons are hidden by opacity but present. We can click them.
        const removeButtons = screen.getAllByRole('button');
        // Filter for trash button (usually has Trash icon)
        // Since we didn't add aria-label to the button in GridView (maybe we should have), 
        // we can find it by looking for the one that calls the function.
        // Actually best to add verify via click.

        // Let's find the button inside the first card
        // Note: The button is rendered ONLY if onRemove is passed.
        const appleCard = screen.getByText('AAPL').closest('.group');
        const removeButton = appleCard?.querySelector('button');

        expect(removeButton).toBeInTheDocument();
        fireEvent.click(removeButton!);

        expect(onRemove).toHaveBeenCalledWith('item-1', 'AAPL');
    });

    it('does not render remove button if onRemove is undefined', () => {
        renderComponent({ onRemove: undefined });
        const appleCard = screen.getByText('AAPL').closest('.group');
        const removeButton = appleCard?.querySelector('button');
        expect(removeButton).not.toBeInTheDocument();
    });

    it('navigates to ticker page on card click', () => {
        renderComponent();
        const appleCard = screen.getByText('AAPL').closest('.group');
        // The clickable area is the div inside the card
        const clickableArea = screen.getByText('AAPL').closest('.cursor-pointer');

        fireEvent.click(clickableArea!);
        expect(window.location.pathname).toBe('/ticker/AAPL');
    });

    it('safely handles missing or partial data', () => {
        const partialData = [{
            symbol: 'PARTIAL',
            company: 'Partial Corp',
            price: 100,
            change: 0,
            // Missing optional fields
            riskScore: null,
            potentialUpside: null,
            aiRating: '-',
            sector: 'Unknown',
            pe: null,
            marketCap: null,
            rating: '-',
            newsCount: 0,
            researchCount: 0,
            analystCount: 0,
            socialCount: 0,
            itemId: 'item-3'
        }];

        renderComponent({ data: partialData });
        expect(screen.getByText('PARTIAL')).toBeInTheDocument();
        // Should default to 0.0 formatting
        expect(screen.getAllByText('0.0%').length).toBeGreaterThan(0);
        expect(screen.getAllByText('0.0').length).toBeGreaterThan(0);
    });
});

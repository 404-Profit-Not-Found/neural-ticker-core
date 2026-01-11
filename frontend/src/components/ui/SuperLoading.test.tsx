import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SuperLoading } from './SuperLoading';

describe('SuperLoading Component', () => {
    it('renders without crashing', () => {
        render(<SuperLoading />);
        // Check for the "Neural Ticker" default text if no symbol is provided
        expect(screen.getByText('Neural Ticker')).toBeInTheDocument();
        // Check for the default loading text
        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('displays the provided symbol', () => {
        const testSymbol = 'NVDA';
        render(<SuperLoading symbol={testSymbol} />);
        expect(screen.getByText(testSymbol)).toBeInTheDocument();
    });

    it('displays custom loading text', () => {
        const customText = 'Initializing Neural Network...';
        render(<SuperLoading text={customText} />);
        expect(screen.getByText(customText)).toBeInTheDocument();
    });

    it('renders the chart visualization elements', () => {
        const { container } = render(<SuperLoading />);
        // Use a selector to check for the chart container styling
        // The chart-wrapper class is the container for our realistic CSS candlestick chart
        const chartWrapper = container.querySelector('.chart-wrapper');
        expect(chartWrapper).toBeInTheDocument();
        
        // Optionally check for at least one candle
        const candle = container.querySelector('.candle');
        expect(candle).toBeInTheDocument();
    });
});

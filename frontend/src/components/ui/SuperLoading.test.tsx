import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SuperLoading } from './SuperLoading';

describe('SuperLoading Component', () => {
    it('renders without crashing', () => {
        render(<SuperLoading />);
        // Check for the "SYSTEM" default text if no symbol is provided
        expect(screen.getByText('SYSTEM')).toBeInTheDocument();
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
        // The mask-linear-fade class is a key identifier for our chart background
        const chartBackground = container.querySelector('.mask-linear-fade');
        expect(chartBackground).toBeInTheDocument();
    });
});

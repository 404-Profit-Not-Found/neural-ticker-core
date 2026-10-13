import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SuperLoading } from './SuperLoading';

describe('SuperLoading', () => {
    it('shows the brand mark and name, the way the boot splash does', () => {
        const { container } = render(<SuperLoading />);
        // One word plus ".com" — never the old "Neural Ticker".
        expect(screen.getByText('NeuralTicker.com')).toBeInTheDocument();
        expect(screen.getByText('.com')).toBeInTheDocument();
        expect(screen.queryByText('Neural Ticker')).not.toBeInTheDocument();
        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining('favicon.svg'));
        expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    });

    it('names the ticker it is loading', () => {
        render(<SuperLoading symbol="NVDA" />);
        expect(screen.getByRole('status', { name: 'Loading NVDA' })).toBeInTheDocument();
        expect(screen.getByText('Loading NVDA')).toBeInTheDocument();
    });

    it('shows custom status text without a trailing ellipsis', () => {
        render(<SuperLoading text="Signing out..." />);
        expect(screen.getByText('Signing out')).toBeInTheDocument();
    });

    it('draws the candlestick chart of the boot splash', () => {
        const { container } = render(<SuperLoading />);
        const candles = container.querySelectorAll('.boot-chart .boot-candle');
        expect(candles).toHaveLength(11);
        // Decoration: not announced.
        expect(container.querySelector('.boot-chart')).toHaveAttribute('aria-hidden', 'true');
    });

    it('shows the ticker in place of the wordmark while a ticker opens', () => {
        const { container } = render(<SuperLoading symbol="NVDA" />);
        expect(container.querySelector('.boot-brand--symbol')).toHaveTextContent('NVDA');
        expect(screen.queryByText('NeuralTicker.com')).not.toBeInTheDocument();
    });
});

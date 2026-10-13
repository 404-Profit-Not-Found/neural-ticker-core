import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SentimentGauge } from './SentimentGauge';

describe('SentimentGauge', () => {
  it('shows the score out of 100 with its label', () => {
    render(<SentimentGauge score={0.81} label="Bullish" />);
    expect(screen.getByText('81')).toBeInTheDocument();
    expect(screen.getByText('/100')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sentiment score 81 out of 100, Bullish' })).toBeInTheDocument();
  });

  it('colours the stamp by the label it prints, not by score thresholds', () => {
    // A "Bullish" label on a low score used to be rendered red.
    const { unmount } = render(<SentimentGauge score={0.38} label="Bullish" />);
    expect(screen.getByText('Bullish')).toHaveClass('text-up');
    unmount();

    const bearish = render(<SentimentGauge score={0.7} label="Bearish" />);
    expect(screen.getByText('Bearish')).toHaveClass('text-down');
    bearish.unmount();

    render(<SentimentGauge score={0.5} label="Neutral" />);
    expect(screen.getByText('Neutral').className).toContain('yellow');
  });

  it('falls back to the score bands for a label it does not recognise', () => {
    const { unmount } = render(<SentimentGauge score={0.9} label="Euphoric" />);
    expect(screen.getByText('Euphoric')).toHaveClass('text-up');
    unmount();
    render(<SentimentGauge score={0.1} label="Capitulation" />);
    expect(screen.getByText('Capitulation')).toHaveClass('text-down');
  });

  it('accepts the numeric string the API sends and clamps out-of-range scores', () => {
    const { unmount } = render(<SentimentGauge score={'0.81' as unknown as number} label="Bullish" />);
    expect(screen.getByText('81')).toBeInTheDocument();
    unmount();
    render(<SentimentGauge score={1.7} label="Bullish" />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});

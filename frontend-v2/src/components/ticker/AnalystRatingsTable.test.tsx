import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AnalystRatingsTable, type AnalystRatingRow } from './AnalystRatingsTable';

const rating = (i: number, extra: Partial<AnalystRatingRow> = {}): AnalystRatingRow => ({
  id: String(i),
  firm: `Firm ${i}`,
  analyst_name: `Analyst ${i}`,
  rating: 'Buy',
  price_target: 150 + i,
  rating_date: '2025-07-18T00:00:00Z',
  ...extra,
});

describe('AnalystRatingsTable', () => {
  it('renders nothing without ratings', () => {
    const { container } = render(<AnalystRatingsTable ratings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows firm, analyst, date, stance and target', () => {
    render(<AnalystRatingsTable ratings={[rating(1)]} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Firm 1')).toBeInTheDocument();
    expect(within(row).getByText(/Analyst 1/)).toBeInTheDocument();
    expect(within(row).getByText('18 Jul 2025')).toBeInTheDocument();
    expect(within(row).getByText('Buy')).toHaveAttribute('data-stance', 'buy');
    expect(within(row).getByText('$151.00')).toBeInTheDocument();
  });

  it('normalises rating wording and colours it by stance', () => {
    render(
      <AnalystRatingsTable
        ratings={[
          rating(1, { rating: 'Outperform' }),
          rating(2, { rating: 'Underperform' }),
          rating(3, { rating: 'Neutral' }),
          rating(4, { rating: 'Strong Buy' }),
        ]}
      />,
    );
    expect(screen.getByText('Sell')).toHaveAttribute('data-stance', 'sell');
    expect(screen.getByText('Hold')).toHaveAttribute('data-stance', 'hold');
    expect(screen.getByText('Strong Buy')).toHaveAttribute('data-stance', 'buy');
    // 'Outperform' reads as a plain Buy.
    expect(screen.getByText('Buy')).toHaveAttribute('data-stance', 'buy');
  });

  it('prints an em dash for a missing target and keeps sub-dollar precision', () => {
    render(
      <AnalystRatingsTable
        ratings={[rating(1, { price_target: null }), rating(2, { price_target: 0.1834 })]}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText('—')).toBeInTheDocument();
    expect(within(rows[0]).queryByText('-')).toBeNull();
    expect(within(rows[1]).getByText('$0.1834')).toBeInTheDocument();
  });

  it('uses the instrument currency', () => {
    render(<AnalystRatingsTable ratings={[rating(1, { price_target: 800 })]} currency="EUR" />);
    expect(screen.getByText('€800.00')).toBeInTheDocument();
  });

  it('collapses long lists behind "Show all"', () => {
    render(<AnalystRatingsTable ratings={Array.from({ length: 9 }, (_, i) => rating(i + 1))} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);

    const toggle = screen.getByRole('button', { name: 'Show all 9 ratings' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(screen.getAllByRole('listitem')).toHaveLength(9);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('has no toggle when everything fits', () => {
    render(<AnalystRatingsTable ratings={[rating(1), rating(2)]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

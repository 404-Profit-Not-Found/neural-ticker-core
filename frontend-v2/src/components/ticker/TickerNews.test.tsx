import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TickerNews } from './TickerNews';
import type { NewsItem } from '../../types/ticker';

const secondsAgo = (s: number) => Math.floor(Date.now() / 1000) - s;
const item = (i: number, ageSeconds: number): NewsItem => ({
  id: String(i),
  url: `https://example.com/${i}`,
  source: 'Reuters',
  datetime: secondsAgo(ageSeconds),
  headline: `Headline ${i}`,
});

describe('TickerNews', () => {
  it('shows an explicit empty state', () => {
    render(<TickerNews news={[]} />);
    expect(screen.getByText('No recent news')).toBeInTheDocument();
  });

  it('lists the newest stories first, as external links with relative times', () => {
    render(<TickerNews news={[item(1, 8 * 3600), item(2, 3600), item(3, 86400 * 2)]} />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => within(l).getByText(/Headline/).textContent)).toEqual(['Headline 2', 'Headline 1', 'Headline 3']);
    expect(links[0]).toHaveAttribute('href', 'https://example.com/2');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(links[0]).getByText('1h ago')).toBeInTheDocument();
    expect(within(links[2]).getByText('2d ago')).toBeInTheDocument();
  });

  it('lets a headline wrap on phones instead of cutting it to one line', () => {
    render(<TickerNews news={[item(1, 60)]} />);
    const headline = screen.getByText('Headline 1');
    expect(headline.className).toContain('line-clamp-2');
    expect(headline.className).toContain('sm:line-clamp-1');
  });

  it('shows a few stories and expands on request, up to the cap', () => {
    render(<TickerNews news={Array.from({ length: 14 }, (_, i) => item(i + 1, (i + 1) * 600))} />);
    expect(screen.getAllByRole('link')).toHaveLength(4);

    const more = screen.getByRole('button', { name: 'Show 6 more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);

    expect(screen.getAllByRole('link')).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('has no toggle when everything fits', () => {
    render(<TickerNews news={[item(1, 60), item(2, 120)]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

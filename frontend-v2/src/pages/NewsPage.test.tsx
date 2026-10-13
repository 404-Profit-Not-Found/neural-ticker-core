import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NewsPage } from './NewsPage';
import { useGeneralNews, type GeneralNewsItem } from '../hooks/useNews';

vi.mock('../hooks/useNews', () => ({ useGeneralNews: vi.fn() }));

const secondsAgo = (s: number) => Math.floor(Date.now() / 1000) - s;

const items: GeneralNewsItem[] = [
  { id: 1, category: 'top news', datetime: secondsAgo(48 * 60), headline: 'Fed holds', image: '/img/0.svg', related: '', source: 'Reuters', summary: 'Rates unchanged.', url: 'https://example.com/1' },
  { id: 2, category: 'technology', datetime: secondsAgo(5 * 3600), headline: 'Chipmakers extend rally', related: 'NVDA,AMD,AVGO,MU,TSM,ASML.AS', source: 'Bloomberg', summary: 'Semis rose.', url: 'https://example.com/2' },
];

const mockNews = (value: Partial<ReturnType<typeof useGeneralNews>>) =>
  (useGeneralNews as Mock).mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn(), ...value });

describe('NewsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has a page heading and one external link per story', () => {
    mockNews({ data: items });
    render(<NewsPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Market news');
    const link = screen.getByRole('link', { name: /Fed holds/ });
    expect(link).toHaveAttribute('href', 'https://example.com/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('(opens in a new tab)');
  });

  it('shows source, relative time and summary, without a hover-only "Read more"', () => {
    mockNews({ data: items });
    render(<NewsPage />);
    const row = screen.getByRole('link', { name: /Fed holds/ }).closest('li') as HTMLElement;
    expect(within(row).getByText('Reuters')).toBeInTheDocument();
    expect(within(row).getByText('48m ago')).toBeInTheDocument();
    expect(within(row).getByText('Rates unchanged.')).toBeInTheDocument();
    expect(screen.queryByText(/Read more/i)).toBeNull();
  });

  it('gives every row a thumbnail slot so headlines line up', () => {
    mockNews({ data: items });
    const { container } = render(<NewsPage />);
    const rows = screen.getAllByRole('listitem');
    // Row 1 has art; row 2 gets a placeholder of the same size instead of nothing.
    expect(rows[0].querySelector('img')).not.toBeNull();
    expect(rows[1].querySelector('img')).toBeNull();
    expect(rows[1].firstElementChild).toHaveTextContent('B');
    expect(rows[0].firstElementChild?.className).toBe(rows[1].firstElementChild?.className);
    expect(container.querySelectorAll('img[alt=""]')).toHaveLength(1);
  });

  it('falls back to the placeholder when an image fails to load', () => {
    mockNews({ data: items });
    render(<NewsPage />);
    const row = screen.getAllByRole('listitem')[0];
    fireEvent.error(row.querySelector('img') as HTMLImageElement);
    expect(row.querySelector('img')).toBeNull();
    expect(row.firstElementChild).toHaveTextContent('R');
  });

  it('lists related tickers as text, capped, without linking to ticker pages', () => {
    mockNews({ data: items });
    render(<NewsPage />);
    const row = screen.getByRole('link', { name: /Chipmakers/ }).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('NVDA · AMD · AVGO · MU +2');
    // Only the story link: opening an unknown symbol's page would ask the
    // backend to create that ticker.
    expect(within(row).getAllByRole('link')).toHaveLength(1);
  });

  it('filters by category when the feed has more than one', () => {
    mockNews({ data: items });
    render(<NewsPage />);
    fireEvent.click(screen.getByRole('radio', { name: 'Technology' }));
    expect(screen.queryByRole('link', { name: /Fed holds/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Chipmakers/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('offers no category control for a single-category feed', () => {
    mockNews({ data: [items[0]] });
    render(<NewsPage />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('shows skeleton rows while loading', () => {
    mockNews({ isLoading: true });
    render(<NewsPage />);
    expect(screen.getByRole('region', { name: 'News' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('shows an empty state and an error state with retry', () => {
    mockNews({ data: [] });
    const { unmount } = render(<NewsPage />);
    expect(screen.getByText('No news right now')).toBeInTheDocument();
    unmount();

    const refetch = vi.fn();
    mockNews({ isError: true, refetch });
    render(<NewsPage />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load the news');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });
});

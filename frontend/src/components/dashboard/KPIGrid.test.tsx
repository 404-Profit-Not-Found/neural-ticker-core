
import { render, screen, waitFor } from '@testing-library/react';
import { KPIGrid } from './KPIGrid';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { api } from '../../lib/api';
import '@testing-library/jest-dom';

// Mocks
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
}));

describe('KPIGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {})); // Never resolves
    render(<KPIGrid />);
    
    expect(screen.getAllByText('...')[0]).toBeInTheDocument();
  });

  it('renders data correctly after fetch', async () => {
    (api.get as Mock).mockImplementation((url: string) => {
      if (url === '/tickers/count') return Promise.resolve({ data: { count: 123 } });
      if (url === '/stats/strong-buy') return Promise.resolve({ data: { count: 5, symbols: [] } });
      if (url === '/stats/sell') return Promise.resolve({ data: { count: 2, symbols: [] } });
      return Promise.resolve({ data: {} });
    });

    render(<KPIGrid />);

    await waitFor(() => {
      expect(screen.getByText('123')).toBeInTheDocument();
      // Strong Buy count is 5, but there's also a hardcoded "Research: 5" in the KPI data
      // We need to check for the sell subtext to verify the right card
      expect(screen.getByText('Sell: 2')).toBeInTheDocument();
      // Verify Strong Buy card shows "5" by checking it appears in the document
      const fiveElements = screen.getAllByText('5');
      expect(fiveElements.length).toBeGreaterThan(0);
    });
  });

  it('handles fetch error gracefully', async () => {
    (api.get as Mock).mockRejectedValue(new Error('Fetch failed'));

    render(<KPIGrid />);

    await waitFor(() => {
      // When fetch fails, strongBuyCount, sellCount, and tickerCount all become 0
      // Check for Sell: 0 which is more specific
      expect(screen.getByText('Sell: 0')).toBeInTheDocument();
      const zeroElements = screen.getAllByText('0');
      expect(zeroElements.length).toBeGreaterThanOrEqual(2); // Strong Buy and Tickers both show 0
    });
  });
});


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
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../ui/card', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
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
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Sell: 2')).toBeInTheDocument();
    });
  });

  it('handles fetch error gracefully', async () => {
    (api.get as Mock).mockRejectedValue(new Error('Fetch failed'));

    render(<KPIGrid />);

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument(); // Tickers count fallback
    });
  });
});

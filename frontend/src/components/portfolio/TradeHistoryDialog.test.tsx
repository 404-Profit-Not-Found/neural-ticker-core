import { render, screen, waitFor } from '@testing-library/react';
import { TradeHistoryDialog } from './TradeHistoryDialog';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { api } from '../../lib/api';
import '@testing-library/jest-dom';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn() },
  cn: (...args: (string | undefined | null | false)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  History: () => <span>H</span>,
  Loader2: () => <span>L</span>,
  ArrowDownToLine: () => <span>↓</span>,
  ArrowUpFromLine: () => <span>↑</span>,
  Inbox: () => <span>I</span>,
}));

vi.mock('../ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

const buyTrade = {
  id: 't1',
  symbol: 'AAPL',
  side: 'buy' as const,
  shares: '10',
  price: '150',
  total_value: '1500',
  fees: '0',
  realized_pnl: null,
  currency: 'USD',
  trade_date: '2024-01-02',
  source: 'manual',
};

const sellTrade = {
  id: 't2',
  symbol: 'AAPL',
  side: 'sell' as const,
  shares: '5',
  price: '200',
  total_value: '1000',
  fees: '0',
  realized_pnl: '250',
  currency: 'USD',
  trade_date: '2024-03-04',
  source: 'mcp',
};

describe('TradeHistoryDialog', () => {
  const onOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state when there are no trades', async () => {
    (api.get as Mock).mockResolvedValue({ data: [] });
    render(<TradeHistoryDialog open={true} onOpenChange={onOpenChange} />);
    expect(await screen.findByText(/No trades yet/i)).toBeInTheDocument();
  });

  it('renders buy and sell rows with realized P&L', async () => {
    (api.get as Mock).mockResolvedValue({ data: [sellTrade, buyTrade] });
    render(<TradeHistoryDialog open={true} onOpenChange={onOpenChange} />);

    expect(await screen.findByText('BUY')).toBeInTheDocument();
    expect(screen.getByText('SELL')).toBeInTheDocument();
    // Realized P&L for the sell is coerced from the "250" string and shown positive.
    expect(screen.getByText(/\+\$250\.00/)).toBeInTheDocument();
    expect(screen.getAllByText('AAPL').length).toBe(2);
  });

  it('passes the symbol filter to the API and title', async () => {
    (api.get as Mock).mockResolvedValue({ data: [] });
    render(<TradeHistoryDialog open={true} onOpenChange={onOpenChange} symbol="AAPL" />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/portfolio/trades', {
        params: { symbol: 'AAPL', limit: 200 },
      });
    });
    expect(screen.getByText(/Trade History — AAPL/)).toBeInTheDocument();
  });

  it('shows an error message when the request fails', async () => {
    (api.get as Mock).mockRejectedValue(new Error('boom'));
    render(<TradeHistoryDialog open={true} onOpenChange={onOpenChange} />);
    expect(await screen.findByText(/Failed to load trade history/i)).toBeInTheDocument();
  });
});

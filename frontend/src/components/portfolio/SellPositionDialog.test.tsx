import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SellPositionDialog } from './SellPositionDialog';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { api } from '../../lib/api';
import '@testing-library/jest-dom';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  cn: (...args: (string | undefined | null | false)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('lucide-react', () => ({
  TrendingDown: () => <span>TD</span>,
  Calendar: () => <span>Cal</span>,
  Loader2: () => <span>L</span>,
  AlertCircle: () => <span>!</span>,
  AlertTriangle: () => <span>⚠</span>,
  Hash: () => <span>#</span>,
  Coins: () => <span>¢</span>,
}));

vi.mock('../ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('../ui/button', () => ({
  Button: ({
    children,
    onClick,
    type,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
  }) => (
    <button onClick={onClick} type={type} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('../ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('../ui/label', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

vi.mock('../ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../ui/simple-calendar', () => ({
  SimpleCalendar: () => <div data-testid="calendar" />,
}));

vi.mock('./PriceRangeSlider', () => ({
  PriceRangeSlider: ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div data-testid="price-slider" onClick={() => onChange(160)}>
      Slider {value}
    </div>
  ),
}));

vi.mock('../ui/Sparkline', () => ({
  Sparkline: () => <div data-testid="sparkline" />,
}));

vi.mock('../dashboard/TickerLogo', () => ({
  TickerLogo: () => <div data-testid="ticker-logo" />,
}));

describe('SellPositionDialog', () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  const position = {
    id: 'p1',
    symbol: 'AAPL',
    shares: 10,
    buy_price: 100,
    current_price: 150,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as Mock).mockImplementation((url: string) => {
      if (url.includes('/snapshot'))
        return Promise.resolve({ data: { price: 150, ticker: { name: 'Apple Inc' } } });
      if (url.includes('/history')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  it('renders the position summary when open', async () => {
    render(
      <SellPositionDialog
        open={true}
        onOpenChange={onOpenChange}
        position={position}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.getByText('Sell Position')).toBeInTheDocument();
    expect(await screen.findByText('Apple Inc')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MAX 10/i })).toBeInTheDocument();
  });

  it('previews realized P&L from native cost basis', async () => {
    render(
      <SellPositionDialog
        open={true}
        onOpenChange={onOpenChange}
        position={position}
        onSuccess={onSuccess}
      />,
    );
    // 10 sh × $150 proceeds − 10 × $100 cost basis = +$500 realized.
    expect(await screen.findByText(/\$500\.00/)).toBeInTheDocument();
  });

  it('submits the sale to the backend', async () => {
    (api.post as Mock).mockResolvedValue({
      data: { realized_pnl: 500, proceeds: 1500, cash_balance: { currency: 'USD', amount: 1500 } },
    });
    const { container } = render(
      <SellPositionDialog
        open={true}
        onOpenChange={onOpenChange}
        position={position}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/portfolio/positions/p1/sell',
        expect.objectContaining({ shares: 10, price: 150 }),
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('blocks selling more shares than held', () => {
    const { container } = render(
      <SellPositionDialog
        open={true}
        onOpenChange={onOpenChange}
        position={position}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Shares to Sell/i), { target: { value: '20' } });

    expect(screen.getByText(/Only 10 held/i)).toBeInTheDocument();
    expect(container.querySelector('button[type="submit"]')).toBeDisabled();
  });
});

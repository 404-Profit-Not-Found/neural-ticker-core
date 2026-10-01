import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CashDialog } from './CashDialog';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { api } from '../../lib/api';
import '@testing-library/jest-dom';

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('lucide-react', () => ({
  Wallet: () => <span>W</span>,
  Loader2: () => <span>L</span>,
  AlertCircle: () => <span>!</span>,
  ArrowDownToLine: () => <span>↓</span>,
  ArrowUpFromLine: () => <span>↑</span>,
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

vi.mock('../ui/tabs', () => ({
  Tabs: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => (
    <div data-testid="tabs">
      <button data-testid="to-deposit" onClick={() => onValueChange('deposit')}>
        to-deposit
      </button>
      <button data-testid="to-withdraw" onClick={() => onValueChange('withdraw')}>
        to-withdraw
      </button>
      {children}
    </div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode; value: string }) => (
    <button>{children}</button>
  ),
}));

vi.mock('../ui/select-native', () => ({
  NativeSelect: ({
    children,
    value,
    onChange,
  }: {
    children: React.ReactNode;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  }) => (
    <select data-testid="currency-select" value={value} onChange={onChange}>
      {children}
    </select>
  ),
}));

describe('CashDialog', () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(
      <CashDialog open={false} onOpenChange={onOpenChange} balances={[]} onSuccess={onSuccess} />,
    );
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('renders balances and title when open', () => {
    render(
      <CashDialog
        open={true}
        onOpenChange={onOpenChange}
        balances={[{ currency: 'USD', amount: 1000 }]}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.getByText('Manage Cash')).toBeInTheDocument();
    // Balance chip + the "USD balance" line both show the formatted amount.
    expect(screen.getAllByText(/\$1,000\.00/).length).toBeGreaterThan(0);
  });

  it('submits a deposit to the backend', async () => {
    (api.post as Mock).mockResolvedValue({ data: { currency: 'USD', amount: 1500 } });
    const { container } = render(
      <CashDialog
        open={true}
        onOpenChange={onOpenChange}
        balances={[{ currency: 'USD', amount: 1000 }]}
        defaultCurrency="USD"
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/portfolio/cash/deposit', {
        amount: 500,
        currency: 'USD',
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('blocks an overdraw withdrawal', () => {
    const { container } = render(
      <CashDialog
        open={true}
        onOpenChange={onOpenChange}
        balances={[{ currency: 'USD', amount: 100 }]}
        defaultCurrency="USD"
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByTestId('to-withdraw'));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });

    expect(screen.getByText(/exceeds your USD balance/i)).toBeInTheDocument();
    expect(container.querySelector('button[type="submit"]')).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
});


import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditPositionDialog } from './EditPositionDialog';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { api } from '../../lib/api';
import '@testing-library/jest-dom';

// Mocks
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  cn: (...args: (string | undefined | null | false)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('lucide-react', () => ({
  Plus: () => <div data-testid="icon-plus" />,
  Calendar: () => <div data-testid="icon-calendar" />,
  Search: () => <div data-testid="icon-search" />,
  Loader2: () => <div data-testid="icon-loader" />,
  Info: () => <div data-testid="icon-info" />,
  AlertCircle: () => <div data-testid="icon-alert" />,
  DollarSign: () => <div data-testid="icon-dollar" />,
  Hash: () => <div data-testid="icon-hash" />,
  Save: () => <div data-testid="icon-save" />,
  Trash2: () => <div data-testid="icon-trash" />,
  AlertTriangle: () => <div data-testid="icon-alert-triangle" />,
}));

vi.mock('../ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../ui/tabs', () => ({
  Tabs: ({ children, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (val: string) => void }) => (
    <div data-testid="tabs" onClick={() => onValueChange?.('shares')}>{children}</div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode; value: string }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode; value: string }) => <div>{children}</div>,
}));

vi.mock('../ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div data-testid="popover-content">{children}</div>,
}));

vi.mock('../ui/simple-calendar', () => ({
  SimpleCalendar: () => <div data-testid="calendar" />,
}));

vi.mock('./PriceRangeSlider', () => ({
  PriceRangeSlider: ({ value, onChange }: { value: number; onChange: (fullVal: number) => void }) => (
    <div data-testid="price-slider">
      <span>Value: {value}</span>
      <button onClick={() => onChange(155)}>Set Price</button>
    </div>
  ),
}));

vi.mock('../ui/button', () => ({
  Button: ({ children, onClick, type, disabled }: { children: React.ReactNode; onClick?: () => void; type?: "button" | "submit" | "reset"; disabled?: boolean }) => (
    <button onClick={onClick} type={type} disabled={disabled}>{children}</button>
  ),
}));

vi.mock('../ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('../ui/label', () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock('../ui/Sparkline', () => ({
  Sparkline: () => <div data-testid="sparkline">Sparkline</div>,
}));

vi.mock('../dashboard/TickerLogo', () => ({
  TickerLogo: () => <div data-testid="ticker-logo">Logo</div>,
}));

describe('EditPositionDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockPosition = {
    id: '1',
    symbol: 'AAPL',
    shares: 10,
    buy_price: 150,
    buy_date: '2023-01-01',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as Mock).mockImplementation((url: string) => {
      if (url.includes('/snapshot')) return Promise.resolve({ data: { latestPrice: { close: 150 }, ticker: { name: 'Apple Inc' } } });
      if (url.includes('/history')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  it('renders with position data when open', async () => {
    render(
      <EditPositionDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        position={mockPosition}
        onSuccess={mockOnSuccess}
      />
    );
    
    expect(await screen.findByText(/Manage Position/i)).toBeInTheDocument();
    // Use findByText to wait for the snapshot and price info
    expect(await screen.findByText('AAPL')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('10.0000')).toBeInTheDocument();
  });

  it('handles patch submission', async () => {
    (api.patch as Mock).mockResolvedValue({});
    render(
      <EditPositionDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        position={mockPosition}
        onSuccess={mockOnSuccess}
      />
    );
    
    // Switch to shares mode to allow editing shares without overwriting
    const tabs = screen.getByTestId('tabs');
    fireEvent.click(tabs);

    // Use findBy to wait for initial value from useEffect
    const sharesInput = await screen.findByDisplayValue('10.0000');
    fireEvent.change(sharesInput, { target: { value: '12' } });
    
    const saveBtn = screen.getByText(/Save Changes/i);
    fireEvent.click(saveBtn);
    
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/portfolio/positions/1', expect.objectContaining({
        shares: 12,
      }));
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('shows delete confirmation and handles deletion', async () => {
    (api.delete as Mock).mockResolvedValue({});
    render(
      <EditPositionDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        position={mockPosition}
        onSuccess={mockOnSuccess}
      />
    );
    
    const deleteBtn = screen.getByText(/Delete Position/i);
    fireEvent.click(deleteBtn);
    
    expect(await screen.findByText(/Delete Position\?/i)).toBeInTheDocument();
    
    const confirmDeleteBtn = screen.getByRole('button', { name: /^Delete$/i });
    fireEvent.click(confirmDeleteBtn);
    
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/portfolio/positions/1');
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });
});

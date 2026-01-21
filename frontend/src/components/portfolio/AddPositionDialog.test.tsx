
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddPositionDialog } from './AddPositionDialog';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { api } from '../../lib/api';
import '@testing-library/jest-dom';

// Mocks
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Plus: () => <span data-testid="plus-icon">+</span>,
  Search: () => <span>S</span>,
  Bot: () => <span>B</span>,
  Calendar: () => <span>C</span>,
  ChevronRight: () => <span>{'>'}</span>,
  PieChart: () => <span>P</span>,
  TrendingUp: () => <span>U</span>,
  X: () => <span>X</span>,
  Info: () => <span>I</span>,
  Loader2: () => <span>L</span>,
  DollarSign: () => <span>$</span>,
  Hash: () => <span>#</span>,
  AlertCircle: () => <span>!</span>,
}));

vi.mock('../dashboard/TickerLogo', () => ({
  TickerLogo: () => <div data-testid="ticker-logo">Logo</div>,
}));

vi.mock('./PriceRangeSlider', () => ({
  PriceRangeSlider: ({ onChange, value }: any) => (
    <div data-testid="price-slider" onClick={() => onChange(155)}>
      Slider {value ? `$${value.toFixed(2)}` : ''}
    </div>
  ),
}));

vi.mock('../ui/simple-calendar', () => ({
  SimpleCalendar: ({ onChange }: any) => <div data-testid="calendar" onClick={() => onChange(new Date())}>Calendar</div>,
}));

vi.mock('../ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../ui/popover', () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div data-testid="popover-content">{children}</div>,
}));

vi.mock('../ui/tabs', () => ({
  Tabs: ({ children }: any) => <div data-testid="tabs">{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: any) => <button data-testid={`tabs-trigger-${value}`}>{children}</button>,
  TabsContent: ({ children, value }: any) => <div data-testid={`tabs-content-${value}`}>{children}</div>,
}));

vi.mock('../ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('../ui/label', () => ({
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock('../ui/button', () => ({
  Button: ({ children, onClick, type, disabled }: any) => (
    <button onClick={onClick} type={type} disabled={disabled}>{children}</button>
  ),
}));

describe('AddPositionDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSuccess = vi.fn();
  const today = new Date().toISOString().split('T')[0];

  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as Mock).mockResolvedValue({ data: [] });
  });

  it('does not render when closed', () => {
    render(<AddPositionDialog open={false} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('renders correctly when open', () => {
    render(<AddPositionDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />);
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    // Use getAllByText for "Add Position" since it appears in both title and button
    const titles = screen.getAllByText(/Add Position/i);
    expect(titles.length).toBeGreaterThan(0);
  });

  it('handles ticker search and selection', async () => {
    (api.get as Mock).mockResolvedValue({
      data: [{ symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ', logo_url: 'logo.png' }],
    });

    render(<AddPositionDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />);
    
    const input = screen.getByPlaceholderText(/search symbol/i);
    fireEvent.change(input, { target: { value: 'AAPL' } });

    await waitFor(() => {
      expect(screen.getByText('Apple')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Apple'));
    expect(input).toHaveValue('AAPL');
  });

  it('updates price via slider when data is available', async () => {
    (api.get as Mock).mockImplementation((url: string) => {
        if (url.includes('/history')) return Promise.resolve({ data: [{ date: today, close: 150, high: 160, low: 140, median: 150 }] });
        if (url.includes('/snapshot')) return Promise.resolve({ data: { latestPrice: { close: 150 } } });
        if (url.includes('/tickers')) return Promise.resolve({ data: [{ symbol: 'AAPL', name: 'Apple Inc', logo_url: 'logo.png' }] });
        return Promise.resolve({ data: [] });
    });

    render(<AddPositionDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />);
    
    // Select ticker
    const input = screen.getByPlaceholderText(/search symbol/i);
    fireEvent.change(input, { target: { value: 'AAPL' } });
    await waitFor(() => screen.getByText('Apple Inc'));
    fireEvent.click(screen.getByText('Apple Inc'));

    await waitFor(() => {
        expect(screen.getByTestId('price-slider')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('price-slider'));
    // Slider mock calls onChange(155)
    await waitFor(() => {
        expect(screen.getByText(/\$155\.00/)).toBeInTheDocument();
    });
  });

  it('handles form submission', async () => {
    (api.post as Mock).mockResolvedValue({});
    (api.get as Mock).mockImplementation((url: string) => {
        if (url.includes('/tickers')) return Promise.resolve({ data: [{ symbol: 'AAPL', name: 'Apple Inc', logo_url: 'logo.png' }] });
        if (url.includes('/history')) return Promise.resolve({ data: [{ date: today, close: 100, high: 110, low: 90, median: 100 }] });
        if (url.includes('/snapshot')) return Promise.resolve({ data: { latestPrice: { close: 100 } } });
        return Promise.resolve({ data: [] });
    });
    
    render(<AddPositionDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />);
    
    // Select ticker
    fireEvent.change(screen.getByPlaceholderText(/search symbol/i), { target: { value: 'AAPL' } });
    await waitFor(() => screen.getByText('Apple Inc'));
    fireEvent.click(screen.getByText('Apple Inc'));

    // Find investment input by label linked via htmlFor
    const investmentInput = screen.getByLabelText(/Investment Amount/i);
    fireEvent.change(investmentInput, { target: { value: '1000' } });
    
    // Price should be auto-set to 100 from history
    await waitFor(() => {
        // We can check if share calc updated or just proceed
        // With price 100, 1000 investment -> 10 shares
        expect(screen.getByText('10.0000')).toBeInTheDocument(); 
    });
    
    const submitButton = screen.getByText(/Add AAPL/i);
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/portfolio/positions', expect.objectContaining({
        symbol: 'AAPL',
        shares: 10,
        buy_price: 100,
      }));
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });
});

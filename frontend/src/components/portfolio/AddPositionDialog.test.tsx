
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

vi.mock('../dashboard/TickerLogo', () => ({
  TickerLogo: () => <div data-testid="ticker-logo">Logo</div>,
}));

vi.mock('./PriceRangeSlider', () => ({
  PriceRangeSlider: ({ onChange }: any) => <div data-testid="price-slider" onClick={() => onChange(155)}>Slider</div>,
}));

vi.mock('../ui/simple-calendar', () => ({
  SimpleCalendar: ({ onDateSelect }: any) => <div data-testid="calendar" onClick={() => onDateSelect('2023-01-01')}>Calendar</div>,
}));

vi.mock('../ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../ui/popover', () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div data-testid="popover-content">{children}</div>,
}));

describe('AddPositionDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(<AddPositionDialog open={false} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('renders correctly when open', () => {
    render(<AddPositionDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />);
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add Position')).toBeInTheDocument();
  });

  it('handles ticker search and selection', async () => {
    (api.get as Mock).mockResolvedValue({
      data: [{ symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ' }],
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
        if (url.includes('/history')) return Promise.resolve({ data: [{ time: '2023-01-01', close: 150, high: 160, low: 140 }] });
        if (url.includes('/snapshot')) return Promise.resolve({ data: { latestPrice: { close: 150 } } });
        return Promise.resolve({ data: [] });
    });

    render(<AddPositionDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />);
    
    // Select a ticker first to trigger history fetch
    fireEvent.change(screen.getByPlaceholderText(/search symbol/i), { target: { value: 'AAPL' } });
    (api.get as Mock).mockResolvedValueOnce({ data: [{ symbol: 'AAPL' }] }); // for search
    
    await waitFor(() => {
        expect(screen.getByTestId('price-slider')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('price-slider'));
    // The mocked slider calls onChange(155)
    expect(screen.getByDisplayValue('155.00')).toBeInTheDocument();
  });

  it('calculates shares from investment and price', () => {
    render(<AddPositionDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />);
    
    const priceInput = screen.getByLabelText('Share Price');
    const investmentInput = screen.getByPlaceholderText('0.00', { exact: false }); // There are two, usually index based or specific label
    const inputs = screen.getAllByPlaceholderText('0.00');
    const investInput = inputs[1]; // Investment is second in the grid
    
    fireEvent.change(priceInput, { target: { value: '100' } });
    fireEvent.change(investInput, { target: { value: '1000' } });
    
    const sharesInput = inputs[2]; // Shares is third
    expect(sharesInput).toHaveValue(10);
  });

  it('handles form submission', async () => {
    (api.post as Mock).mockResolvedValue({});
    
    render(<AddPositionDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />);
    
    // Manually set required fields
    fireEvent.change(screen.getByPlaceholderText(/search symbol/i), { target: { value: 'AAPL' } });
    // Need to select it from list to set 'symbol' state properly in real app, 
    // but here we just need to satisfy the disabled condition if we can.
    // Actually the button is disabled if `!symbol`. In my test I should trigger the selection.
    
    (api.get as Mock).mockResolvedValue({ data: [{ symbol: 'AAPL' }] });
    fireEvent.change(screen.getByPlaceholderText(/search symbol/i), { target: { value: 'A' } });
    await waitFor(() => screen.getByText('AAPL'));
    fireEvent.click(screen.getByText('AAPL'));

    const inputs = screen.getAllByPlaceholderText('0.00');
    fireEvent.change(screen.getByLabelText('Share Price'), { target: { value: '100' } });
    fireEvent.change(inputs[1], { target: { value: '1000' } }); // Investment
    
    const submitButton = screen.getByText(/Add AAPL Position/i);
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/portfolio/positions', expect.objectContaining({
        symbol: 'AAPL',
        shares: 10,
        buy_price: 100,
      }));
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

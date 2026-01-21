
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditPositionDialog } from './EditPositionDialog';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { api } from '../../lib/api';
import '@testing-library/jest-dom';

// Mocks
vi.mock('../../lib/api', () => ({
  api: {
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
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
  });

  it('renders with position data when open', () => {
    render(
      <EditPositionDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        position={mockPosition}
        onSuccess={mockOnSuccess}
      />
    );
    
    expect(screen.getByText(/Manage Position: AAPL/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('150')).toBeInTheDocument();
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
    
    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '12' } });
    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!);
    
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/portfolio/positions/1', expect.objectContaining({
        shares: 12,
      }));
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
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
    
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByText(/Delete Position\?/i)).toBeInTheDocument();
    
    // Now the button in footer is 'Delete'
    const finalDeleteBtn = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(finalDeleteBtn);
    
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/portfolio/positions/1');
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });
});

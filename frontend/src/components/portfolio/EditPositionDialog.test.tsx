
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

vi.mock('../../lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
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

vi.mock('../ui/button', () => ({
  Button: ({ children, onClick, type, disabled }: any) => (
    <button onClick={onClick} type={type} disabled={disabled}>{children}</button>
  ),
}));

vi.mock('../ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('../ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
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
    
    const sharesInput = screen.getByDisplayValue('10');
    fireEvent.change(sharesInput, { target: { value: '12' } });
    
    const saveBtn = screen.getByText(/save/i);
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
    
    const deleteBtn = screen.getByText('Delete');
    fireEvent.click(deleteBtn);
    
    expect(screen.getByText(/Delete Position\?/i)).toBeInTheDocument();
    
    const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(confirmDeleteBtn);
    
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/portfolio/positions/1');
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });
});

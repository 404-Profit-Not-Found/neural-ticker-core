
import { render, screen, fireEvent } from '@testing-library/react';
import { PortfolioGridView } from './PortfolioGridView';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mocks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../dashboard/TickerLogo', () => ({
  TickerLogo: () => <div data-testid="ticker-logo">Logo</div>,
}));

vi.mock('../ui/badge', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => <div data-variant={variant}>{children}</div>,
}));

vi.mock('../ui/button', () => ({
  Button: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <button onClick={onClick} className={className}>{children}</button>
  ),
}));

vi.mock('../ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div className={className} data-testid="skeleton" />,
}));

describe('PortfolioGridView', () => {
  const mockOnEdit = vi.fn();
  const mockData = [
    {
      id: '1',
      symbol: 'AAPL',
      current_price: 150,
      current_value: 1500,
      change_percent: 1.5,
      gain_loss: 200,
      gain_loss_percent: 15.38,
      ticker: { name: 'Apple Inc.' },
      aiAnalysis: { financial_risk: 2, upside_percent: 10, base_price: 165 },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeletons when isLoading is true', () => {
    render(
      <BrowserRouter>
        <PortfolioGridView data={[]} isLoading={true} onEdit={mockOnEdit} />
      </BrowserRouter>
    );
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('renders grid items correctly', () => {
    render(
      <BrowserRouter>
        <PortfolioGridView data={mockData} isLoading={false} onEdit={mockOnEdit} />
      </BrowserRouter>
    );
    
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
    expect(screen.getByText('1.50%')).toBeInTheDocument();
    expect(screen.getByText('+15.38%')).toBeInTheDocument();
    expect(screen.getByText('10.0%')).toBeInTheDocument(); // 165 is 10% above 150
  });

  it('navigates to ticker detail on click', () => {
    render(
      <BrowserRouter>
        <PortfolioGridView data={mockData} isLoading={false} onEdit={mockOnEdit} />
      </BrowserRouter>
    );
    
    // Grid item is the div with AAPL
    const item = screen.getByText('AAPL').closest('div')?.parentElement;
    fireEvent.click(item!);
    
    expect(mockNavigate).toHaveBeenCalledWith('/ticker/AAPL');
  });

  it('calls onEdit when edit button is clicked', () => {
    render(
      <BrowserRouter>
        <PortfolioGridView data={mockData} isLoading={false} onEdit={mockOnEdit} />
      </BrowserRouter>
    );
    
    // Grid item is grouped, button should be findable
    const editBtn = screen.getByRole('button');
    fireEvent.click(editBtn);
    
    expect(mockOnEdit).toHaveBeenCalledWith(mockData[0]);
  });
});

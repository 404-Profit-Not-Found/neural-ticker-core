
import { render, screen, fireEvent } from '@testing-library/react';
import { PortfolioTable, type Position } from './PortfolioTable';
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

// Mock DataTable to simplify testing
vi.mock('../ui/data-table', () => ({
  DataTable: ({ columns, data, onRowClick }: { columns: any[]; data: any[]; onRowClick?: (row: any) => void }) => (
    <div data-testid="data-table">
      <table>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i}>{typeof col.header === 'function' ? col.header() : col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} onClick={() => onRowClick?.(row)}>
              {columns.map((col, j) => (
                <td key={j}>
                  {col.cell
                    ? col.cell({
                        row: { original: row },
                        getValue: () => row[col.accessorKey || col.id],
                      })
                    : row[col.accessorKey]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
}));

vi.mock('../dashboard/TickerLogo', () => ({
  TickerLogo: ({ symbol }: { symbol: string }) => <div data-testid={`logo-${symbol}`}>Logo</div>,
}));

vi.mock('../ticker/VerdictBadge', () => ({
  VerdictBadge: () => <div data-testid="verdict-badge">Badge</div>,
}));

vi.mock('../dashboard/FiftyTwoWeekRange', () => ({
  FiftyTwoWeekRange: () => <div data-testid="range-bar">Range</div>,
}));

vi.mock('../ui/Sparkline', () => ({
  Sparkline: () => <div data-testid="sparkline">Sparkline</div>,
}));

describe('PortfolioTable', () => {
  const mockOnDelete = vi.fn();
  const mockOnEdit = vi.fn();
  
  const mockPositions: Position[] = [
    {
      id: '1',
      symbol: 'AAPL',
      shares: 10,
      buy_price: 150,
      current_price: 180,
      change_percent: 1.5,
      current_value: 1800,
      cost_basis: 1500,
      gain_loss: 300,
      gain_loss_percent: 20,
      ticker: { name: 'Apple Inc.' },
      aiAnalysis: { financial_risk: 2, overall_score: 8, base_price: 200 },
      sparkline: [170, 175, 180],
      fiftyTwoWeekHigh: 200,
      fiftyTwoWeekLow: 140,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Empty" state when no positions', () => {
    render(
      <BrowserRouter>
        <PortfolioTable positions={[]} onDelete={mockOnDelete} loading={false} />
      </BrowserRouter>
    );
    expect(screen.getByText(/your portfolio is empty/i)).toBeInTheDocument();
  });

  it('renders table headers and data correctly', () => {
    render(
      <BrowserRouter>
        <PortfolioTable positions={mockPositions} onDelete={mockOnDelete} onEdit={mockOnEdit} loading={false} />
      </BrowserRouter>
    );
    
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByText('Asset')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    
    // Check formatted values
    expect(screen.getByText('$1,800.00')).toBeInTheDocument();
    expect(screen.getByText('+$300.00')).toBeInTheDocument();
    expect(screen.getByText('(+20.00%)')).toBeInTheDocument();
  });

  it('navigates to ticker detail on row click', () => {
    render(
      <BrowserRouter>
        <PortfolioTable positions={mockPositions} onDelete={mockOnDelete} loading={false} />
      </BrowserRouter>
    );
    
    const row = screen.getByText('AAPL').closest('tr');
    fireEvent.click(row!);
    
    expect(mockNavigate).toHaveBeenCalledWith('/ticker/AAPL');
  });

  it('calls onDelete when delete button is clicked', () => {
    render(
      <BrowserRouter>
        <PortfolioTable positions={mockPositions} onDelete={mockOnDelete} loading={false} />
      </BrowserRouter>
    );
    
    const deleteButton = screen.getByTitle('Delete Position');
    fireEvent.click(deleteButton);
    
    expect(mockOnDelete).toHaveBeenCalledWith('1');
  });

  it('calls onEdit when edit button is clicked', () => {
    render(
      <BrowserRouter>
        <PortfolioTable positions={mockPositions} onDelete={mockOnDelete} onEdit={mockOnEdit} loading={false} />
      </BrowserRouter>
    );
    
    const editButton = screen.getByTitle('Edit Position');
    fireEvent.click(editButton);
    
    expect(mockOnEdit).toHaveBeenCalledWith(mockPositions[0]);
  });

  it('shows sparkline when data is present', () => {
    render(
      <BrowserRouter>
        <PortfolioTable positions={mockPositions} onDelete={mockOnDelete} loading={false} />
      </BrowserRouter>
    );
    expect(screen.getByTestId('sparkline')).toBeInTheDocument();
  });
});

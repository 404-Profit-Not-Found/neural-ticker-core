
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PortfolioPage } from './PortfolioPage';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useMarketSnapshots } from '../hooks/useWatchlist';
import { api } from '../lib/api';
import '@testing-library/jest-dom';

// Mocks
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useWatchlist', () => ({
  useMarketSnapshots: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
  },
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// Mock components with simple return values
vi.mock('../components/layout/Header', () => ({ Header: () => <div data-testid="header">Header</div> }));
vi.mock('../components/portfolio/PortfolioStats', () => ({ 
  PortfolioStats: ({ totalValue, onAnalyze }: any) => (
    <div data-testid="stats">
      Value: {totalValue}
      <button onClick={onAnalyze}>Analyze</button>
    </div>
  ) 
}));
vi.mock('../components/portfolio/PortfolioTable', () => ({ 
  PortfolioTable: ({ positions, onDelete, onEdit }: any) => (
    <div data-testid="table">
      {(positions || []).map((p: any) => (
        <div key={p.id}>
          {p.symbol}
          <button onClick={() => onDelete(p.id)}>Delete {p.symbol}</button>
          <button onClick={() => onEdit(p)}>Edit {p.symbol}</button>
        </div>
      ))}
    </div>
  ) 
}));
vi.mock('../components/portfolio/PortfolioGridView', () => ({ PortfolioGridView: () => <div data-testid="grid">Grid</div> }));
vi.mock('../components/portfolio/AddPositionDialog', () => ({ AddPositionDialog: ({ open }: any) => open ? <div>AddDialog</div> : null }));
vi.mock('../components/portfolio/EditPositionDialog', () => ({ EditPositionDialog: ({ open }: any) => open ? <div>EditDialog</div> : null }));
vi.mock('../components/portfolio/PortfolioAiAnalyzer', () => ({ PortfolioAiAnalyzer: ({ open }: any) => open ? <div>AiDialog</div> : null }));
vi.mock('../components/analyzer/FilterBar', () => ({ FilterBar: () => <div>Filter</div> }));
vi.mock('sonner', () => ({ Toaster: () => null, toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('lucide-react', () => ({ 
  Search: () => <div>Search</div>, 
  LayoutGrid: () => <div>LayoutGrid</div>, 
  List: () => <div>List</div>, 
  Plus: () => <div>PlusIcon</div>, 
  X: () => <div>XIcon</div>, 
  Bot: () => <div>Bot</div>, 
  PieChart: () => <div>Pie</div> 
}));

describe('PortfolioPage', () => {
  const mockPositions = [
    { id: '1', symbol: 'AAPL', current_value: 1000, cost_basis: 800, aiAnalysis: { financial_risk: 2 } },
    { id: '2', symbol: 'MSFT', current_value: 2000, cost_basis: 1800, aiAnalysis: { financial_risk: 5 } },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as Mock).mockReturnValue({ user: { uid: '1', credits_balance: 10 } });
    (useQuery as Mock).mockReturnValue({ data: mockPositions, isLoading: false, refetch: vi.fn() });
    (useMarketSnapshots as Mock).mockReturnValue({ data: [], isLoading: false });
  });

  const renderPage = () => {
    return render(
      <BrowserRouter>
        <PortfolioPage />
      </BrowserRouter>
    );
  };

  it('renders correctly and calculates stats', () => {
    renderPage();
    expect(screen.getByText('Value: 3000')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
  });

  it('filters positions by search', () => {
    renderPage();
    const searchInput = screen.getByPlaceholderText(/search symbols/i);
    fireEvent.change(searchInput, { target: { value: 'AAPL' } });
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
  });

  it('handles delete action', async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    (api.delete as Mock).mockResolvedValue({});
    
    renderPage();
    fireEvent.click(screen.getByText('Delete AAPL'));
    
    expect(api.delete).toHaveBeenCalledWith('/portfolio/positions/1');
    await waitFor(() => {
       // success checked via mock api call
    });
  });

  it('opens add dialog', () => {
    renderPage();
    fireEvent.click(screen.getByText('Add Position'));
    expect(screen.getByText('AddDialog')).toBeInTheDocument();
  });

  it('opens AI analyzer', () => {
    renderPage();
    fireEvent.click(screen.getByText('Analyze'));
    expect(screen.getByText('AiDialog')).toBeInTheDocument();
  });

  it('opens edit dialog', () => {
    renderPage();
    fireEvent.click(screen.getByText('Edit AAPL'));
    expect(screen.getByText('EditDialog')).toBeInTheDocument();
  });

  it('handles mobile FAB menu', () => {
    renderPage();
    // Initially, FAB shows PlusIcon (there are multiple, one in desktop button, one in FAB)
    const fabPlusIcons = screen.getAllByText('PlusIcon');
    const fabBtn = fabPlusIcons[fabPlusIcons.length - 1].closest('button');
    fireEvent.click(fabBtn!);
    
    // Now it should show XIcon
    expect(screen.getByText('XIcon')).toBeInTheDocument();
    
    // Now mobile labels should appear
    expect(screen.getAllByText('Add Position').length).toBeGreaterThan(1);
    expect(screen.getByText('AI Analysis')).toBeInTheDocument();
  });
});

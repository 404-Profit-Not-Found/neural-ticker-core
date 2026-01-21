
import { render } from '@testing-library/react';
import { PortfolioPage } from './PortfolioPage';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useMarketSnapshots } from '../hooks/useWatchlist';
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
  },
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../components/layout/Header', () => ({ Header: () => <div>Header</div> }));
vi.mock('../components/portfolio/PortfolioStats', () => ({ PortfolioStats: () => <div>Stats</div> }));
vi.mock('../components/portfolio/PortfolioTable', () => ({ PortfolioTable: () => <div>Table</div> }));
vi.mock('../components/portfolio/PortfolioGridView', () => ({ PortfolioGridView: () => <div>Grid</div> }));
vi.mock('../components/portfolio/AddPositionDialog', () => ({ AddPositionDialog: () => <div>Add</div> }));
vi.mock('../components/portfolio/EditPositionDialog', () => ({ EditPositionDialog: () => <div>Edit</div> }));
vi.mock('../components/portfolio/PortfolioAiAnalyzer', () => ({ PortfolioAiAnalyzer: () => <div>AI</div> }));
vi.mock('../components/analyzer/FilterBar', () => ({ FilterBar: () => <div>Filter</div> }));
vi.mock('sonner', () => ({ Toaster: () => <div>Toaster</div>, toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('lucide-react', () => ({ 
  Search: () => <div>Search</div>, 
  LayoutGrid: () => <div>Grid</div>, 
  List: () => <div>List</div>, 
  Plus: () => <div>Plus</div>, 
  X: () => <div>X</div>, 
  Bot: () => <div>Bot</div>, 
  PieChart: () => <div>Pie</div> 
}));

describe('PortfolioPage Smoke Test', () => {
  beforeEach(() => {
    (useAuth as Mock).mockReturnValue({ user: { uid: '1' } });
    (useQuery as Mock).mockReturnValue({ data: [], isLoading: false });
    (useMarketSnapshots as Mock).mockReturnValue({ data: [] });
  });

  it('renders', () => {
    render(
      <BrowserRouter>
        <PortfolioPage />
      </BrowserRouter>
    );
  });
});

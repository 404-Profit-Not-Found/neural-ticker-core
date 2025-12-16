
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AnalyzerTable } from './AnalyzerTable';
import { BrowserRouter } from 'react-router-dom';

// Mocks
vi.mock('../../hooks/useStockAnalyzer', () => ({
  useStockAnalyzer: vi.fn(),
}));

vi.mock('./AnalyzerTableView', () => ({
  AnalyzerTableView: () => <div data-testid="table-view">Table View Content</div>,
}));

vi.mock('./AnalyzerGridView', () => ({
  AnalyzerGridView: () => <div data-testid="grid-view">Grid View Content</div>,
}));

import { useStockAnalyzer } from '../../hooks/useStockAnalyzer';

const mockUseStockAnalyzer = useStockAnalyzer as any;

const defaultProps = {
  viewMode: 'table' as const,
  onViewModeChange: vi.fn(),
  filters: { risk: [], aiRating: [], upside: null },
};

const renderWithRouter = (component: React.ReactNode) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('AnalyzerTable', () => {
  // Mock Data
  const mockData = {
    items: [
      {
        ticker: { symbol: 'NVDA', name: 'NVIDIA', logo_url: '' },
        latestPrice: { close: 100, change: 5 },
        aiAnalysis: { overall_score: 2, upside_percent: 15 },
        counts: { research: 1, news: 0, social: 0 },
        fundamentals: { consensus_rating: 'Buy' },
      },
    ],
    meta: { total: 1, totalPages: 1 },
  };

  it('renders table view correctly', () => {
    mockUseStockAnalyzer.mockReturnValue({ data: mockData, isLoading: false });
    renderWithRouter(<AnalyzerTable {...defaultProps} viewMode="table" />);
    
    expect(screen.getByTestId('table-view')).toBeInTheDocument();
    expect(screen.queryByTestId('grid-view')).not.toBeInTheDocument();
  });

  it('renders grid view correctly', () => {
    mockUseStockAnalyzer.mockReturnValue({ data: mockData, isLoading: false });
    renderWithRouter(<AnalyzerTable {...defaultProps} viewMode="grid" />);
    
    expect(screen.getByTestId('grid-view')).toBeInTheDocument();
    expect(screen.queryByTestId('table-view')).not.toBeInTheDocument();
  });

  it('calls onViewModeChange when toggled', () => {
    mockUseStockAnalyzer.mockReturnValue({ data: mockData, isLoading: false });
    renderWithRouter(<AnalyzerTable {...defaultProps} />);
    
    const gridBtn = screen.getByTitle('Grid View');
    fireEvent.click(gridBtn);
    expect(defaultProps.onViewModeChange).toHaveBeenCalledWith('grid');

    const tableBtn = screen.getByTitle('Table View');
    fireEvent.click(tableBtn);
    expect(defaultProps.onViewModeChange).toHaveBeenCalledWith('table');
  });

  it('passes filters to hook', () => {
    mockUseStockAnalyzer.mockReturnValue({ data: mockData, isLoading: false });
    const filters = { risk: ['High'], aiRating: ['Buy'], upside: '>20%' };
    
    renderWithRouter(<AnalyzerTable {...defaultProps} filters={filters} />);
    
    expect(mockUseStockAnalyzer).toHaveBeenCalledWith(expect.objectContaining({
      risk: ['High'],
      aiRating: ['Buy'],
      upside: '>20%',
    }));
  });
});

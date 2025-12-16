import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyzerPage } from './AnalyzerPage';
import { MemoryRouter } from 'react-router-dom';

// Mocks
vi.mock('../components/layout/Header', () => ({
  Header: () => <div data-testid="header">Header</div>,
}));

vi.mock('../components/analyzer/FilterBar', () => ({
  FilterBar: ({ filters, onFilterChange, onReset }: { 
    filters: { risk: string[], aiRating: string[], upside: string | null, sector: string[] }, 
    onFilterChange: (key: 'risk' | 'aiRating' | 'upside' | 'sector', val: string[] | string | null) => void, 
    onReset: () => void 
  }) => (
    <div data-testid="filter-bar">
      <span data-testid="active-filter-risk">{filters.risk.join(',')}</span>
      <span data-testid="active-filter-ai">{filters.aiRating.join(',')}</span>
      <span data-testid="active-filter-upside">{filters.upside}</span>
      <button onClick={() => onFilterChange('risk', ['High'])}>Set Risk</button>
      <button onClick={onReset}>Reset</button>
    </div>
  ),
}));

vi.mock('../components/analyzer/AnalyzerTable', () => ({
  AnalyzerTable: ({ viewMode, onViewModeChange }: { viewMode: string, onViewModeChange: (mode: 'table' | 'grid') => void }) => (
    <div data-testid="analyzer-table">
      <span data-testid="view-mode">{viewMode}</span>
      <button onClick={() => onViewModeChange('grid')}>Set Grid</button>
    </div>
  ),
}));

// Wrapper to provide router context
const renderWithRouter = (initialEntries = ['/analyzer']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AnalyzerPage />
    </MemoryRouter>
  );
};

describe('AnalyzerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page components', () => {
    renderWithRouter();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    expect(screen.getByTestId('analyzer-table')).toBeInTheDocument();
    expect(screen.getByText(/Advanced screening/i)).toBeInTheDocument();
  });

  it('initializes filters from URL parameters', () => {
    renderWithRouter(['/analyzer?risk=High&aiRating=Buy&upside=>20%']);
    
    expect(screen.getByTestId('active-filter-risk')).toHaveTextContent('High');
    expect(screen.getByTestId('active-filter-ai')).toHaveTextContent('Buy');
    expect(screen.getByTestId('active-filter-upside')).toHaveTextContent('>20%');
  });

  it('initializes view mode from URL', () => {
    renderWithRouter(['/analyzer?view=grid']);
    expect(screen.getByTestId('view-mode')).toHaveTextContent('grid');
    
    // Cleanup and test table view default
    vi.clearAllMocks(); // not strictly needed for this but good practice
  });

  it('handles legacy "filter=strong_buy" parameter correctly', () => {
    renderWithRouter(['/analyzer?filter=strong_buy']);
    expect(screen.getByTestId('active-filter-ai')).toHaveTextContent('Strong Buy');
  });
});

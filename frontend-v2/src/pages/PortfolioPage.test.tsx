
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PortfolioPage } from './PortfolioPage';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useMarketSnapshots } from '../hooks/useWatchlist';
import { useCurrency } from '../context/CurrencyContext';
import { api } from '../lib/api';
import { ConfirmProvider } from '../components/ui/confirm';
import '@testing-library/jest-dom';

// Mocks
vi.mock('../context/CurrencyContext', () => ({
  useCurrency: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
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
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// Mock components with simple return values
vi.mock('../components/layout/Header', () => ({ Header: () => <div data-testid="header">Header</div> }));
vi.mock('../components/portfolio/PortfolioStats', () => ({
  PortfolioStats: ({ totalValue, onAnalyze, onManageCash, onViewHistory }: { totalValue: number; onAnalyze: () => void; onManageCash?: () => void; onViewHistory?: () => void }) => (
    <div data-testid="stats">
      Value: {totalValue}
      <button onClick={onAnalyze}>Analyze</button>
      <button onClick={onManageCash}>ManageCash</button>
      <button onClick={onViewHistory}>ViewHistory</button>
    </div>
  )
}));
vi.mock('../components/portfolio/PortfolioTable', () => ({
  PortfolioTable: ({ positions, onDelete, onEdit, onSell }: { positions: unknown[]; onDelete: (id: string) => void; onEdit: (position: unknown) => void; onSell: (position: unknown) => void }) => (
    <div data-testid="table">
      {(positions || []).map((p) => {
        const position = p as Record<string, unknown>;
        return (
          <div key={position.id as string}>
            {position.symbol as string}
            <button onClick={() => onDelete(position.id as string)}>Delete {position.symbol as string}</button>
            <button onClick={() => onEdit(position)}>Edit {position.symbol as string}</button>
            <button onClick={() => onSell(position)}>Sell {position.symbol as string}</button>
          </div>
        );
      })}
    </div>
  )
}));
vi.mock('../components/portfolio/PortfolioGridView', () => ({ PortfolioGridView: () => <div data-testid="grid">Grid</div> }));
vi.mock('../components/portfolio/AddPositionDialog', () => ({ AddPositionDialog: ({ open }: { open: boolean }) => open ? <div>AddDialog</div> : null }));
vi.mock('../components/portfolio/EditPositionDialog', () => ({ EditPositionDialog: ({ open }: { open: boolean }) => open ? <div>EditDialog</div> : null }));
vi.mock('../components/portfolio/SellPositionDialog', () => ({ SellPositionDialog: ({ open }: { open: boolean }) => open ? <div>SellDialog</div> : null }));
vi.mock('../components/portfolio/TradeHistoryDialog', () => ({ TradeHistoryDialog: ({ open }: { open: boolean }) => open ? <div>HistoryDialog</div> : null }));
vi.mock('../components/portfolio/PortfolioAiAnalyzer', () => ({ PortfolioAiAnalyzer: ({ open }: { open: boolean }) => open ? <div>AiDialog</div> : null }));
vi.mock('../components/portfolio/CashDialog', () => ({
  CashDialog: ({ open, defaultCurrency }: { open: boolean; defaultCurrency?: string }) =>
    open ? <div>CashDialog {defaultCurrency}</div> : null,
}));
vi.mock('../components/analyzer/FilterBar', () => ({ FilterBar: () => <div>Filter</div> }));
vi.mock('sonner', () => ({ Toaster: () => null, toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('lucide-react', () => ({
  Search: () => <div>Search</div>,
  LayoutGrid: () => <div>LayoutGrid</div>,
  List: () => <div>List</div>,
  Plus: () => <div>PlusIcon</div>,
  X: () => <div>XIcon</div>,
  Bot: () => <div>Bot</div>,
  PieChart: () => <div>Pie</div>,
  Wallet: () => <div>Wallet</div>,
  // Used by PortfolioCurrencySelector (mounted in the page toolbar).
  Coins: () => <div>Coins</div>,
  ChevronDown: () => <div>ChevronDown</div>,
  // Used by the themed confirm dialog (ConfirmProvider) for destructive actions.
  AlertTriangle: () => <div>AlertTriangle</div>,
}));

describe('PortfolioPage', () => {
  const mockPositions = [
    { id: '1', symbol: 'AAPL', current_value: 1000, cost_basis: 800, aiAnalysis: { financial_risk: 2 } },
    { id: '2', symbol: 'MSFT', current_value: 2000, cost_basis: 1800, aiAnalysis: { financial_risk: 5 } },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as Mock).mockReturnValue({ user: { uid: '1', credits_balance: 10 } });
    (useCurrency as Mock).mockReturnValue({
      displayCurrency: 'USD',
      setDisplayCurrency: vi.fn(),
      formatCurrency: (val: number) => `$${val.toLocaleString()}`,
      formatNative: (val: number) => `$${val.toLocaleString()}`,
      convert: (amount: number) => amount,
      rates: {},
      // Used by PortfolioCurrencySelector (mounted in the page toolbar).
      availableCurrencies: [
        { code: 'USD', flag: '🇺🇸' },
        { code: 'EUR', flag: '🇪🇺' },
      ],
      loading: false,
    });
    (useQuery as Mock).mockImplementation(({ queryKey }: { queryKey: string[] }) =>
      queryKey[0] === 'portfolio-cash'
        ? { data: [{ currency: 'USD', amount: 25000 }], refetch: vi.fn() }
        : { data: mockPositions, isLoading: false, refetch: vi.fn() },
    );
    (useMarketSnapshots as Mock).mockReturnValue({ data: [], isLoading: false });
  });

  const renderPage = () => {
    return render(
      <BrowserRouter>
        <ConfirmProvider>
          <PortfolioPage />
        </ConfirmProvider>
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
    (api.delete as Mock).mockResolvedValue({});

    renderPage();
    fireEvent.click(screen.getByText('Delete AAPL'));

    // The themed confirm dialog names the position; nothing is deleted until confirmed.
    const dialog = await screen.findByRole('dialog', { name: /delete AAPL position\?/i });
    expect(api.delete).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /delete position/i }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/portfolio/positions/1');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not delete when the confirm dialog is cancelled', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Delete AAPL'));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('opens add dialog', () => {
    renderPage();
    fireEvent.click(screen.getByText('Add Position'));
    expect(screen.getByText('AddDialog')).toBeInTheDocument();
  });

  it('shows the cash balance and opens the cash dialog', () => {
    renderPage();
    const cashBtn = screen.getByText('$25,000').closest('button');
    fireEvent.click(cashBtn!);
    expect(screen.getByText('CashDialog USD')).toBeInTheDocument();
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

  it('opens sell dialog', () => {
    renderPage();
    fireEvent.click(screen.getByText('Sell AAPL'));
    expect(screen.getByText('SellDialog')).toBeInTheDocument();
  });

  it('opens cash dialog', () => {
    renderPage();
    fireEvent.click(screen.getByText('ManageCash'));
    expect(screen.getByText('CashDialog USD')).toBeInTheDocument();
  });

  it('opens trade history dialog', () => {
    renderPage();
    fireEvent.click(screen.getByText('ViewHistory'));
    expect(screen.getByText('HistoryDialog')).toBeInTheDocument();
  });

  it('says the load failed instead of showing an empty portfolio', () => {
    const refetch = vi.fn();
    (useQuery as Mock).mockImplementation(({ queryKey }: { queryKey: string[] }) =>
      queryKey[0] === 'portfolio-cash'
        ? { data: undefined, refetch: vi.fn() }
        : { data: undefined, isLoading: false, isError: true, refetch },
    );
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t load your portfolio/i);
    // No fabricated totals and no "empty portfolio" claim on a failed request.
    expect(screen.queryByText(/Value: /)).not.toBeInTheDocument();
    expect(screen.queryByText(/your portfolio is empty/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('tells a search with no matches apart from an empty portfolio, and can reset it', () => {
    renderPage();
    const searchInput = screen.getByPlaceholderText(/search symbols/i);
    fireEvent.change(searchInput, { target: { value: 'ZZZZ' } });

    expect(screen.getByText(/no positions match/i)).toBeInTheDocument();
    expect(screen.queryByText(/your portfolio is empty/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reset filters/i }));
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
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

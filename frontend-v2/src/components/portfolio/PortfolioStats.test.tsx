
import { render, screen, fireEvent } from '@testing-library/react';
import { PortfolioStats } from './PortfolioStats';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('../../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../../context/CurrencyContext', () => ({
  useCurrency: () => ({
    displayCurrency: 'USD',
    formatCurrency: (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val),
    formatNative: (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val),
    convert: (amount: number) => amount,
    rates: {},
    loading: false,
  }),
}));

// Mock Recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div data-testid="composed-chart">{children}</div>,
  Area: () => <div />,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
}));

vi.mock('lucide-react', () => ({
  TrendingUp: () => <span>Up</span>,
  TrendingDown: () => <span>Down</span>,
  Bot: () => <span>Bot</span>,
  AlertTriangle: () => <span>Warn</span>,
  Wallet: () => <span>Wallet</span>,
  History: () => <span>History</span>,
  Info: () => <span>Info</span>,
}));

// The chart's data comes from the real-history hook (trade ledger × daily
// closes, covered by lib/portfolio-history.test.ts and
// hooks/usePortfolioHistory.test.tsx). Here it is driven directly so each
// presentation state can be asserted.
const historyState = vi.hoisted(() => ({
  current: { status: 'loading' } as import('../../hooks/usePortfolioHistory').PortfolioHistoryState,
  calls: [] as Array<{ range: string; displayCurrency: string }>,
}));
vi.mock('../../hooks/usePortfolioHistory', () => ({
  PORTFOLIO_RANGES: ['1W', '1M', '6M', '1Y'],
  usePortfolioHistory: (_positions: unknown, range: string, displayCurrency: string) => {
    historyState.calls.push({ range, displayCurrency });
    return historyState.current;
  },
}));

const readySeries = (overrides: Partial<import('../../lib/portfolio-history').PortfolioSeries> = {}) => ({
  status: 'ready' as const,
  usesFxConversion: false,
  series: {
    points: [
      { date: '2026-01-01', value: 3000, invested: 3000 },
      { date: '2026-01-02', value: 3550, invested: 3000, bought: ['AAPL'] },
    ],
    periodGain: 123.45,
    periodGainPct: 4.11,
    missingHistory: [],
    excluded: [],
    ...overrides,
  },
});

describe('PortfolioStats', () => {
  const mockOnAnalyze = vi.fn();
  const mockPositions = [
    {
      symbol: 'AAPL',
      shares: 10,
      buy_price: 150,
      current_price: 180,
      current_value: 1800,
      buy_date: '2023-01-01',
      ticker: { sector: 'Technology' },
    },
    {
      symbol: 'MSFT',
      shares: 5,
      buy_price: 300,
      current_price: 350,
      current_value: 1750,
      buy_date: '2023-02-01',
      ticker: { sector: 'Technology' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    historyState.current = readySeries();
    historyState.calls.length = 0;
  });

  it('renders correctly with given stats', () => {
    render(
      <PortfolioStats
        totalValue={3550}
        totalGainLoss={550}
        totalGainLossPercent={18.3}
        positions={mockPositions}
        onAnalyze={mockOnAnalyze}
        credits={10}
        todayGain={50}
        todayGainPct={1.4}
      />
    );

    expect(screen.getByText(/\$3,550\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\$550\.00/)).toBeInTheDocument();
    expect(screen.getByText('All Time')).toBeInTheDocument();
    // Default range is 1M, so it should show 1M label in the period gain section
    expect(screen.getAllByText('1M').length).toBeGreaterThan(0); 
    expect(screen.getAllByText('AI Analyze').length).toBeGreaterThan(0);
  });

  it('disables AI Analyze button when credits are 0', () => {
    render(
      <PortfolioStats
        totalValue={3550}
        totalGainLoss={550}
        totalGainLossPercent={18.3}
        positions={mockPositions}
        onAnalyze={mockOnAnalyze}
        credits={0}
      />
    );

    const button = screen.getAllByText('AI Analyze')[0].closest('button');
    expect(button).toBeDisabled();
  });

  it('calls onAnalyze when button is clicked', () => {
    render(
      <PortfolioStats
        totalValue={3550}
        totalGainLoss={550}
        totalGainLossPercent={18.3}
        positions={mockPositions}
        onAnalyze={mockOnAnalyze}
        credits={10}
      />
    );

    const button = screen.getAllByText('AI Analyze')[0];
    fireEvent.click(button);
    expect(mockOnAnalyze).toHaveBeenCalled();
  });

  it('changes range and updates chart data', () => {
    render(
      <PortfolioStats
        totalValue={3550}
        totalGainLoss={550}
        totalGainLossPercent={18.3}
        positions={mockPositions}
        onAnalyze={mockOnAnalyze}
      />
    );

    const rangeButton = screen.getByText('6M');
    fireEvent.click(rangeButton);
    
    // Check if the range button becomes active
    expect(rangeButton).toHaveClass('text-foreground');
    // …and the history is requested for the new range, not re-derived locally.
    expect(historyState.calls.at(-1)).toEqual({ range: '6M', displayCurrency: 'USD' });
  });

  // 1D test removed

  // 1D gain test removed

  it('handles 1W range', () => {
    render(
      <PortfolioStats
        totalValue={3550}
        totalGainLoss={550}
        totalGainLossPercent={18.3}
        positions={mockPositions}
        onAnalyze={mockOnAnalyze}
      />
    );

    const rangeButton = screen.getByText('1W');
    fireEvent.click(rangeButton);
    expect(rangeButton).toHaveClass('text-foreground');
  });

  it('renders charts', () => {
    render(
      <PortfolioStats
        totalValue={3550}
        totalGainLoss={550}
        totalGainLossPercent={18.3}
        positions={mockPositions}
        onAnalyze={mockOnAnalyze}
      />
    );

    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
  });

  const renderStats = (props: Partial<React.ComponentProps<typeof PortfolioStats>> = {}) =>
    render(
      <PortfolioStats
        totalValue={3550}
        totalGainLoss={550}
        totalGainLossPercent={18.3}
        positions={mockPositions}
        onAnalyze={mockOnAnalyze}
        {...props}
      />,
    );

  describe('holdings history chart', () => {
    it('shows the period gain reported by the real history, with its sign', () => {
      renderStats();
      const gain = screen.getByTitle(/excluding money added or withdrawn/i);
      expect(gain).toHaveTextContent('+$123.45');
      expect(gain).toHaveTextContent('(+4.11%)');
    });

    it('shows a loss as a loss', () => {
      historyState.current = readySeries({ periodGain: -120.5, periodGainPct: -3.2 });
      renderStats();
      const gain = screen.getByTitle(/excluding money added or withdrawn/i);
      expect(gain).toHaveTextContent('−$120.50');
      // The same minus sign in both figures.
      expect(gain).toHaveTextContent('(−3.20%)');
    });

    it('shows no change as plain zero, never as a negative zero', () => {
      historyState.current = readySeries({ periodGain: -0.001, periodGainPct: -0.0001 });
      renderStats();
      const gain = screen.getByTitle(/excluding money added or withdrawn/i);
      expect(gain).toHaveTextContent('$0.00 (0.00%)');
      expect(gain.textContent).not.toMatch(/[−+-]\$?0\.00/);
    });

    it('shows a loading placeholder — never a made-up line — while prices load', () => {
      historyState.current = { status: 'loading' };
      renderStats();
      expect(screen.getByRole('status', { name: /loading holdings history/i })).toBeInTheDocument();
      expect(screen.queryByTestId('composed-chart')).not.toBeInTheDocument();
      expect(screen.queryByTitle(/excluding money added or withdrawn/i)).not.toBeInTheDocument();
    });

    it('explains why mixed currencies cannot be charted in native mode', () => {
      historyState.current = { status: 'mixed-currency' };
      renderStats({ isNativeMode: true, displayCurrency: '' });
      expect(screen.getByText(/pick a display currency to chart your holdings/i)).toBeInTheDocument();
      expect(screen.queryByTestId('composed-chart')).not.toBeInTheDocument();
      // Native mode asks the hook for an un-converted series.
      expect(historyState.calls.at(-1)?.displayCurrency).toBe('');
    });

    it('shows an empty state when nothing was held in the period', () => {
      historyState.current = readySeries({
        points: [
          { date: '2026-01-01', value: 0, invested: 0 },
          { date: '2026-01-02', value: 0, invested: 0 },
        ],
        periodGain: 0,
        periodGainPct: 0,
      });
      renderStats({ positions: [] });
      expect(screen.getByText(/no holdings in this period/i)).toBeInTheDocument();
      expect(screen.queryByTestId('composed-chart')).not.toBeInTheDocument();
    });

    it('discloses every approximation instead of hiding it', () => {
      historyState.current = {
        ...readySeries({ missingHistory: ['NEWCO'], excluded: ['7203.T'] }),
        usesFxConversion: true,
      };
      renderStats();
      expect(screen.getByText(/past values use today's exchange rates/i)).toBeInTheDocument();
      expect(screen.getByText(/no price history for NEWCO — shown at cost/i)).toBeInTheDocument();
      expect(screen.getByText(/7203\.T not charted — no exchange rate/i)).toBeInTheDocument();
    });
  });
});

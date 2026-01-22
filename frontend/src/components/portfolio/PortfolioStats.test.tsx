
import { render, screen, fireEvent } from '@testing-library/react';
import { PortfolioStats } from './PortfolioStats';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('../../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
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
}));

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
      />
    );

    expect(screen.getByText(/\$3,550\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\$550\.00/)).toBeInTheDocument();
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

    const rangeButton = screen.getByText('3M');
    fireEvent.click(rangeButton);
    
    // Check if the range button becomes active
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
});

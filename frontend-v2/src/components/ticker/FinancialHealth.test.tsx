import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FinancialHealth } from './FinancialHealth';
import { TickerFinancials } from './TickerFinancials';
import type { TickerData } from '../../types/ticker';

type Fundamentals = NonNullable<TickerData['fundamentals']>;

const full: Fundamentals = {
  market_cap: 2_978_000_000_000,
  pe_ratio: 56.9,
  price_to_book: 18.18,
  // The API reports shares in millions (Finnhub `shareOutstanding`).
  shares_outstanding: 24530.4778,
  revenue_ttm: 318_227_121_894,
  gross_margin: 0.4175,
  operating_margin: 0.2173,
  net_profit_margin: 0.1645,
  roe: 0.52,
  roa: 0.169,
  earnings_growth_yoy: 0.4302,
  free_cash_flow_ttm: 46_250_000_000,
  debt_to_equity: 0.27,
  debt_to_assets: 0.13,
  current_ratio: 3.16,
  quick_ratio: 1.47,
  interest_coverage: 6.2882,
  book_value_per_share: 9.98,
  dividend_yield: 0.0003,
};

/** The value printed under a metric's label. */
const valueOf = (label: string) => screen.getByText(label).parentElement?.querySelector('dd');

describe('FinancialHealth', () => {
  it('shows shares outstanding as a share count, not the raw figure in millions', () => {
    render(<FinancialHealth fundamentals={full} />);
    // 24,530 million shares = 24.53 billion; this used to read "25K".
    expect(valueOf('Shares outstanding')).toHaveTextContent('24.53B');
    expect(screen.queryByText('25K')).toBeNull();
  });

  it('formats money, ratios and fractions consistently', () => {
    render(<FinancialHealth fundamentals={full} />);
    expect(valueOf('Market cap')).toHaveTextContent('$2.98T');
    expect(valueOf('P/E ratio')).toHaveTextContent('56.90');
    expect(valueOf('Gross margin')).toHaveTextContent('41.75%');
    expect(valueOf('Earnings growth')).toHaveTextContent(/^43\.02%\s*YoY$/);
    expect(valueOf('Interest coverage')).toHaveTextContent('6.29');
    expect(valueOf('Book value / share')).toHaveTextContent('$9.98');
    expect(valueOf('Dividend yield')).toHaveTextContent('0.03%');
  });

  it('uses the instrument currency', () => {
    render(<FinancialHealth fundamentals={{ ...full, market_cap: 292_000_000_000 }} currency="EUR" />);
    expect(valueOf('Market cap')).toHaveTextContent('€292B');
  });

  it('prints an em dash for every figure that is missing — never 0, "-" or "N/A"', () => {
    render(<FinancialHealth fundamentals={{ market_cap: 98_000_000_000 }} />);
    for (const label of ['P/E ratio', 'Price / book', 'Shares outstanding', 'Revenue (TTM)', 'Gross margin', 'Debt / equity', 'Interest coverage', 'Dividend yield']) {
      expect(valueOf(label)).toHaveTextContent('—');
    }
    expect(screen.queryByText('N/A')).toBeNull();
    expect(screen.queryByText('-')).toBeNull();
  });

  it('treats a null P/E (loss-making company) as missing', () => {
    render(<FinancialHealth fundamentals={{ ...full, pe_ratio: null as unknown as number }} />);
    expect(valueOf('P/E ratio')).toHaveTextContent('—');
  });

  it('marks only genuinely worrying figures, and never tints the dividend yield', () => {
    render(<FinancialHealth fundamentals={{ ...full, debt_to_equity: 2.4, interest_coverage: 1.1 }} />);
    expect(valueOf('Debt / equity')).toHaveClass('text-down');
    expect(valueOf('Interest coverage')).toHaveClass('text-down');
    expect(valueOf('Current ratio')).not.toHaveClass('text-down');
    expect(valueOf('Dividend yield')?.className).not.toMatch(/green|text-up/);
  });

  it('names each group once', () => {
    render(<FinancialHealth fundamentals={full} />);
    for (const title of ['Valuation & size', 'Profitability', 'Balance sheet', 'Yield & liquidity']) {
      expect(screen.getAllByRole('heading', { name: title })).toHaveLength(1);
    }
  });
});

describe('TickerFinancials', () => {
  it('shows an explicit empty state when there are no fundamentals', () => {
    render(<TickerFinancials fundamentals={null} />);
    expect(screen.getByText('No fundamentals yet')).toBeInTheDocument();
    expect(screen.queryByText('Market cap')).toBeNull();
  });

  it('titles the panel "Fundamentals" (not a second "Financial Health")', () => {
    render(<TickerFinancials fundamentals={full} />);
    expect(screen.getByRole('heading', { name: 'Fundamentals' })).toBeInTheDocument();
    expect(screen.queryByText('Financial Health')).toBeNull();
  });
});

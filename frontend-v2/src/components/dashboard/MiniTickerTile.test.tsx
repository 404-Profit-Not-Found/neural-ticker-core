
import { render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MiniTickerTile } from './MiniTickerTile';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

// The tile is an in-app router link (no full page load, base-path aware).
const render = (ui: React.ReactElement, basename?: string) =>
  rtlRender(
    <MemoryRouter basename={basename} initialEntries={[basename ? `${basename}/` : '/']}>
      {ui}
    </MemoryRouter>,
  );

describe('MiniTickerTile', () => {
  it('renders correctly with given props', () => {
    render(
      <MiniTickerTile
        symbol="AAPL"
        company="Apple Inc."
        price={150.5}
        change={1.2}
        changeAmount={1.8}
        riskScore={2}
        href="/ticker/AAPL"
      />
    );

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('$150.50')).toBeInTheDocument();
    expect(screen.getByText('+1.20%')).toBeInTheDocument();
    expect(screen.getByText('+$1.80')).toBeInTheDocument();
    expect(screen.getByText('Risk 2')).toHaveClass('text-up');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/ticker/AAPL');
  });

  it('shows a loss in the down colour with a real minus sign', () => {
    render(
      <MiniTickerTile
        symbol="TSLA"
        price={200}
        change={-2.5}
        riskScore={7}
        href="/ticker/TSLA"
      />
    );
    
    expect(screen.getByText('−2.50%')).toHaveClass('text-down');
    // 7 is high risk — the same band the risk bars and tables use.
    expect(screen.getByText('Risk 7')).toHaveClass('text-down');
  });

  it('shows medium risk and an unchanged price as neither gain nor loss', () => {
    render(
      <MiniTickerTile
        symbol="MSFT"
        price={300}
        change={0}
        riskScore={5}
        href="/ticker/MSFT"
      />
    );
    expect(screen.getByText('Risk 5')).toHaveClass('dark:text-yellow-400');
    expect(screen.getByText('0.00%')).toHaveClass('text-muted-foreground');
  });

  it('links inside the app base path when the app is mounted under one', () => {
    render(
      <MiniTickerTile symbol="AAPL" price={1} change={0} riskScore={1} href="/ticker/AAPL" />,
      '/v2',
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/v2/ticker/AAPL');
  });
});

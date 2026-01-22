
import { render, screen } from '@testing-library/react';
import { MiniTickerTile } from './MiniTickerTile';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

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
    expect(screen.getByText('+1.80')).toBeInTheDocument();
    expect(screen.getByText('R2')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/ticker/AAPL');
  });

  it('renders destructive badge for negative change', () => {
    render(
      <MiniTickerTile
        symbol="TSLA"
        price={200}
        change={-2.5}
        riskScore={7}
        href="/ticker/TSLA"
      />
    );
    
    expect(screen.getByText('-2.50%')).toBeInTheDocument();
    expect(screen.getByText('R7')).toHaveClass('text-red-500');
  });

  it('handles moderate risk score color', () => {
    render(
      <MiniTickerTile
        symbol="MSFT"
        price={300}
        change={0}
        riskScore={5}
        href="/ticker/MSFT"
      />
    );
    expect(screen.getByText('R5')).toHaveClass('text-yellow-500');
  });
});

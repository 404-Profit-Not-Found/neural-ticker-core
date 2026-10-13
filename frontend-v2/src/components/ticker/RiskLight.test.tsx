import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RiskLight } from './RiskLight';

const breakdown = { financial: 9.5, execution: 5.2, dilution: 2.4, competitive: 3.1, regulatory: 3.8 };

describe('RiskLight', () => {
  it('says what the strip is and prints each factor with its value', () => {
    render(<RiskLight score={5} breakdown={breakdown} />);
    // The strip used to be five unlabelled icons.
    expect(screen.getByText(/Risk by factor/i)).toBeInTheDocument();
    expect(screen.getByText('9.5')).toBeInTheDocument();
    expect(screen.getByText('2.4')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('names every factor and its level for assistive tech', () => {
    render(<RiskLight score={5} breakdown={breakdown} />);
    expect(screen.getByRole('button', { name: 'Financial risk 9.5 out of 10, high. Show details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Execution risk 5.2 out of 10, medium. Show details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dilution risk 2.4 out of 10, low. Show details' })).toBeInTheDocument();
  });

  it('colours by level with the theme tokens', () => {
    render(<RiskLight score={5} breakdown={breakdown} />);
    expect(screen.getByText('9.5')).toHaveClass('text-down');
    expect(screen.getByText('2.4')).toHaveClass('text-up');
    expect(screen.getByText('5.2').className).toContain('yellow');
  });

  it('opens the explanation on click (not hover-only), from a focusable button', () => {
    render(<RiskLight score={5} breakdown={breakdown} />);
    const trigger = screen.getByRole('button', { name: /Financial risk/ });
    expect(trigger.className).toContain('focus-visible:ring-2');
    fireEvent.click(trigger);
    expect(screen.getByText('Balance sheet health, cash burn, and solvency.')).toBeInTheDocument();
    expect(screen.getByText('9.5/10')).toBeInTheDocument();
  });

  it('falls back to the overall score when there is no breakdown', () => {
    render(<RiskLight score={4} />);
    expect(screen.getAllByText('4.0')).toHaveLength(5);
  });
});

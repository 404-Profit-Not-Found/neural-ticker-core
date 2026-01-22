
import { render, screen } from '@testing-library/react';
import { FiftyTwoWeekRange } from './FiftyTwoWeekRange';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

describe('FiftyTwoWeekRange', () => {
  it('renders correctly with given values', () => {
    render(<FiftyTwoWeekRange low={100} high={200} current={150} />);
    
    expect(screen.getByText('100.00')).toBeInTheDocument();
    expect(screen.getByText('200.00')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders correctly at low end', () => {
    render(<FiftyTwoWeekRange low={100} high={200} current={100} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders correctly at high end', () => {
    render(<FiftyTwoWeekRange low={100} high={200} current={200} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders hyphen if invalid range', () => {
    render(<FiftyTwoWeekRange low={0} high={100} current={50} />);
    // if low is 0, line 20: if (!low || !high || high <= low) returns "-"
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('handles custom className', () => {
    const { container } = render(<FiftyTwoWeekRange low={100} high={200} current={150} className="custom-test" />);
    expect(container.firstChild).toHaveClass('custom-test');
  });

  it('hides labels when showLabels is false', () => {
    render(<FiftyTwoWeekRange low={100} high={200} current={150} showLabels={false} />);
    expect(screen.queryByText('100.00')).not.toBeInTheDocument();
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });
});

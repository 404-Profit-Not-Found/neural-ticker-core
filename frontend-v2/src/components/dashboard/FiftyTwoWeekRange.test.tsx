import { render, screen } from '@testing-library/react';
import { FiftyTwoWeekRange } from './FiftyTwoWeekRange';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

describe('FiftyTwoWeekRange', () => {
  it('renders the range ends as real prices and the position', () => {
    render(<FiftyTwoWeekRange low={100} high={200} current={150} />);

    // Money has two decimals ("$100.00"), not the one-decimal compact form
    // ("$100.0") this component used to print.
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('$200.00')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('keeps sub-dollar ends meaningful instead of rounding them to "$0.1"', () => {
    render(<FiftyTwoWeekRange low={0.0834} high={119.1} current={0.1834} />);
    expect(screen.getByText('$0.0834')).toBeInTheDocument();
    expect(screen.getByText('$119.10')).toBeInTheDocument();
  });

  it('shortens six-figure prices so the labels fit', () => {
    render(<FiftyTwoWeekRange low={490100} high={718500} current={689420} />);
    expect(screen.getByText('$490.1K')).toBeInTheDocument();
    expect(screen.getByText('$718.5K')).toBeInTheDocument();
  });

  it('uses the instrument currency', () => {
    render(<FiftyTwoWeekRange low={46.9} high={72.5} current={58.4} currency="EUR" />);
    expect(screen.getByText('€46.90')).toBeInTheDocument();
  });

  it('renders correctly at low end', () => {
    render(<FiftyTwoWeekRange low={100} high={200} current={100} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders correctly at high end', () => {
    render(<FiftyTwoWeekRange low={100} high={200} current={200} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('clamps a price outside the range', () => {
    render(<FiftyTwoWeekRange low={100} high={200} current={250} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders an em dash for an invalid range', () => {
    render(<FiftyTwoWeekRange low={0} high={100} current={50} />);
    // Missing data is "—" (DESIGN.md §5); it used to be a hyphen.
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('handles custom className', () => {
    const { container } = render(<FiftyTwoWeekRange low={100} high={200} current={150} className="custom-test" />);
    expect(container.firstChild).toHaveClass('custom-test');
  });

  it('hides labels when showLabels is false', () => {
    render(<FiftyTwoWeekRange low={100} high={200} current={150} showLabels={false} />);
    expect(screen.queryByText('$100.00')).not.toBeInTheDocument();
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });
});

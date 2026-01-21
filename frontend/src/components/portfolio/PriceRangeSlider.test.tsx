
import { render, screen, fireEvent } from '@testing-library/react';
import { PriceRangeSlider } from './PriceRangeSlider';
import { vi, describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

describe('PriceRangeSlider', () => {
  const mockOnChange = vi.fn();

  it('renders correctly with given props', () => {
    render(
      <PriceRangeSlider
        low={100}
        high={200}
        median={150}
        value={155}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('$155.00')).toBeInTheDocument();
    expect(screen.getByText('Range: $100.00 - $200.00')).toBeInTheDocument();
    expect(screen.getByText('MEDIAN')).toBeInTheDocument();
  });

  it('calls onChange when slider value changes', () => {
    render(
      <PriceRangeSlider
        low={100}
        high={200}
        median={150}
        value={155}
        onChange={mockOnChange}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '160' } });

    expect(mockOnChange).toHaveBeenCalledWith(160);
  });

  it('calculates median position correctly', () => {
    const { container } = render(
      <PriceRangeSlider
        low={100}
        high={200}
        median={150}
        value={155}
        onChange={mockOnChange}
      />
    );

    const medianMarker = screen.getByText('MEDIAN').parentElement;
    // median 150 in range 100-200 is 50%
    expect(medianMarker).toHaveStyle('left: 50%');
  });
});


import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';
import { describe, it, expect } from 'vitest';
import { Activity } from 'lucide-react';
import '@testing-library/jest-dom';

describe('StatCard', () => {
  it('renders correctly with required props', () => {
    render(<StatCard label="Test Stat" value="100" icon={Activity} />);
    
    expect(screen.getByText('Test Stat')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders change and trend icon correctly (positive)', () => {
    render(<StatCard label="Test Stat" value="100" icon={Activity} change="+10%" isPositive={true} />);
    
    expect(screen.getByText('+10%')).toBeInTheDocument();
    expect(screen.getByText('vs yesterday')).toBeInTheDocument();
    // TrendingUp should be present (tested via class or presence)
    expect(screen.getByText('+10%')).toHaveClass('text-emerald-400');
  });

  it('renders change and trend icon correctly (negative)', () => {
    render(<StatCard label="Test Stat" value="100" icon={Activity} change="-10%" isPositive={false} />);
    
    expect(screen.getByText('-10%')).toBeInTheDocument();
    expect(screen.getByText('-10%')).toHaveClass('text-red-400');
  });

  it('applies color classes correctly', () => {
    const { container } = render(<StatCard label="Test Stat" value="100" icon={Activity} color="purple" />);
    // Background color class on the icon wrapper
    const wrapper = container.querySelector('.bg-purple-500\\/10');
    expect(wrapper).toBeInTheDocument();
  });
});


import { render, screen, fireEvent } from '@testing-library/react';
import { StatPill } from './StatPill';
import { vi, describe, it, expect } from 'vitest';
import { Activity } from 'lucide-react';
import '@testing-library/jest-dom';

describe('StatPill', () => {
  const mockOnClick = vi.fn();

  it('renders correctly with required props', () => {
    render(<StatPill label="Positions" value="25" icon={Activity} />);
    
    expect(screen.getByText('Positions')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('renders subValue when provided', () => {
    render(<StatPill label="Gain" value="$500" subValue={<span>+10%</span>} icon={Activity} />);
    expect(screen.getByText('+10%')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    render(<StatPill label="Clickable" value="10" icon={Activity} onClick={mockOnClick} />);
    
    const pill = screen.getByText('Clickable').closest('div');
    fireEvent.click(pill!);
    
    expect(mockOnClick).toHaveBeenCalled();
  });

  it('applies active styles when isActive is true', () => {
    const { container } = render(<StatPill label="Active" value="10" icon={Activity} isActive={true} />);
    const pill = container.firstChild;
    expect(pill).toHaveClass('bg-accent/10');
    expect(pill).toHaveClass('border-primary/50');
  });

  it('applies gradient border style', () => {
    const { container } = render(<StatPill label="Gradient" value="10" icon={Activity} tone="rose" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.style.background).toContain('linear-gradient(90deg, #f472b6, #e11d48)');
  });
});


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
    // Selection is a tint, not an outline.
    expect(pill).toHaveClass('bg-signal/10');
    expect(pill).not.toHaveClass('border');
  });

  it('marks the tile with its tone and tints the icon to match', () => {
    const { container } = render(<StatPill label="Tone" value="10" icon={Activity} tone="rose" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill).toHaveAttribute('data-tone', 'rose');
    expect(pill.querySelector('svg')).toHaveClass('text-rose-600');
  });

  it('sets figures in the mono face and words in the UI face', () => {
    const { rerender } = render(<StatPill label="Value" value="$54,627" icon={Activity} />);
    expect(screen.getByText('$54,627')).toHaveClass('num');
    rerender(<StatPill label="Value" value="Latest Feed" icon={Activity} />);
    expect(screen.getByText('Latest Feed')).not.toHaveClass('num');
  });
});

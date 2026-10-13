import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScrollX } from './ScrollX';

describe('ScrollX', () => {
  it('wraps its content in a labelled, horizontally scrollable region', () => {
    render(
      <ScrollX label="Analyst ratings" className="outer">
        <table><tbody><tr><td>cell</td></tr></tbody></table>
      </ScrollX>,
    );
    const region = screen.getByRole('region', { name: 'Analyst ratings' });
    expect(region.className).toContain('overflow-x-auto');
    expect(region).toContainElement(screen.getByText('cell'));
    expect(region.parentElement).toHaveClass('outer');
  });

  it('is not a tab stop while there is nothing to scroll', () => {
    render(<ScrollX label="Table"><span>fits</span></ScrollX>);
    // jsdom has no layout, so the content never overflows.
    expect(screen.getByRole('region', { name: 'Table' })).not.toHaveAttribute('tabindex');
  });
});

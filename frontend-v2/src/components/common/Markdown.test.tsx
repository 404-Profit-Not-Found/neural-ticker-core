import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { Markdown } from './Markdown';

const renderMd = (md: string, props: Partial<React.ComponentProps<typeof Markdown>> = {}) =>
  render(
    <MemoryRouter>
      <Markdown {...props}>{md}</Markdown>
    </MemoryRouter>,
  );

describe('Markdown', () => {
  it('routes in-app links through the router and opens external ones in a new tab', () => {
    renderMd('See [NVDA](/ticker/NVDA) and [the filing](https://www.sec.gov/x).');

    const internal = screen.getByRole('link', { name: 'NVDA' });
    expect(internal).toHaveAttribute('href', '/ticker/NVDA');
    expect(internal).not.toHaveAttribute('target');

    const external = screen.getByRole('link', { name: 'the filing' });
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders unsafe link targets as plain text', () => {
    renderMd('[click](mailto:someone@example.com) and [proto](//evil.example/x)');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/click/)).toBeInTheDocument();
  });

  it('puts every table in its own horizontal scroll region', () => {
    renderMd('| Ticker | P/E |\n| --- | ---: |\n| NVDA | 56.9 |');

    const region = screen.getByRole('region', { name: 'Table' });
    expect(region.className).toContain('overflow-x-auto');
    expect(within(region).getByRole('table')).toBeInTheDocument();
    expect(within(region).getByText('56.9')).toBeInTheDocument();
  });

  it('gives section headings anchors for the table of contents', () => {
    renderMd('## 1. Executive Summary\n\ntext\n\n### 2.1 Bears');
    expect(screen.getByRole('heading', { level: 2, name: '1. Executive Summary' })).toHaveAttribute('id', 'md-1-executive-summary');
    expect(screen.getByRole('heading', { level: 3, name: '2.1 Bears' })).toHaveAttribute('id', 'md-2-1-bears');
  });

  it('drops a leading H1 that repeats the page title, and keeps a different one', () => {
    const { unmount } = renderMd('# My Note\n\nBody', { stripTitle: 'My note' });
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByText('Body')).toBeInTheDocument();
    unmount();

    renderMd('# Another heading\n\nBody', { stripTitle: 'My note' });
    expect(screen.getByRole('heading', { level: 1, name: 'Another heading' })).toBeInTheDocument();
  });

  it('colours sentiment tags only when asked to', () => {
    const md = '**NVDA (BULLISH)** and TSLA (BEARISH), INTC (Mixed)';
    const { unmount } = renderMd(md, { highlightSentiment: true });
    expect(screen.getByText('(BULLISH)')).toHaveClass('text-up');
    expect(screen.getByText('(BEARISH)')).toHaveClass('text-down');
    expect(screen.getByText('(Mixed)').className).toContain('yellow');
    unmount();

    renderMd(md);
    expect(screen.queryByText('(BULLISH)')).toBeNull();
    expect(screen.getByText(/NVDA \(BULLISH\)/)).toBeInTheDocument();
  });

  it('keeps single newlines as line breaks only in `breaks` mode', () => {
    const { container, unmount } = renderMd('line one\nline two', { breaks: true });
    expect(container.querySelector('br')).not.toBeNull();
    unmount();

    const plain = renderMd('line one\nline two');
    expect(plain.container.querySelector('br')).toBeNull();
  });

  it('renders GFM task lists and fenced code', () => {
    const { container } = renderMd('- [x] done\n- [ ] open\n\n```py\nprint(1)\n```');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(container.querySelector('ul')?.className).toContain('contains-task-list');
    expect(container.querySelector('pre')?.className).toContain('overflow-x-auto');
  });

  it('applies the reading measure unless it is turned off', () => {
    const { container, unmount } = renderMd('text');
    expect((container.firstChild as HTMLElement).className).toContain('max-w-[72ch]');
    unmount();
    const wide = renderMd('text', { measure: false });
    expect((wide.container.firstChild as HTMLElement).className).not.toContain('max-w-[72ch]');
  });
});

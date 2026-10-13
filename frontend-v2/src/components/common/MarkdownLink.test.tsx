import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import '@testing-library/jest-dom';
import { MarkdownLink } from './MarkdownLink';

function renderMarkdown(markdown: string, basename?: string) {
  return render(
    <MemoryRouter basename={basename} initialEntries={[basename ? `${basename}/` : '/']}>
      <ReactMarkdown components={{ a: MarkdownLink }}>{markdown}</ReactMarkdown>
    </MemoryRouter>,
  );
}

describe('MarkdownLink', () => {
  it('routes in-app paths through the router, honouring the app base path', () => {
    renderMarkdown('[NVDA](/ticker/NVDA)', '/v2');
    const link = screen.getByRole('link', { name: 'NVDA' });
    expect(link).toHaveAttribute('href', '/v2/ticker/NVDA');
    expect(link).not.toHaveAttribute('target');
  });

  it('opens http(s) links in a new tab without an opener reference', () => {
    renderMarkdown('[source](https://example.com/filing?id=1)');
    const link = screen.getByRole('link', { name: 'source' });
    expect(link).toHaveAttribute('href', 'https://example.com/filing?id=1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each([
    ['javascript', '[x](javascript:alert(1))'],
    ['data', '[x](data:text/html;base64,PHNjcmlwdD4=)'],
    ['protocol-relative', '[x](//evil.example/phish)'],
    ['vbscript', '[x](vbscript:msgbox(1))'],
  ])('renders %s URLs as plain text, never as a link', (_name, markdown) => {
    renderMarkdown(markdown);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('x')).toBeInTheDocument();
  });

  it('does not leak the markdown AST node onto the DOM element', () => {
    renderMarkdown('[source](https://example.com)');
    expect(screen.getByRole('link')).not.toHaveAttribute('node');
  });
});

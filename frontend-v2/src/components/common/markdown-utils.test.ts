import { describe, it, expect } from 'vitest';
import { extractHeadings, headingId, stripLeadingTitle } from './markdown-utils';

describe('headingId', () => {
  it('builds a stable, URL-safe id', () => {
    expect(headingId('1. Executive Summary')).toBe('md-1-executive-summary');
    expect(headingId('Risk/Reward Profile')).toBe('md-risk-reward-profile');
    expect(headingId('  Business & Moat  ')).toBe('md-business-moat');
  });

  it('strips accents instead of dropping the letters', () => {
    expect(headingId('Zhrnutie – príležitosť')).toBe('md-zhrnutie-prilezitost');
  });

  it('never returns an empty id', () => {
    expect(headingId('—')).toBe('md-section');
    expect(headingId('')).toBe('md-section');
  });
});

describe('extractHeadings', () => {
  it('returns ## and ### headings with their ids, in order', () => {
    const md = '# Title\n\n## 1. Summary\ntext\n\n### 1.1 Detail\n\n## 2. **Bold** `code` [link](http://x.y)\n\n#### too deep';
    expect(extractHeadings(md)).toEqual([
      { depth: 2, text: '1. Summary', id: 'md-1-summary' },
      { depth: 3, text: '1.1 Detail', id: 'md-1-1-detail' },
      { depth: 2, text: '2. Bold code link', id: 'md-2-bold-code-link' },
    ]);
  });

  it('ignores headings inside fenced code', () => {
    const md = '## Real\n\n```md\n## Not a heading\n```\n\n~~~\n## Nor this\n~~~\n\n## Also real';
    expect(extractHeadings(md).map((h) => h.text)).toEqual(['Real', 'Also real']);
  });

  it('returns nothing for a document without sections', () => {
    expect(extractHeadings('just a paragraph')).toEqual([]);
    expect(extractHeadings('')).toEqual([]);
  });
});

describe('stripLeadingTitle', () => {
  const md = '# NVDA: Demand Is Supply-Constrained\n\nBody text.\n\n# Later H1';

  it('removes a leading H1 that repeats the page title', () => {
    expect(stripLeadingTitle(md, 'NVDA: Demand is supply constrained')).toBe('Body text.\n\n# Later H1');
  });

  it('keeps a leading H1 that says something else', () => {
    expect(stripLeadingTitle(md, 'A different title')).toBe(md);
  });

  it('removes any leading H1 when asked to', () => {
    expect(stripLeadingTitle(md, true)).toBe('Body text.\n\n# Later H1');
  });

  it('leaves the document alone without a title or without a leading H1', () => {
    expect(stripLeadingTitle(md, undefined)).toBe(md);
    expect(stripLeadingTitle(md, false)).toBe(md);
    expect(stripLeadingTitle('Intro\n\n# Title', 'Title')).toBe('Intro\n\n# Title');
    expect(stripLeadingTitle('## Title', 'Title')).toBe('## Title');
  });
});

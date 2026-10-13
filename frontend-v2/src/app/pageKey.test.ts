import { describe, expect, it } from 'vitest';
import { pageKey } from './pageKey';

describe('pageKey', () => {
  it('is the same for every tab of one ticker', () => {
    const keys = ['/ticker/NVDA', '/ticker/NVDA/', '/ticker/NVDA/overview', '/ticker/NVDA/research', '/ticker/NVDA/financials', '/ticker/NVDA/news', '/ticker/NVDA/social'].map(pageKey);
    expect(new Set(keys).size).toBe(1);
  });

  it('differs between tickers', () => {
    expect(pageKey('/ticker/NVDA/research')).not.toBe(pageKey('/ticker/AMD/research'));
  });

  it('treats a research note as its own page', () => {
    expect(pageKey('/ticker/NVDA/research/abc')).toBe('/ticker/NVDA/research/abc');
    expect(pageKey('/ticker/NVDA/research/abc')).not.toBe(pageKey('/ticker/NVDA/research'));
  });

  it('is the path everywhere else', () => {
    expect(pageKey('/portfolio')).toBe('/portfolio');
    expect(pageKey('/')).toBe('/');
  });
});

import { legacyV2RedirectTarget } from './legacy-v2-redirect.util';

describe('legacyV2RedirectTarget', () => {
  it('maps an old /v2 page to the same page at the root', () => {
    expect(legacyV2RedirectTarget('/')).toBe('/');
    expect(legacyV2RedirectTarget('')).toBe('/');
    expect(legacyV2RedirectTarget(undefined)).toBe('/');
    expect(legacyV2RedirectTarget('/portfolio')).toBe('/portfolio');
    expect(legacyV2RedirectTarget('/ticker/NVDA/research/12?x=1')).toBe(
      '/ticker/NVDA/research/12?x=1',
    );
  });

  it('never produces a redirect to another origin', () => {
    for (const hostile of [
      '//evil.example',
      '///evil.example/path',
      '/\\evil.example',
      '\\\\evil.example',
      '/\\/evil.example',
    ]) {
      const target = legacyV2RedirectTarget(hostile);
      // One leading slash, then a path segment — never "//" or "/\\".
      expect(target).toMatch(/^\/[^/\\]/);
      expect(new URL(target, 'https://app.example').origin).toBe(
        'https://app.example',
      );
    }
  });
});

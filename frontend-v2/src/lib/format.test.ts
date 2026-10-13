import { describe, it, expect } from 'vitest';
import {
  EM_DASH,
  MINUS,
  directionClass,
  directionOf,
  formatAbsPercent,
  formatAxisPrice,
  formatChangePercent,
  formatCompactCurrency,
  formatCompactNumber,
  formatCount,
  formatFraction,
  formatPrice,
  formatRatio,
  formatSharesOutstanding,
  formatTarget,
  priceDecimals,
  shortExchange,
  toNumber,
} from './format';

describe('toNumber', () => {
  it('accepts finite numbers', () => {
    expect(toNumber(0)).toBe(0);
    expect(toNumber(-1.5)).toBe(-1.5);
  });

  it('parses numeric strings (NUMERIC columns arrive as strings)', () => {
    expect(toNumber('0.81')).toBe(0.81);
    expect(toNumber(' 42 ')).toBe(42);
  });

  it('rejects everything that is not a real number', () => {
    for (const value of [null, undefined, '', '   ', 'abc', NaN, Infinity, -Infinity, {}, [], true]) {
      expect(toNumber(value)).toBeNull();
    }
  });
});

describe('formatPrice', () => {
  it('prints two decimals for ordinary prices', () => {
    expect(formatPrice(121.4)).toBe('$121.40');
    expect(formatPrice(2612.5)).toBe('$2,612.50');
    expect(formatPrice(689420)).toBe('$689,420.00');
  });

  it('keeps four decimals below one unit so penny stocks stay meaningful', () => {
    expect(formatPrice(0.1834)).toBe('$0.1834');
    expect(formatPrice(0.5)).toBe('$0.50');
    expect(formatPrice(0.00012)).toBe('$0.0001');
  });

  it('formats zero as a price, not as missing', () => {
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('uses the instrument currency and defaults to USD', () => {
    expect(formatPrice(58.4, 'EUR')).toBe('€58.40');
    expect(formatPrice(25.84, 'gbp')).toBe('£25.84');
    expect(formatPrice(2612.5, 'JPY')).toBe('¥2,612.50');
    expect(formatPrice(10, null)).toBe('$10.00');
    expect(formatPrice(10, 'not-a-code')).toBe('$10.00');
  });

  it('does not throw on a well-formed but unknown currency code', () => {
    expect(() => formatPrice(10, 'ZZZ')).not.toThrow();
    expect(formatPrice(10, 'ZZZ')).toContain('10.00');
  });

  it('prints an em dash for missing or unusable values', () => {
    expect(formatPrice(null)).toBe(EM_DASH);
    expect(formatPrice(undefined)).toBe(EM_DASH);
    expect(formatPrice(NaN)).toBe(EM_DASH);
    expect(formatPrice('')).toBe(EM_DASH);
    expect(formatPrice('n/a')).toBe(EM_DASH);
  });

  it('accepts numeric strings', () => {
    expect(formatPrice('121.4')).toBe('$121.40');
  });

  it('shortens only large values in compact mode', () => {
    expect(formatPrice(689420, 'USD', { compact: true })).toBe('$689.4K');
    expect(formatPrice(490100, 'USD', { compact: true })).toBe('$490.1K');
    expect(formatPrice(2612.5, 'JPY', { compact: true })).toBe('¥2,613');
    // Under 1,000 nothing is dropped.
    expect(formatPrice(121.4, 'USD', { compact: true })).toBe('$121.40');
    expect(formatPrice(0.1834, 'USD', { compact: true })).toBe('$0.1834');
  });

  it('handles negative values', () => {
    expect(formatPrice(-12.5)).toBe('-$12.50');
  });
});

describe('formatTarget', () => {
  it('formats a real target like a price', () => {
    expect(formatTarget(159.64)).toBe('$159.64');
    expect(formatTarget(0.25)).toBe('$0.25');
  });

  it('treats zero, negative and missing targets as "no target"', () => {
    expect(formatTarget(0)).toBe(EM_DASH);
    expect(formatTarget(-5)).toBe(EM_DASH);
    expect(formatTarget(null)).toBe(EM_DASH);
    expect(formatTarget(undefined)).toBe(EM_DASH);
  });
});

describe('priceDecimals', () => {
  it('is 4 below one unit and 2 otherwise', () => {
    expect(priceDecimals(0.18)).toBe(4);
    expect(priceDecimals(-0.5)).toBe(4);
    expect(priceDecimals(1)).toBe(2);
    expect(priceDecimals(1500)).toBe(2);
    expect(priceDecimals(0)).toBe(2);
  });
});

describe('formatCompactCurrency / formatCompactNumber', () => {
  it('abbreviates large amounts', () => {
    expect(formatCompactCurrency(2_978_000_000_000)).toBe('$2.98T');
    expect(formatCompactCurrency(318_227_121_894)).toBe('$318.23B');
    expect(formatCompactCurrency(12_000_000)).toBe('$12M');
    expect(formatCompactCurrency(41_200_000_000_000, 'JPY')).toBe('¥41.2T');
  });

  it('respects the fraction-digit cap', () => {
    expect(formatCompactCurrency(2_978_000_000_000, 'USD', 1)).toBe('$3T');
    expect(formatCompactCurrency(4_740_000_000_000, 'USD', 1)).toBe('$4.7T');
  });

  it('abbreviates plain numbers', () => {
    expect(formatCompactNumber(24_530_477_800)).toBe('24.53B');
    expect(formatCompactNumber(950)).toBe('950');
  });

  it('prints an em dash when there is no value', () => {
    expect(formatCompactCurrency(null)).toBe(EM_DASH);
    expect(formatCompactCurrency(undefined)).toBe(EM_DASH);
    expect(formatCompactNumber('x')).toBe(EM_DASH);
  });
});

describe('formatSharesOutstanding', () => {
  it('converts the API value (millions of shares) to a share count', () => {
    // NVDA: 24,530.4778 million shares → 24.53 billion (was rendered "25K").
    expect(formatSharesOutstanding(24530.4778)).toBe('24.53B');
    expect(formatSharesOutstanding(1.5)).toBe('1.5M');
    expect(formatSharesOutstanding('15770.33')).toBe('15.77B');
  });

  it('prints an em dash for missing, zero or negative counts', () => {
    expect(formatSharesOutstanding(null)).toBe(EM_DASH);
    expect(formatSharesOutstanding(undefined)).toBe(EM_DASH);
    expect(formatSharesOutstanding(0)).toBe(EM_DASH);
    expect(formatSharesOutstanding(-3)).toBe(EM_DASH);
  });
});

describe('formatCount / formatRatio', () => {
  it('groups thousands', () => {
    expect(formatCount(14748)).toBe('14,748');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1234.6)).toBe('1,235');
    expect(formatCount(null)).toBe(EM_DASH);
  });

  it('prints ratios with fixed decimals', () => {
    expect(formatRatio(56.9)).toBe('56.90');
    expect(formatRatio(6.2882, 1)).toBe('6.3');
    expect(formatRatio(0)).toBe('0.00');
    expect(formatRatio(null)).toBe(EM_DASH);
    expect(formatRatio(undefined)).toBe(EM_DASH);
  });
});

describe('formatFraction', () => {
  it('turns a fraction into a percentage without a plus sign', () => {
    expect(formatFraction(0.4175)).toBe('41.75%');
    expect(formatFraction(0.0003)).toBe('0.03%');
    expect(formatFraction(1)).toBe('100.00%');
    expect(formatFraction(0.52, 1)).toBe('52.0%');
  });

  it('uses a real minus sign for negatives', () => {
    expect(formatFraction(-0.1234)).toBe(`${MINUS}12.34%`);
  });

  it('never shows a sign on a value that rounds to zero', () => {
    expect(formatFraction(0)).toBe('0.00%');
    expect(formatFraction(-0.00001)).toBe('0.00%');
  });

  it('prints an em dash when there is no value', () => {
    expect(formatFraction(null)).toBe(EM_DASH);
    expect(formatFraction(undefined)).toBe(EM_DASH);
  });
});

describe('formatChangePercent / formatAbsPercent', () => {
  it('always signs a change', () => {
    expect(formatChangePercent(2.84)).toBe('+2.84%');
    expect(formatChangePercent(-1.04)).toBe(`${MINUS}1.04%`);
    expect(formatChangePercent(31.5, 1)).toBe('+31.5%');
  });

  it('shows zero without a sign, including values that round to zero', () => {
    expect(formatChangePercent(0)).toBe('0.00%');
    expect(formatChangePercent(0.004)).toBe('0.00%');
    expect(formatChangePercent(-0.004)).toBe('0.00%');
  });

  it('prints the magnitude only next to an arrow', () => {
    expect(formatAbsPercent(-3.41)).toBe('3.41%');
    expect(formatAbsPercent(5.87)).toBe('5.87%');
    expect(formatAbsPercent(10.46, 1)).toBe('10.5%');
  });

  it('prints an em dash when there is no value', () => {
    expect(formatChangePercent(null)).toBe(EM_DASH);
    expect(formatAbsPercent(undefined)).toBe(EM_DASH);
  });
});

describe('directionOf / directionClass', () => {
  it('classifies by the displayed value', () => {
    expect(directionOf(2.84)).toBe('up');
    expect(directionOf(-0.44)).toBe('down');
  });

  it('treats exactly zero — and anything that displays as zero — as flat', () => {
    expect(directionOf(0)).toBe('flat');
    expect(directionOf(0.004)).toBe('flat');
    expect(directionOf(-0.004)).toBe('flat');
    expect(directionOf(0.04, 1)).toBe('flat');
  });

  it('treats missing values as flat', () => {
    expect(directionOf(null)).toBe('flat');
    expect(directionOf(undefined)).toBe('flat');
    expect(directionOf('abc')).toBe('flat');
  });

  it('maps to the theme-aware direction colours; flat is never green', () => {
    expect(directionClass('up')).toBe('text-up');
    expect(directionClass('down')).toBe('text-down');
    expect(directionClass('flat')).toBe('text-muted-foreground');
  });
});

describe('formatAxisPrice', () => {
  it('keeps ordinary prices exact', () => {
    expect(formatAxisPrice(121.4)).toBe('121.40');
    expect(formatAxisPrice(2612.5)).toBe('2,612.50');
  });

  it('abbreviates five figures and up so the scale stays narrow', () => {
    expect(formatAxisPrice(689420)).toBe('689.4K');
    expect(formatAxisPrice(700000)).toBe('700.0K');
    expect(formatAxisPrice(10000)).toBe('10.0K');
  });

  it('keeps sub-unit precision', () => {
    expect(formatAxisPrice(0.1834)).toBe('0.1834');
  });

  it('returns an empty label for a non-number', () => {
    expect(formatAxisPrice(NaN)).toBe('');
    expect(formatAxisPrice(null)).toBe('');
  });
});

describe('shortExchange', () => {
  it('shortens the data vendor’s legal names', () => {
    expect(shortExchange('NASDAQ NMS - GLOBAL MARKET')).toBe('NASDAQ');
    expect(shortExchange('NASDAQ CAPITAL MARKET')).toBe('NASDAQ');
    expect(shortExchange('NEW YORK STOCK EXCHANGE, INC.')).toBe('NYSE');
    expect(shortExchange('NYSE ARCA')).toBe('NYSE ARCA');
    expect(shortExchange('London Stock Exchange')).toBe('LSE');
  });

  it('keeps codes that are already short', () => {
    expect(shortExchange('XETRA')).toBe('XETRA');
    expect(shortExchange('AMS')).toBe('AMS');
    expect(shortExchange('TSE')).toBe('TSE');
  });

  it('never returns more than a chip’s worth of text', () => {
    expect(shortExchange('SOME VERY LONG UNKNOWN EXCHANGE NAME').length).toBeLessThanOrEqual(14);
  });

  it('returns an empty string when there is no exchange', () => {
    expect(shortExchange(undefined)).toBe('');
    expect(shortExchange(null)).toBe('');
    expect(shortExchange('')).toBe('');
  });
});

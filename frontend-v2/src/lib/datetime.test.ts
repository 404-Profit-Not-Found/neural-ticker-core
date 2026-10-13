import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateRange,
  formatDateShort,
  formatDateTime,
  formatRelative,
  formatTimeAgo,
  formatTime,
  isoDateTime,
  toDate,
} from './datetime';

const UTC = { timeZone: 'UTC' } as const;
const NOW = '2026-10-13T12:00:00Z';
const at = (now: string = NOW) => ({ timeZone: 'UTC', now });

describe('toDate', () => {
  it('parses ISO strings and Date objects', () => {
    expect(toDate('2026-10-13T09:22:00Z')?.toISOString()).toBe('2026-10-13T09:22:00.000Z');
    const d = new Date('2026-01-02T03:04:05Z');
    expect(toDate(d)).toBe(d);
  });

  it('treats small numbers as Unix seconds and large ones as milliseconds', () => {
    expect(toDate(1791881189)?.toISOString()).toBe(new Date(1791881189 * 1000).toISOString());
    expect(toDate(1791881189000)?.toISOString()).toBe(new Date(1791881189000).toISOString());
  });

  it('parses epochs that arrive as strings', () => {
    expect(toDate('1791881189')?.getTime()).toBe(1791881189 * 1000);
    expect(toDate('1791881189000')?.getTime()).toBe(1791881189000);
  });

  it('returns null for missing or unparseable input', () => {
    for (const value of [null, undefined, '', '   ', 'not a date', NaN, Infinity, new Date('nope')]) {
      expect(toDate(value)).toBeNull();
    }
  });
});

describe('formatDate', () => {
  it('prints day-first with a short month and the year', () => {
    expect(formatDate('2026-10-13T09:22:00Z', UTC)).toBe('13 Oct 2026');
    expect(formatDate('2026-09-28T00:00:00Z', UTC)).toBe('28 Sep 2026');
    expect(formatDate('2025-01-01', UTC)).toBe('1 Jan 2025');
  });

  it('respects the time zone', () => {
    // 23:30 UTC on the 12th is already the 13th in Bratislava.
    expect(formatDate('2026-10-12T23:30:00Z', { timeZone: 'Europe/Bratislava' })).toBe('13 Oct 2026');
    expect(formatDate('2026-10-12T23:30:00Z', UTC)).toBe('12 Oct 2026');
  });

  it('prints an em dash instead of "Invalid Date"', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('garbage')).toBe('—');
  });
});

describe('formatDateShort', () => {
  it('drops the year for the current year only', () => {
    expect(formatDateShort('2026-10-07T10:00:00Z', at())).toBe('7 Oct');
    expect(formatDateShort('2025-10-07T10:00:00Z', at())).toBe('7 Oct 2025');
    expect(formatDateShort('2027-01-02T10:00:00Z', at())).toBe('2 Jan 2027');
  });

  it('prints an em dash for bad input', () => {
    expect(formatDateShort(undefined, at())).toBe('—');
  });
});

describe('formatTime / formatDateTime', () => {
  it('uses a 24-hour clock without seconds', () => {
    expect(formatTime('2026-10-13T09:22:41Z', UTC)).toBe('09:22');
    expect(formatTime('2026-10-13T17:05:59Z', UTC)).toBe('17:05');
    expect(formatTime('2026-10-13T00:00:00Z', UTC)).toBe('00:00');
  });

  it('joins date and time', () => {
    expect(formatDateTime('2026-10-13T05:39:57Z', at())).toBe('13 Oct, 05:39');
    expect(formatDateTime('2024-03-04T18:01:00Z', at())).toBe('4 Mar 2024, 18:01');
  });

  it('accepts Unix seconds', () => {
    expect(formatDateTime(Date.UTC(2026, 9, 13, 9, 22) / 1000, at())).toBe('13 Oct, 09:22');
  });

  it('prints an em dash for bad input', () => {
    expect(formatTime('x')).toBe('—');
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('formatTimeAgo', () => {
  const ago = (ms: number) => new Date(new Date(NOW).getTime() - ms);
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('counts minutes and hours within a day', () => {
    expect(formatTimeAgo(ago(30_000), at())).toBe('just now');
    expect(formatTimeAgo(ago(12 * MIN), at())).toBe('12m ago');
    expect(formatTimeAgo(ago(5 * HOUR), at())).toBe('5h ago');
  });

  it('counts days however long ago — it never turns into a date', () => {
    expect(formatTimeAgo(ago(3 * DAY), at())).toBe('3d ago');
    expect(formatTimeAgo(ago(214 * DAY), at())).toBe('214d ago');
  });

  it('prints an em dash for a missing date and never a negative duration', () => {
    expect(formatTimeAgo(null)).toBe('—');
    expect(formatTimeAgo(ago(-5 * MIN), at())).toBe('just now');
  });
});

describe('formatRelative', () => {
  const ago = (ms: number) => new Date(new Date(NOW).getTime() - ms);
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('says "just now" under a minute', () => {
    expect(formatRelative(ago(0), at())).toBe('just now');
    expect(formatRelative(ago(59_000), at())).toBe('just now');
  });

  it('counts minutes, hours and days', () => {
    expect(formatRelative(ago(MIN), at())).toBe('1m ago');
    expect(formatRelative(ago(59 * MIN), at())).toBe('59m ago');
    expect(formatRelative(ago(HOUR), at())).toBe('1h ago');
    expect(formatRelative(ago(5 * HOUR + 20 * MIN), at())).toBe('5h ago');
    expect(formatRelative(ago(23 * HOUR + 59 * MIN), at())).toBe('23h ago');
    expect(formatRelative(ago(DAY), at())).toBe('1d ago');
    expect(formatRelative(ago(6 * DAY + 23 * HOUR), at())).toBe('6d ago');
  });

  it('switches to a date from seven days on', () => {
    expect(formatRelative(ago(7 * DAY), at())).toBe('6 Oct');
    expect(formatRelative('2025-06-26T12:00:00Z', at())).toBe('26 Jun 2025');
  });

  it('absorbs small clock skew but shows real future dates as dates', () => {
    expect(formatRelative(ago(-30_000), at())).toBe('just now');
    expect(formatRelative('2026-10-31T12:00:00Z', at())).toBe('31 Oct');
  });

  it('accepts Unix seconds (news feed timestamps)', () => {
    const fiveHoursAgo = (new Date(NOW).getTime() - 5 * HOUR) / 1000;
    expect(formatRelative(fiveHoursAgo, at())).toBe('5h ago');
  });

  it('prints an em dash for bad input', () => {
    expect(formatRelative(undefined, at())).toBe('—');
    expect(formatRelative('nope', at())).toBe('—');
  });
});

describe('formatDateRange', () => {
  it('omits the year inside the current year', () => {
    expect(formatDateRange('2026-09-28T12:00:00Z', '2026-10-12T12:00:00Z', at())).toBe('28 Sep – 12 Oct');
  });

  it('keeps the year when the range is in another year', () => {
    expect(formatDateRange('2023-01-01', '2023-01-02', at())).toBe('1 Jan – 2 Jan 2023');
  });

  it('spells out both years when they differ', () => {
    expect(formatDateRange('2025-12-20T12:00:00Z', '2026-01-05T12:00:00Z', at())).toBe('20 Dec 2025 – 5 Jan 2026');
  });

  it('falls back to the one date it has', () => {
    expect(formatDateRange('2026-09-28T12:00:00Z', null, at())).toBe('28 Sep');
    expect(formatDateRange(null, null, at())).toBe('—');
  });
});

describe('isoDateTime', () => {
  it('returns a machine-readable timestamp for <time dateTime>', () => {
    expect(isoDateTime(1791881189)).toBe(new Date(1791881189 * 1000).toISOString());
  });

  it('returns an empty string for bad input', () => {
    expect(isoDateTime('nope')).toBe('');
    expect(isoDateTime(null)).toBe('');
  });
});

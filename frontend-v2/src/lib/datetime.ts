// One way to print dates and times on the ticker, research and news pages.
//
// Before this module the same ticker page showed six formats ("10/13/2026",
// "10/13/2026, 5:36:24 AM", "Oct 13, 09:22 AM", "Oct 7, 26", "12 OCT, 14:45",
// "5h ago"). The rules now:
//   · recent things (< 7 days) are relative: "just now", "12m ago", "5h ago",
//     "3d ago";
//   · older things are a day-first date, unambiguous worldwide: "13 Oct" in
//     the current year, "13 Oct 2025" otherwise;
//   · clock times are 24-hour, never with seconds;
//   · something that cannot be parsed prints an em dash, not "Invalid Date".
//
// These pages are English-only, so the default locale is fixed (day-first
// English) instead of following the browser — the same date must not read
// "10/13" for one user and "13. 10." for another inside English copy. Pass
// `locale` for a translated surface.

export type DateInput = string | number | Date | null | undefined;

export interface DateFormatOptions {
  locale?: string;
  /** IANA zone; defaults to the browser's. Mainly for tests. */
  timeZone?: string;
  /** "Now" for relative output and same-year detection; defaults to the clock. */
  now?: DateInput;
}

// Month names come from en-US ("Sep", where en-GB prints "Sept"); the
// day-first order is assembled here, not taken from the locale.
export const DEFAULT_LOCALE = 'en-US';
const EM_DASH = '—';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Parse anything the API hands us: ISO strings, Date objects, Unix seconds
 * (Finnhub), Unix milliseconds, and either of those as a numeric string.
 */
export function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === '') return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;

  let value: string | number = input;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    // A bare number in a string is an epoch, not a year.
    value = /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : trimmed;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Below 1e11 it can only be seconds (1e11 ms is March 1973).
    const date = new Date(Math.abs(value) < 1e11 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parts(date: Date, options: Intl.DateTimeFormatOptions, opts: DateFormatOptions): Record<string, string> {
  const formatter = new Intl.DateTimeFormat(opts.locale ?? DEFAULT_LOCALE, {
    ...options,
    timeZone: opts.timeZone,
  });
  const out: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

function yearOf(date: Date, opts: DateFormatOptions): string {
  return parts(date, { year: 'numeric' }, opts).year;
}

/** "13 Oct 2026" — always with the year. */
export function formatDate(input: DateInput, opts: DateFormatOptions = {}): string {
  const date = toDate(input);
  if (!date) return EM_DASH;
  const p = parts(date, { day: 'numeric', month: 'short', year: 'numeric' }, opts);
  return `${p.day} ${p.month} ${p.year}`;
}

/** "13 Oct" in the current year, "13 Oct 2025" otherwise. */
export function formatDateShort(input: DateInput, opts: DateFormatOptions = {}): string {
  const date = toDate(input);
  if (!date) return EM_DASH;
  const now = toDate(opts.now) ?? new Date();
  const p = parts(date, { day: 'numeric', month: 'short', year: 'numeric' }, opts);
  return p.year === yearOf(now, opts) ? `${p.day} ${p.month}` : `${p.day} ${p.month} ${p.year}`;
}

/** "09:22" — 24-hour, no seconds. */
export function formatTime(input: DateInput, opts: DateFormatOptions = {}): string {
  const date = toDate(input);
  if (!date) return EM_DASH;
  const p = parts(date, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, opts);
  return `${p.hour}:${p.minute}`;
}

/** "13 Oct 2026, 09:22" (the year is dropped for the current year). */
export function formatDateTime(input: DateInput, opts: DateFormatOptions = {}): string {
  const date = toDate(input);
  if (!date) return EM_DASH;
  return `${formatDateShort(date, opts)}, ${formatTime(date, opts)}`;
}

/**
 * "just now" · "12m ago" · "5h ago" · "3d ago", then a short date from seven
 * days on. Timestamps slightly in the future (clock skew) read "just now".
 */
export function formatRelative(input: DateInput, opts: DateFormatOptions = {}): string {
  const date = toDate(input);
  if (!date) return EM_DASH;
  const now = toDate(opts.now) ?? new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < MINUTE) {
    // More than a minute ahead is a real future date, not skew.
    return diff > -MINUTE ? 'just now' : formatDateShort(date, opts);
  }
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return formatDateShort(date, opts);
}

/** "28 Sep – 12 Oct" (years are added only when they are needed). */
export function formatDateRange(start: DateInput, end: DateInput, opts: DateFormatOptions = {}): string {
  const from = toDate(start);
  const to = toDate(end);
  if (!from && !to) return EM_DASH;
  if (!from || !to) return formatDateShort(from ?? to, opts);
  const sameYear = yearOf(from, opts) === yearOf(to, opts);
  const left = sameYear ? formatDateShort(from, { ...opts, now: from }) : formatDate(from, opts);
  const right = sameYear ? formatDateShort(to, opts) : formatDate(to, opts);
  return `${left} – ${right}`;
}

/** Machine-readable value for `<time dateTime>`. Empty when unparseable. */
export function isoDateTime(input: DateInput): string {
  const date = toDate(input);
  return date ? date.toISOString() : '';
}

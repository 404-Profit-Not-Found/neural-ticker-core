// Real portfolio value history.
//
// The holdings chart is computed from facts only:
//   value(day)    = Σ over symbols of  shares held that day × that day's close
//   invested(day) = cost basis of the shares held that day (average-cost)
// Shares-per-day come from the trade ledger; closes come from daily candles.
// Nothing is interpolated or randomised. Where a fact is unavailable the
// series says so (`missingHistory`, `excluded`) instead of inventing a value.
//
// Everything here is pure and date-string based ("YYYY-MM-DD") so it can be
// unit-tested without a clock, a network, or a time zone.

export type Side = 'buy' | 'sell';

export interface HistoryPosition {
  symbol: string;
  shares: number;
  /** Average buy price in the position's own (native) currency. */
  buyPrice: number;
  /** YYYY-MM-DD; when unknown the position is treated as held all along. */
  buyDate?: string | null;
  /** Latest price in the native currency (used for the final, "today" point). */
  currentPrice: number;
  nativeCurrency: string;
}

export interface LedgerTrade {
  symbol: string;
  side: Side;
  shares: number;
  /** Execution price per share, native currency. */
  price: number;
  /** YYYY-MM-DD */
  date: string;
  currency: string;
}

export interface ClosePoint {
  /** YYYY-MM-DD */
  date: string;
  close: number;
}

export interface SeriesPoint {
  /** YYYY-MM-DD */
  date: string;
  /** Market value of the holdings on that day, display currency. */
  value: number;
  /** Cost basis of the shares held that day, display currency. */
  invested: number;
  bought?: string[];
  sold?: string[];
}

export interface PortfolioSeries {
  points: SeriesPoint[];
  /** Value change over the window that is NOT explained by money added/removed. */
  periodGain: number;
  /** periodGain relative to the capital at work during the window, in %. */
  periodGainPct: number;
  /** Held symbols for which no daily closes were available (valued at cost until today). */
  missingHistory: string[];
  /** Symbols left out because no exchange rate to the display currency exists. */
  excluded: string[];
}

export interface BuildSeriesInput {
  positions: HistoryPosition[];
  trades: LedgerTrade[];
  /** Daily closes per symbol, any order, native currency. */
  closes: Record<string, ClosePoint[] | undefined>;
  /** First day of the window (inclusive), YYYY-MM-DD. */
  startDate: string;
  /** Last day of the window (inclusive, "today"), YYYY-MM-DD. */
  endDate: string;
  /**
   * Multiplier from a native currency to the display currency, or null when
   * no rate exists. History is valued at today's rate: historical FX is not
   * available, and mixing dated prices with a single rate is at least
   * consistent with how the page totals are converted.
   */
  fx: (currency: string) => number | null;
}

interface Event {
  date: string;
  side: Side;
  shares: number;
  price: number;
}

const EPSILON = 1e-9;

/** Every calendar day from `start` to `end`, inclusive. */
export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return days;
  while (cursor.getTime() <= last.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** `date` shifted by `days` (may be negative). */
export function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Normalise a candle timestamp or date-ish string to YYYY-MM-DD (UTC). */
export function toDay(value: string | number | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Decide which events describe a symbol's holding over time.
 *
 * The ledger is authoritative when it adds up to what is actually held. It
 * will not when a position was created or edited outside the simulator (the
 * positions API allows direct edits), in which case the position rows
 * themselves are the only trustworthy statement: "N shares since buy date".
 */
function eventsFor(
  positions: HistoryPosition[],
  trades: LedgerTrade[],
  earliest: string,
): Event[] {
  const ledger: Event[] = trades
    .filter((t) => t.shares > 0 && toDay(t.date) !== null)
    .map((t) => ({ date: toDay(t.date) as string, side: t.side, shares: t.shares, price: t.price }))
    // Stable order: by day, buys before sells within a day.
    .sort((a, b) => (a.date === b.date ? (a.side === b.side ? 0 : a.side === 'buy' ? -1 : 1) : a.date < b.date ? -1 : 1));

  const held = positions.reduce((sum, p) => sum + p.shares, 0);
  const ledgerNet = ledger.reduce((sum, e) => sum + (e.side === 'buy' ? e.shares : -e.shares), 0);

  // Position shares are stored with 2 decimals, trades with 8: allow for the
  // rounding that accumulates per trade.
  const tolerance = 0.01 * (ledger.length + 1);
  const reconciles = Math.abs(ledgerNet - held) <= tolerance;

  if (ledger.length > 0 && (reconciles || held <= EPSILON)) return ledger;

  return positions
    .filter((p) => p.shares > 0)
    .map<Event>((p) => ({
      date: toDay(p.buyDate) ?? earliest,
      side: 'buy',
      shares: p.shares,
      price: p.buyPrice,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function buildPortfolioSeries(input: BuildSeriesInput): PortfolioSeries {
  const { positions, trades, closes, startDate, endDate, fx } = input;
  const days = eachDay(startDate, endDate);
  const empty: PortfolioSeries = {
    points: [],
    periodGain: 0,
    periodGainPct: 0,
    missingHistory: [],
    excluded: [],
  };
  if (days.length === 0) return empty;

  const value = new Array<number>(days.length).fill(0);
  const invested = new Array<number>(days.length).fill(0);
  const bought = new Map<string, Set<string>>();
  const sold = new Map<string, Set<string>>();
  const missingHistory: string[] = [];
  const excluded: string[] = [];
  // Money moved into (+) or out of (−) holdings strictly after the first day.
  let netFlow = 0;
  let grossBuys = 0;

  const symbols = new Set<string>([
    ...positions.map((p) => p.symbol),
    ...trades.map((t) => t.symbol),
  ]);
  // Sentinel for "held since before anything we chart".
  const earliest = shiftDay(startDate, -1);

  for (const symbol of symbols) {
    const symbolPositions = positions.filter((p) => p.symbol === symbol);
    const symbolTrades = trades.filter((t) => t.symbol === symbol);
    const events = eventsFor(symbolPositions, symbolTrades, earliest);
    if (events.length === 0) continue;

    const currency =
      symbolPositions[0]?.nativeCurrency ?? symbolTrades[0]?.currency ?? 'USD';
    const rate = fx(currency);
    if (rate === null || !Number.isFinite(rate) || rate <= 0) {
      excluded.push(symbol);
      continue;
    }

    const series = (closes[symbol] ?? [])
      .map((c) => ({ date: toDay(c.date), close: num(c.close) }))
      .filter((c): c is ClosePoint => c.date !== null && c.close > 0)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const heldNow = symbolPositions.reduce((sum, p) => sum + p.shares, 0);
    if (series.length === 0 && heldNow > EPSILON) missingHistory.push(symbol);

    const livePrice = symbolPositions.find((p) => p.currentPrice > 0)?.currentPrice ?? null;

    let shares = 0;
    let basis = 0; // native currency, average-cost
    let lastTradePrice = 0;
    let eventIndex = 0;
    let closeIndex = 0;
    let lastClose: number | null = null;

    const apply = (e: Event, dayIndex: number | null): void => {
      if (e.side === 'buy') {
        shares += e.shares;
        basis += e.shares * e.price;
      } else {
        const sellShares = Math.min(e.shares, shares);
        if (shares > EPSILON) basis -= basis * (sellShares / shares);
        shares -= sellShares;
        if (shares <= EPSILON) {
          shares = 0;
          basis = 0;
        }
      }
      lastTradePrice = e.price;

      // Flows and markers only for trades inside the window; the first day is
      // the baseline the period gain is measured from.
      if (dayIndex !== null) {
        const day = days[dayIndex];
        const bucket = e.side === 'buy' ? bought : sold;
        if (!bucket.has(day)) bucket.set(day, new Set());
        bucket.get(day)?.add(symbol);
        if (dayIndex > 0) {
          const amount = e.shares * e.price * rate;
          if (e.side === 'buy') {
            netFlow += amount;
            grossBuys += amount;
          } else {
            netFlow -= amount;
          }
        }
      }
    };

    // Everything that happened before the window sets the opening state.
    while (eventIndex < events.length && events[eventIndex].date < startDate) {
      apply(events[eventIndex], null);
      eventIndex += 1;
    }
    while (closeIndex < series.length && series[closeIndex].date < startDate) {
      lastClose = series[closeIndex].close;
      closeIndex += 1;
    }

    for (let i = 0; i < days.length; i += 1) {
      const day = days[i];
      while (eventIndex < events.length && events[eventIndex].date <= day) {
        apply(events[eventIndex], i);
        eventIndex += 1;
      }
      while (closeIndex < series.length && series[closeIndex].date <= day) {
        lastClose = series[closeIndex].close;
        closeIndex += 1;
      }
      if (shares <= EPSILON) continue;

      // Latest known close; before market data exists, the price actually
      // paid. The last day uses the live quote so the chart ends exactly at
      // the holdings value shown above it.
      const isToday = i === days.length - 1;
      const price =
        isToday && livePrice !== null ? livePrice : (lastClose ?? lastTradePrice);

      value[i] += shares * price * rate;
      invested[i] += basis * rate;
    }
  }

  const points: SeriesPoint[] = days.map((date, i) => {
    const point: SeriesPoint = { date, value: value[i], invested: invested[i] };
    const b = bought.get(date);
    const s = sold.get(date);
    if (b && b.size > 0) point.bought = [...b].sort();
    if (s && s.size > 0) point.sold = [...s].sort();
    return point;
  });

  const startValue = value[0];
  const endValue = value[value.length - 1];
  const periodGain = endValue - startValue - netFlow;
  const capital = startValue + grossBuys;
  const periodGainPct = capital > EPSILON ? (periodGain / capital) * 100 : 0;

  return {
    points,
    periodGain,
    periodGainPct,
    missingHistory: missingHistory.sort(),
    excluded: excluded.sort(),
  };
}

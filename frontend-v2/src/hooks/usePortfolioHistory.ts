import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { tickerKeys } from './useTicker';
import {
  buildPortfolioSeries,
  shiftDay,
  toDay,
  type ClosePoint,
  type HistoryPosition,
  type LedgerTrade,
  type PortfolioSeries,
} from '../lib/portfolio-history';

export const PORTFOLIO_RANGES = ['1W', '1M', '6M', '1Y'] as const;
export type PortfolioRange = (typeof PORTFOLIO_RANGES)[number];

const RANGE_DAYS: Record<PortfolioRange, number> = {
  '1W': 7,
  '1M': 30,
  '6M': 182,
  '1Y': 365,
};

// One daily-candle request per symbol covers every range (longest range plus
// a buffer so the first charted day can be forward-filled across a holiday).
const HISTORY_DAYS = 400;
const TRADES_PAGE = 500; // backend maximum
const TRADES_MAX_PAGES = 6;

/** Shape of a row from GET /portfolio/positions (only what the chart needs). */
export interface PortfolioPositionRow {
  symbol: string;
  shares: number | string;
  buy_price: number | string;
  buy_date?: string | null;
  current_price?: number | string | null;
  currency?: string | null;
  // Present when the backend converted the row to a display currency:
  original_currency?: string | null;
  original_buy_price?: number | string | null;
  original_current_price?: number | string | null;
  conversion_rate?: number | string | null;
  conversion_unavailable?: boolean;
}

interface TradeRow {
  symbol: string;
  side: 'buy' | 'sell';
  shares: number | string;
  price: number | string;
  trade_date: string;
  currency?: string | null;
}

interface CandleRow {
  ts?: string | number | null;
  close?: number | string | null;
}

export type PortfolioHistoryState =
  /** Prices or the ledger are still loading for the first time. */
  | { status: 'loading' }
  /** Holdings in several currencies with no display currency to add them up in. */
  | { status: 'mixed-currency' }
  | { status: 'ready'; series: PortfolioSeries; usesFxConversion: boolean };

const n = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function todayLocal(): string {
  const d = new Date();
  const pad = (v: number): string => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchAllTrades(): Promise<TradeRow[]> {
  const all: TradeRow[] = [];
  for (let page = 0; page < TRADES_MAX_PAGES; page += 1) {
    const { data } = await api.get<TradeRow[]>('/portfolio/trades', {
      params: { limit: TRADES_PAGE, offset: page * TRADES_PAGE },
    });
    const rows = Array.isArray(data) ? data : [];
    all.push(...rows);
    if (rows.length < TRADES_PAGE) break;
  }
  return all;
}

async function fetchCloses(symbol: string): Promise<ClosePoint[]> {
  const { data } = await api.get<CandleRow[]>(
    `/tickers/${encodeURIComponent(symbol)}/history`,
    { params: { interval: '1d', days: HISTORY_DAYS } },
  );
  if (!Array.isArray(data)) return [];
  const out: ClosePoint[] = [];
  for (const row of data) {
    const date = toDay(row?.ts);
    const close = n(row?.close);
    if (date && close > 0) out.push({ date, close });
  }
  return out;
}

/**
 * Real holdings history for the portfolio chart: the user's actual trade
 * ledger × actual daily closes. See lib/portfolio-history.ts for the maths.
 *
 * @param positions rows from GET /portfolio/positions as currently displayed
 * @param displayCurrency currency the page totals are shown in, or '' in
 *   "native" mode (each row in its own currency)
 */
export function usePortfolioHistory(
  positions: PortfolioPositionRow[],
  range: PortfolioRange,
  displayCurrency: string,
): PortfolioHistoryState {
  // Native-currency view of each held position + the rate the backend used to
  // convert it, so history is converted exactly like the page totals.
  const { held, rates, currencies } = useMemo(() => {
    const heldPositions: HistoryPosition[] = [];
    const rateByCurrency = new Map<string, number | null>();
    for (const p of positions) {
      const shares = n(p.shares);
      if (!p.symbol || shares <= 0) continue;
      const converted = p.conversion_rate != null && n(p.conversion_rate) > 0;
      const native = (
        (converted ? p.original_currency : p.currency) ||
        p.currency ||
        'USD'
      ).toUpperCase();
      heldPositions.push({
        symbol: p.symbol,
        shares,
        buyPrice: n(converted ? (p.original_buy_price ?? p.buy_price) : p.buy_price),
        buyDate: toDay(p.buy_date ?? null),
        currentPrice: n(
          converted ? (p.original_current_price ?? p.current_price) : p.current_price,
        ),
        nativeCurrency: native,
      });
      if (p.conversion_unavailable) rateByCurrency.set(native, null);
      else if (converted) rateByCurrency.set(native, n(p.conversion_rate));
      else if (!rateByCurrency.has(native)) rateByCurrency.set(native, 1);
    }
    return {
      held: heldPositions,
      rates: rateByCurrency,
      currencies: new Set(heldPositions.map((p) => p.nativeCurrency)),
    };
  }, [positions]);

  const display = displayCurrency.toUpperCase();
  const mixedCurrency = display === '' && currencies.size > 1;

  const tradesQuery = useQuery({
    // Under the ['portfolio'] prefix so every buy/sell invalidation refreshes it.
    queryKey: ['portfolio', 'trades', 'ledger'],
    queryFn: fetchAllTrades,
    staleTime: 60_000,
    enabled: !mixedCurrency,
  });

  const endDate = todayLocal();
  const windowStart = shiftDay(endDate, -HISTORY_DAYS);

  const trades = useMemo<LedgerTrade[]>(() => {
    const out: LedgerTrade[] = [];
    for (const t of tradesQuery.data ?? []) {
      const date = toDay(t.trade_date);
      if (!t.symbol || !date || (t.side !== 'buy' && t.side !== 'sell')) continue;
      out.push({
        symbol: t.symbol,
        side: t.side,
        shares: n(t.shares),
        price: n(t.price),
        date,
        currency: (t.currency || 'USD').toUpperCase(),
      });
    }
    return out;
  }, [tradesQuery.data]);

  // Held now, or traded recently enough to matter for the longest range.
  const symbols = useMemo(() => {
    const set = new Set(held.map((p) => p.symbol));
    for (const t of trades) if (t.date >= windowStart) set.add(t.symbol);
    return [...set].sort();
  }, [held, trades, windowStart]);

  const historyQueries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: [...tickerKeys.all, 'history', symbol, '1d', HISTORY_DAYS] as const,
      queryFn: () => fetchCloses(symbol),
      // Daily candles only change once a day; the live last point comes from
      // the positions query, not from here.
      staleTime: 15 * 60_000,
      enabled: !mixedCurrency,
      retry: 1,
    })),
  });

  const historiesSettled = historyQueries.every((q) => !q.isPending);
  // Identity of the fetched data, so the series is only rebuilt when it changes.
  const historyStamp = historyQueries.map((q) => q.dataUpdatedAt).join(',');

  return useMemo<PortfolioHistoryState>(() => {
    if (mixedCurrency) return { status: 'mixed-currency' };
    if (tradesQuery.isPending || !historiesSettled) return { status: 'loading' };

    const closes: Record<string, ClosePoint[] | undefined> = {};
    symbols.forEach((symbol, i) => {
      closes[symbol] = historyQueries[i]?.data;
    });

    const fx = (currency: string): number | null => {
      const code = currency.toUpperCase();
      if (rates.has(code)) return rates.get(code) ?? null;
      // A closed position in a currency no current holding uses: only
      // chartable when it already is the display currency.
      return display === '' || code === display ? 1 : null;
    };

    const series = buildPortfolioSeries({
      positions: held,
      trades,
      closes,
      startDate: shiftDay(endDate, -RANGE_DAYS[range]),
      endDate,
      fx,
    });

    const usesFxConversion = [...rates.values()].some((r) => r !== null && r !== 1);
    return { status: 'ready', series, usesFxConversion };
    // historyQueries is a new array every render; historyStamp tracks its data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mixedCurrency,
    tradesQuery.isPending,
    historiesSettled,
    historyStamp,
    symbols,
    held,
    trades,
    rates,
    display,
    range,
    endDate,
  ]);
}

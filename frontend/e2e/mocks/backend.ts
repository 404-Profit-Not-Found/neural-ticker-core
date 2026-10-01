import type { Page, Request, Route } from '@playwright/test';
import {
  CURRENCIES_AVAILABLE,
  CURRENCY_RATES,
  TICKERS,
  TODAY,
  USER,
  history,
  logoSvg,
  marketSnapshot,
  tickerBySymbol,
} from './data';

export interface CashBalance {
  currency: string;
  amount: number;
}

export interface SeedPosition {
  symbol: string;
  shares: number;
  buy_price: number;
  buy_date?: string;
}

interface StoredPosition extends Required<SeedPosition> {
  id: string;
  currency: string;
}

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Stateful in-memory stand-in for the NestJS API. It mirrors the backend's
 * paper-trading rules closely enough for UI tests:
 *  - buys are strict: funded from cash in the ticker's native currency, and
 *    rejected with the same 400 message as PortfolioService.adjustCashTx;
 *  - deposits accept any ISO code, withdrawals cannot go negative.
 *
 * Any /api or /auth request without a handler is answered 501 and recorded in
 * `unmocked` — the fixture fails the test on it, so a new endpoint the UI
 * starts calling can never silently slip past the suite.
 */
export class MockBackend {
  cash: CashBalance[] = [];
  positions: StoredPosition[] = [];
  calls: RecordedCall[] = [];
  unmocked: string[] = [];
  private nextId = 1;

  constructor(seed?: { cash?: CashBalance[]; positions?: SeedPosition[] }) {
    this.cash = (seed?.cash ?? []).map((c) => ({ ...c }));
    for (const p of seed?.positions ?? []) this.addPosition(p);
  }

  cashOf(currency: string) {
    return this.cash.find((c) => c.currency === currency)?.amount ?? 0;
  }

  /** Calls to one endpoint, e.g. `backend.callsTo('POST', '/api/v1/portfolio/cash/deposit')`. */
  callsTo(method: string, path: string) {
    return this.calls.filter((c) => c.method === method && c.path === path);
  }

  async install(page: Page) {
    await page.route(
      (url) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/'),
      (route) => this.handle(route),
    );
  }

  // ---- state helpers ------------------------------------------------------

  private addPosition(p: SeedPosition) {
    const t = tickerBySymbol(p.symbol);
    const stored: StoredPosition = {
      id: `pos-${this.nextId++}`,
      symbol: p.symbol.toUpperCase(),
      shares: p.shares,
      buy_price: p.buy_price,
      buy_date: p.buy_date ?? `${TODAY}T00:00:00.000Z`,
      currency: t?.currency ?? 'USD',
    };
    this.positions.push(stored);
    return stored;
  }

  private adjustCash(currency: string, delta: number, enforce: boolean) {
    let row = this.cash.find((c) => c.currency === currency);
    if (!row) {
      row = { currency, amount: 0 };
      this.cash.push(row);
      this.cash.sort((a, b) => a.currency.localeCompare(b.currency));
    }
    const next = round2(row.amount + delta);
    if (enforce && next < 0) {
      return {
        error:
          `Insufficient ${currency} cash: need ${Math.abs(delta).toFixed(2)}, ` +
          `have ${row.amount.toFixed(2)}. Deposit cash first.`,
      };
    }
    row.amount = next;
    return { amount: next };
  }

  private enrich(p: StoredPosition) {
    const t = tickerBySymbol(p.symbol)!;
    const current_value = round2(p.shares * t.price);
    const cost_basis = round2(p.shares * p.buy_price);
    const gain_loss = round2(current_value - cost_basis);
    const snap = marketSnapshot(t);
    return {
      ...p,
      ticker: { ...snap.ticker, sector: t.sector },
      fundamentals: { ...snap.fundamentals, consensus_rating: 'Buy' },
      aiAnalysis: {
        financial_risk: 3.2,
        upside_percent: 14.5,
        overall_score: 7.4,
        base_price: round2(t.price * 1.145),
        bear_price: round2(t.price * 0.82),
      },
      current_price: t.price,
      change_percent: round2(((t.price - t.prevClose) / t.prevClose) * 100),
      current_value,
      cost_basis,
      gain_loss,
      gain_loss_percent: cost_basis ? round2((gain_loss / cost_basis) * 100) : 0,
      total_gain: gain_loss,
      total_gain_percent: cost_basis ? round2((gain_loss / cost_basis) * 100) : 0,
    };
  }

  // ---- router -------------------------------------------------------------

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const body = this.body(req);
    this.calls.push({ method, path, body });

    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    const badRequest = (message: string) =>
      json({ statusCode: 400, message, error: 'Bad Request' }, 400);

    // Auth
    if (path === '/api/auth/profile') return json(USER);

    const v1 = path.startsWith('/api/v1/') ? path.slice('/api/v1'.length) : null;
    if (v1 === null) return this.unhandled(route, method, path);

    // Header / global chrome
    if (v1 === '/notifications/count') return json({ count: 0 });
    if (v1 === '/notifications') return json([]);
    // 204 tells EventSource to stop reconnecting (no retry storm in tests).
    if (v1 === '/notifications/stream') return route.fulfill({ status: 204 });
    if (v1 === '/research') return json({ data: [], total: 0 });
    if (v1 === '/currency/available') return json({ currencies: CURRENCIES_AVAILABLE });
    if (v1 === '/currency/rates') return json(CURRENCY_RATES);
    if (v1 === '/users/me/preferences') return json({ ok: true });
    if (v1 === '/tickers/sectors') return json(['Technology', 'Industrials']);

    // Tickers
    let m: RegExpMatchArray | null;
    if ((m = v1.match(/^\/tickers\/([^/]+)\/logo$/))) {
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: logoSvg(decodeURIComponent(m[1])),
      });
    }
    if ((m = v1.match(/^\/tickers\/([^/]+)\/history$/))) {
      const t = tickerBySymbol(decodeURIComponent(m[1]));
      return t ? json(history(t)) : json({ statusCode: 404, message: 'Not found' }, 404);
    }
    if ((m = v1.match(/^\/tickers\/([^/]+)\/snapshot$/))) {
      const t = tickerBySymbol(decodeURIComponent(m[1]));
      if (!t) return json({ statusCode: 404, message: 'Not found' }, 404);
      return json({
        ...marketSnapshot(t),
        latestPrice: {
          close: t.price,
          open: round2(t.price * 0.995),
          high: round2(t.price * 1.012),
          low: round2(t.price * 0.985),
        },
        ticker: { ...marketSnapshot(t).ticker, industry: t.industry },
      });
    }
    if (v1 === '/tickers' && method === 'GET') {
      const q = (url.searchParams.get('search') || '').toUpperCase();
      const hits = Object.values(TICKERS)
        .filter((t) => t.symbol.includes(q) || t.name.toUpperCase().includes(q))
        .map((t) => ({
          id: `tk-${t.symbol}`,
          symbol: t.symbol,
          name: t.name,
          exchange: t.exchange,
          currency: t.currency,
          logo_url: `/api/v1/tickers/${t.symbol}/logo`,
          is_queued: false,
        }));
      return json(hits);
    }
    if (v1 === '/market-data/snapshots' && method === 'POST') {
      const symbols = ((body as { symbols?: string[] })?.symbols ?? []) as string[];
      return json(
        symbols
          .map((s) => tickerBySymbol(s))
          .filter(Boolean)
          .map((t) => marketSnapshot(t!)),
      );
    }

    // Portfolio: cash
    if (v1 === '/portfolio/cash' && method === 'GET') return json(this.cash);
    if ((m = v1.match(/^\/portfolio\/cash\/(deposit|withdraw)$/)) && method === 'POST') {
      const { amount, currency = 'USD' } = (body ?? {}) as { amount?: number; currency?: string };
      if (typeof amount !== 'number' || amount < 0.01) return badRequest('amount must not be less than 0.01');
      if (!/^[A-Z]{3}$/.test(currency)) return badRequest('currency must be a 3-letter ISO code');
      const res =
        m[1] === 'deposit'
          ? this.adjustCash(currency, round2(amount), false)
          : this.adjustCash(currency, -round2(amount), true);
      if ('error' in res) return badRequest(res.error!);
      return json({ currency, amount: res.amount });
    }

    // Portfolio: queued (market-closed) orders — none in these scenarios
    if (v1 === '/portfolio/pending-orders' && method === 'GET') return json([]);

    // Portfolio: positions
    if (v1 === '/portfolio/positions' && method === 'GET') {
      return json(this.positions.map((p) => this.enrich(p)));
    }
    if (v1 === '/portfolio/positions' && method === 'POST') {
      const dto = body as { symbol: string; shares: number; buy_price: number; buy_date: string };
      const t = tickerBySymbol(dto.symbol);
      const currency = t?.currency ?? 'USD';
      const res = this.adjustCash(currency, -round2(dto.shares * dto.buy_price), true);
      if ('error' in res) return badRequest(res.error!);
      return json(this.addPosition(dto), 201);
    }
    if ((m = v1.match(/^\/portfolio\/positions\/([^/]+)$/)) && method === 'DELETE') {
      this.positions = this.positions.filter((p) => p.id !== m![1]);
      return json({});
    }

    return this.unhandled(route, method, path);
  }

  private body(req: Request): unknown {
    try {
      return req.postDataJSON();
    } catch {
      return req.postData();
    }
  }

  private unhandled(route: Route, method: string, path: string) {
    this.unmocked.push(`${method} ${path}`);
    return route.fulfill({
      status: 501,
      json: { statusCode: 501, message: `E2E mock: no handler for ${method} ${path}` },
    });
  }
}

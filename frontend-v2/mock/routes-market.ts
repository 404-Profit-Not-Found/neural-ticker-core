// Tickers, market data, analyzer, stats, news, market status, currency.
import type { Ctx, Router } from './core.ts';
import { HANDLED, badRequest, internalError, iso, notFound, HttpError } from './core.ts';
import type { MockState, Note, User } from './state.ts';
import { nextId, seedOf, tickerBySymbol } from './state.ts';
import { authenticate } from './session.ts';
import type { TickerEntity } from './market.ts';
import {
  intradayHistory,
  isUsStyleSymbol,
  latestCandle,
  marketStatus,
  regionOf,
  sparkline,
} from './market.ts';
import {
  FX_RATES,
  analyzerRow,
  companyNewsRows,
  ensureTicker,
  fxRate,
  generalNewsRows,
  historyBetween,
  publicNoteSummary,
  requireTicker,
  snapshot,
} from './views.ts';
import type { AnalyzerRow } from './views.ts';
import { LOGO_COLORS } from './seed-tickers.ts';
import { digestMarkdown } from './seed-content.ts';
import { hash, uuid } from './rng.ts';

const DAY = 86_400_000;

/** Express parses `a[]=1&a[]=2`, `a[0]=1` and repeated `a=1&a=2` into one
 *  array; axios emits the `a[]=` form. Accept all three. */
export function qAll(q: URLSearchParams, key: string): string[] {
  const out: string[] = [];
  for (const [k, val] of q.entries()) {
    if (k === key || k === `${key}[]` || (k.startsWith(`${key}[`) && /^\[\d+\]$/.test(k.slice(key.length)))) {
      out.push(val);
    }
  }
  return out;
}

// ── generated images ─────────────────────────────────────────────────────

function logoSvg(symbol: string): string {
  const label = (symbol.split('.')[0] ?? symbol).replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase();
  const hue = hash('logo:' + symbol) % 360;
  const bg = LOGO_COLORS[symbol] ?? `hsl(${hue} 62% 42%)`;
  const size = label.length <= 1 ? 76 : label.length === 2 ? 58 : label.length === 3 ? 44 : 34;
  // Pick black or white text from the background's rough luminance.
  let fg = '#ffffff';
  const m = /^#([0-9a-f]{6})$/i.exec(bg);
  if (m) {
    const n = parseInt(m[1] as string, 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    if (lum > 0.62) fg = '#111111';
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
    `<rect width="128" height="128" fill="${bg}"/>` +
    `<text x="64" y="64" dy="0.36em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" ` +
    `font-weight="700" font-size="${size}" letter-spacing="-1" fill="${fg}">${label}</text></svg>`
  );
}

function newsImageSvg(n: number): string {
  const hue = (n * 47 + 200) % 360;
  let seed = n * 7919 + 13;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let y = 190 + rnd() * 60;
  const pts: string[] = [];
  for (let x = 0; x <= 640; x += 32) {
    y = Math.min(300, Math.max(70, y + (rnd() - 0.52) * 56));
    pts.push(`${x},${y.toFixed(0)}`);
  }
  const bars = Array.from({ length: 20 }, (_, i) => {
    const h = 20 + rnd() * 70;
    return `<rect x="${i * 32 + 8}" y="${360 - h}" width="16" height="${h}" fill="hsl(${hue} 70% 70% / 0.18)"/>`;
  }).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 55% 22%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 60% 10%)"/>` +
    `</linearGradient></defs><rect width="640" height="360" fill="url(#g)"/>${bars}` +
    `<polyline points="${pts.join(' ')}" fill="none" stroke="hsl(${hue} 85% 68%)" stroke-width="4" stroke-linejoin="round"/>` +
    `<polygon points="0,360 ${pts.join(' ')} 640,360" fill="hsl(${hue} 85% 60% / 0.14)"/></svg>`
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

/** src/modules/tickers/utils/exchange-currency.util.ts (the entries the
 *  mock universe needs). */
function inferCurrency(exchange: string, symbol: string): string | null {
  const suffix: Array<[RegExp, string]> = [
    [/\.L$/i, 'GBP'], [/\.DE$/i, 'EUR'], [/\.PA$/i, 'EUR'], [/\.AS$/i, 'EUR'], [/\.MI$/i, 'EUR'],
    [/\.MC$/i, 'EUR'], [/\.SW$/i, 'CHF'], [/\.ST$/i, 'SEK'], [/\.OL$/i, 'NOK'], [/\.CO$/i, 'DKK'],
    [/\.T$/i, 'JPY'], [/\.HK$/i, 'HKD'], [/\.TO$/i, 'CAD'],
  ];
  for (const [re, cur] of suffix) if (re.test(symbol)) return cur;
  const byExchange: Record<string, string> = {
    LSE: 'GBP', XETRA: 'EUR', AMS: 'EUR', STO: 'SEK', TSE: 'JPY', NYSE: 'USD', NASDAQ: 'USD',
  };
  return byExchange[exchange.toUpperCase()] ?? null;
}

const EU_SUFFIXES = ['.DE', '.L', '.PA', '.AS', '.MC', '.MI', '.SW', '.VI', '.BR', '.HE', '.CO', '.ST', '.OL'];
const EU_EXCHANGE_CODES = ['LSE', 'XETRA', 'PA', 'AS', 'MC', 'MI', 'SW', 'VI', 'BR', 'HE', 'CO', 'ST', 'OL'];

const FUND_COLUMNS = new Set([
  'symbol_id', 'market_cap', 'shares_outstanding', 'pe_ttm', 'trailing_pe', 'forward_pe', 'eps_ttm',
  'dividend_yield', 'beta', 'debt_to_equity', 'revenue_ttm', 'gross_margin', 'net_profit_margin',
  'operating_margin', 'roe', 'roa', 'price_to_book', 'book_value_per_share', 'free_cash_flow_ttm',
  'earnings_growth_yoy', 'current_ratio', 'quick_ratio', 'interest_coverage', 'debt_to_assets',
  'net_income_ttm', 'total_debt', 'total_assets', 'total_liabilities', 'total_cash',
  'next_earnings_date', 'next_earnings_estimate_eps', 'consensus_rating', 'sector',
  'fifty_two_week_high', 'fifty_two_week_low', 'updated_at',
]);

/** The analyzer's ordering — `ORDER BY … NULLS LAST` in BOTH directions: a
 *  row without the value (no analysis, no fundamentals) always goes to the
 *  end, never to the top of a descending sort. */
function pgCompare(a: unknown, b: unknown, dir: 'ASC' | 'DESC'): number {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
  return dir === 'DESC' ? -cmp : cmp;
}

/** MarketDataService.getAnalyzerTickers — filters, sort and paging. */
function analyzer(c: Ctx): unknown {
  const q = c.query;
  const page = Number(q.get('page')) || 1;
  const limit = Math.min(Math.max(1, Number(q.get('limit')) || 50), 100);
  const sortBy = q.get('sortBy') || 'market_cap';
  const sortDir: 'ASC' | 'DESC' = String(q.get('sortDir')).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const search = q.get('search') ? (q.get('search') as string).toUpperCase() : null;
  const symbols = qAll(q, 'symbols');
  const sectors = qAll(q, 'sector');
  const regions = qAll(q, 'region');
  const risks = qAll(q, 'risk');
  const ratings = qAll(q, 'aiRating');
  const upsideMatch = q.get('upside')?.match(/(\d+)/);
  const scoreMatch = q.get('overallScore')?.match(/(\d+(\.\d+)?)/);
  const minMarketCap = q.get('minMarketCap') ? Number(q.get('minMarketCap')) : undefined;
  const profitableOnly = q.get('profitableOnly') === 'true';

  let rows: AnalyzerRow[] = c.state.tickers.filter((t) => !t.is_hidden).map((t) => analyzerRow(c.state, t));
  const fund = (r: AnalyzerRow): Record<string, unknown> => r.item.fundamentals as Record<string, unknown>;
  const ai = (r: AnalyzerRow): Record<string, number> | null => r.item.aiAnalysis as Record<string, number> | null;

  if (search) rows = rows.filter((r) => r.t.symbol.toUpperCase().includes(search) || r.t.name.toUpperCase().includes(search));
  if (symbols.length) rows = rows.filter((r) => symbols.includes(r.t.symbol));
  if (sectors.length) rows = rows.filter((r) => sectors.includes(r.t.sector ?? '') || sectors.includes((fund(r).sector as string) ?? ''));
  if (regions.length) {
    rows = rows.filter((r) => {
      const sym = r.t.symbol.toUpperCase();
      const ex = r.t.exchange.toUpperCase();
      const eu = EU_SUFFIXES.some((s) => sym.endsWith(s)) || EU_EXCHANGE_CODES.includes(ex);
      // isUsStyleSymbol (its SQL twin in the real query): bare symbols and
      // US share classes such as BRK.B.
      const us = isUsStyleSymbol(r.t.symbol) && !EU_EXCHANGE_CODES.includes(ex);
      return regions.some((x) => (x === 'EU' && eu) || (x === 'US' && us));
    });
  }
  if (risks.length) {
    rows = rows.filter((r) => {
      const fr = ai(r)?.financial_risk;
      if (fr === undefined || fr === null) return false;
      return risks.some((x) => (x.includes('Low') && fr < 3.5) || (x.includes('Medium') && fr >= 3.5 && fr <= 6.5) || (x.includes('High') && fr > 6.5));
    });
  }
  if (upsideMatch) {
    const val = parseInt(upsideMatch[0], 10);
    rows = rows.filter((r) => r.upside !== null && r.upside > val);
  }
  if (scoreMatch) {
    const val = parseFloat(scoreMatch[0]);
    rows = rows.filter((r) => (ai(r)?.overall_score ?? -Infinity) > val);
  }
  if (minMarketCap) rows = rows.filter((r) => ((fund(r).market_cap as number) ?? -Infinity) >= minMarketCap);
  if (profitableOnly) rows = rows.filter((r) => ((fund(r).pe_ttm as number) ?? 0) > 0);
  if (ratings.length) {
    // Each ticker has exactly one rating — the one its badge shows — and a
    // filter value selects exactly the tickers with that rating. "Legendary"
    // is the old name of "No Brainer"; an unknown value selects nothing; a
    // ticker without an analysis has no rating and matches nothing.
    const wanted = new Set(ratings.map((x) => (x === 'Legendary' ? 'No Brainer' : x)));
    rows = rows.filter((r) => r.rating !== null && wanted.has(r.rating));
  }

  // Sort mapping (same branches as the service).
  let key: (r: AnalyzerRow) => unknown;
  if (sortBy === 'change' || sortBy === 'price_change') key = (r) => r.changePct;
  // A ticker that has never been analysed has no rating: it sorts last.
  else if (sortBy === 'ai_rating') key = (r) => r.verdictScore;
  else if (['symbol', 'name', 'sector', 'industry'].includes(sortBy)) key = (r) => (r.t as unknown as Record<string, unknown>)[sortBy];
  else if (sortBy === 'upside_percent') key = (r) => r.upside;
  else if (sortBy === 'downside_percent') key = (r) => r.downside;
  else if (['overall_score', 'financial_risk'].includes(sortBy)) key = (r) => ai(r)?.[sortBy] ?? null;
  else if (['close', 'volume'].includes(sortBy)) key = (r) => (r.item.latestPrice as Record<string, unknown>)[sortBy];
  else if (sortBy === 'research') key = (r) => r.researchCount;
  else if (sortBy === 'consensus') key = (r) => fund(r).consensus_rating;
  else {
    const col = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(sortBy) ? sortBy : 'market_cap';
    // An identifier that is not a fundamentals column makes the real query
    // fail (`column fund.x does not exist`) → 500.
    if (!FUND_COLUMNS.has(col)) throw internalError();
    key = (r) => fund(r)[col];
  }
  rows.sort((a, b) => pgCompare(key(a), key(b), sortDir) || a.t.symbol.localeCompare(b.t.symbol));

  const total = rows.length;
  return {
    items: rows.slice((page - 1) * limit, (page - 1) * limit + limit).map((r) => r.item),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

/** MarketDataService.symbolsRated — visible tickers with exactly this AI
 *  rating, by symbol: the list the analyzer returns for `aiRating=<rating>`
 *  (the dashboard counters link there). */
function symbolsRated(state: MockState, rating: string): string[] {
  return state.tickers
    .filter((t) => !t.is_hidden && analyzerRow(state, t).rating === rating)
    .map((t) => t.symbol)
    .sort();
}

/** MarketDataService.getTickerSnapshots — digest enrichment. */
function tickerSnapshots(state: MockState, symbols: string[]): unknown[] {
  return state.tickers
    .filter((t) => symbols.includes(t.symbol))
    .map((t) => {
      const price = latestCandle(seedOf(state, t.symbol), t.id, state.now);
      const risk = state.risk.get(t.id);
      const changePercent = price.prevClose && price.prevClose > 0 ? ((price.close - price.prevClose) / price.prevClose) * 100 : 0;
      return {
        ...t,
        latestPrice: {
          close: price.close,
          change: price.prevClose ? price.close - price.prevClose : 0,
          changePercent,
          prevClose: price.prevClose,
        },
        riskAnalysis: risk ? { overall_score: risk.overall_score, financial_risk: risk.financial_risk } : null,
      };
    });
}

/** ResearchService.getOrGenerateDailyDigest: newest non-failed "Smart News
 *  Briefing" of the last 24h, else generate one from the portfolio (the mock
 *  "generates" instantly); no positions → null. */
export function dailyDigest(state: MockState, user: User): Note | null {
  const since = Date.now() - 24 * 3_600_000;
  const existing = state.notes
    .filter((n) => n.user_id === user.id && (n.title ?? '').startsWith('Smart News Briefing') && n.status !== 'failed' && Date.parse(n.created_at) >= since)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (existing) return existing;
  const symbols = [...new Set(state.positions.filter((p) => p.user_id === user.id).map((p) => p.symbol))].slice(0, 5);
  if (symbols.length === 0) return null;
  const now = new Date();
  const created: Note = {
    id: nextId(state, 'research_notes'),
    request_id: uuid(`digest:${user.id}:${now.getTime()}`),
    tickers: symbols,
    question: `Daily Smart News Digest for: ${symbols.join(', ')}`,
    provider: 'gemini',
    quality: 'medium',
    models_used: ['gemini-3.8-flash'],
    title: `Smart News Briefing (${now.toISOString().slice(0, 10)} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')})`,
    answer_markdown: digestMarkdown(symbols.map((s) => seedOf(state, s))),
    full_response: null,
    numeric_context: {},
    grounding_metadata: null,
    thinking_process: null,
    tokens_in: 3900,
    tokens_out: 940,
    status: 'completed',
    error: null,
    user_id: user.id,
    quality_score: null,
    rarity: null,
    content_hash: null,
    enrichment_status: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  state.notes.push(created);
  return created;
}

function aggregate(rows: ReturnType<typeof historyBetween>, interval: string, tickerId: string): unknown[] {
  const bucket = (ts: string): string => {
    const d = new Date(ts);
    if (interval === '1wk') {
      const monday = Date.parse(ts) - ((d.getUTCDay() + 6) % 7) * DAY;
      return iso(monday);
    }
    return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  };
  const out = new Map<string, { ts: string; open: number; high: number; low: number; close: number; volume: number }>();
  for (const r of rows) {
    const k = bucket(r.ts);
    const cur = out.get(k);
    if (!cur) out.set(k, { ts: k, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume });
    else {
      cur.high = Math.max(cur.high, r.high);
      cur.low = Math.min(cur.low, r.low);
      cur.close = r.close;
      cur.volume += r.volume;
    }
  }
  return [...out.values()].map((h) => ({ ...h, symbol_id: tickerId, timeframe: interval, source: 'yahoo_historical' }));
}

const EXTERNAL_UNIVERSE: Array<[string, string, string]> = [
  ['ARM', 'Arm Holdings plc', 'NASDAQ'], ['SNOW', 'Snowflake Inc.', 'NYSE'], ['GME', 'GameStop Corp.', 'NYSE'],
  ['ORSTED.CO', 'Orsted A/S', 'Copenhagen'], ['VWS.CO', 'Vestas Wind Systems A/S', 'Copenhagen'],
  ['RKLB', 'Rocket Lab USA, Inc.', 'NASDAQ'], ['HOOD', 'Robinhood Markets, Inc.', 'NASDAQ'],
  ['NET', 'Cloudflare, Inc.', 'NYSE'], ['NIO', 'NIO Inc.', 'NYSE'], ['ABNB', 'Airbnb, Inc.', 'NASDAQ'],
];

export function registerMarket(r: Router): void {
  // ── mock-only assets ───────────────────────────────────────────────────
  r.get('/__mock/news-image/:name', { auth: 'public', noError: true }, (c) => {
    const svg = newsImageSvg(parseInt(c.params.name as string, 10) || 0);
    c.res.statusCode = 200;
    c.res.setHeader('Content-Type', 'image/svg+xml');
    c.res.setHeader('Cache-Control', 'public, max-age=3600');
    c.res.end(svg);
    return HANDLED;
  });

  // ── v1/tickers ─ src/modules/tickers/tickers.controller.ts ─────────────

  // GET v1/tickers?search=&external= — NOT @Public(): needs a session.
  // TickersService.searchTickers.
  r.get('/v1/tickers', { auth: 'user', empty: () => [] }, (c) => {
    const { state } = c;
    const search = qAll(c.query, 'search').find((x) => x.length > 0);
    const visible = state.tickers.filter((t) => !t.is_hidden);
    if (!search || search.trim() === '') {
      return visible
        .sort((a, b) => a.symbol.localeCompare(b.symbol))
        .map((t) => ({ id: t.id, symbol: t.symbol, name: t.name, exchange: t.exchange, currency: t.currency, is_locally_tracked: true }));
    }
    const q = search.toUpperCase();
    const local = visible
      .filter((t) => t.symbol.toUpperCase().startsWith(q) || t.name.toUpperCase().startsWith(q))
      .sort((a, b) => Number(b.symbol === q) - Number(a.symbol === q) || a.symbol.localeCompare(b.symbol))
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        symbol: t.symbol,
        name: t.name,
        exchange: t.exchange,
        currency: t.currency,
        logo_url: t.logo_url,
        sector: t.sector,
        finnhub_industry: t.finnhub_industry,
        is_locally_tracked: true,
        sparkline: sparkline(seedOf(state, t.symbol), t.id, state.now),
        industry: t.sector || t.finnhub_industry,
      }));
    const seen = new Set(local.map((x) => x.symbol.toUpperCase()));
    const pending: unknown[] = [];
    for (const req of state.tickerRequests.filter((x) => x.status === 'PENDING' && x.symbol.toUpperCase().startsWith(q)).slice(0, 10)) {
      if (seen.has(req.symbol.toUpperCase())) continue;
      seen.add(req.symbol.toUpperCase());
      pending.push({ symbol: req.symbol, name: 'Requested Ticker', exchange: 'Unknown', logo_url: null, is_locally_tracked: false, is_queued: true, sparkline: null });
    }
    const combined: unknown[] = [...local, ...pending];
    // External (Finnhub + Yahoo) lookup: pro/admin only, ?external=true, ≥ 2 chars.
    const user = c.user as User;
    const isPro = user.tier === 'pro' || user.role === 'admin';
    if (search.length >= 2 && isPro && c.query.get('external') === 'true') {
      const pendingSyms = new Set(state.tickerRequests.filter((x) => x.status === 'PENDING').map((x) => x.symbol.toUpperCase()));
      const tracked = new Set(local.map((x) => x.symbol.toUpperCase()));
      const external = EXTERNAL_UNIVERSE.filter(([sym, name]) => (sym.startsWith(q) || name.toUpperCase().includes(q)) && !tracked.has(sym) && !tickerBySymbol(state, sym))
        .map(([symbol, name, exchange]) => ({ symbol, name, exchange, logo_url: null, is_locally_tracked: false, is_queued: pendingSyms.has(symbol), sparkline: null }));
      return [...combined, ...external.slice(0, 20)];
    }
    return combined;
  });

  // GET v1/tickers/count — @Public(); counts every row, hidden included.
  r.get('/v1/tickers/count', { auth: 'public' }, (c) => ({ count: c.scenario.empty ? 0 : c.state.tickers.length }));

  // GET v1/tickers/sectors — @Public(); TickersService.getUniqueSectors.
  r.get('/v1/tickers/sectors', { auth: 'public', empty: () => [] }, (c) =>
    [...new Set(c.state.tickers.map((t) => t.sector || t.finnhub_industry).filter((s): s is string => !!s && s.trim().length > 0))].sort(),
  );

  // GET v1/tickers/admin/hidden — @Roles('admin').
  r.get('/v1/tickers/admin/hidden', { auth: 'admin', empty: () => [] }, (c) =>
    c.state.tickers
      .filter((t) => t.is_hidden)
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map((t) => ({ id: t.id, symbol: t.symbol, name: t.name, exchange: t.exchange, currency: t.currency, is_hidden: t.is_hidden })),
  );

  // GET v1/tickers/admin/search?search=&missing_logo= — @Roles('admin');
  // includes hidden tickers, max 50.
  r.get('/v1/tickers/admin/search', { auth: 'admin', empty: () => [] }, (c) => {
    const search = c.query.get('search');
    const missing = c.query.get('missing_logo') === 'true';
    let rows = [...c.state.tickers].sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (missing) rows = rows.filter((t) => t.logo_url === null || t.logo_url === '' || t.logo_url === 'null');
    if (search && search.trim() !== '') {
      const q = search.toUpperCase();
      rows = rows.filter((t) => t.symbol.toUpperCase().startsWith(q) || t.name.toUpperCase().startsWith(q));
    }
    return rows.slice(0, 50).map((t) => ({ id: t.id, symbol: t.symbol, name: t.name, exchange: t.exchange, currency: t.currency, is_hidden: t.is_hidden, logo_url: t.logo_url }));
  });

  // POST v1/tickers { symbol } / POST v1/tickers/:symbol — ensureTicker.
  // @Roles('admin'): no first-party client calls these as a regular user
  // (403). Users discover tickers through the read routes or file a ticker
  // request for an admin to approve.
  // (The real service creates the row from Finnhub/Yahoo; the mock only
  // knows its own universe and answers the provider-miss 404 otherwise.)
  //
  // Not mirrored — because the mock never CREATES a ticker for a regular
  // user: the real API lets a signed-in non-admin make it start tracking at
  // most TICKER_CREATE_DAILY_LIMIT (default 10) new tickers per 24 hours, on
  // any path that creates one (ticker reads, watchlist add, research…). Over
  // the limit it answers
  //   429 { statusCode: 429, error: 'Too Many Requests',
  //         message: 'You have reached the limit of 10 new tickers per day.
  //                   Tickers already on the platform are not affected. To get
  //                   another one added, submit a ticker request instead.' }
  // Tracked tickers are never affected; admins are exempt.
  r.post('/v1/tickers', { auth: 'admin' }, (c) => {
    const symbol = c.body?.symbol as string | undefined;
    if (!symbol) return undefined;
    return ensureTicker(c.state, symbol.trim());
  });
  r.post('/v1/tickers/:symbol', { auth: 'admin' }, (c) => ensureTicker(c.state, (c.params.symbol as string).trim()));

  // POST v1/tickers/:symbol/sync — @Roles('admin'); ticker-detail.controller.ts.
  r.post('/v1/tickers/:symbol/sync', { auth: 'admin' }, () => ({ status: 'ok', message: 'Sync started' }));

  // PATCH v1/tickers/:symbol/hidden { hidden } — @Roles('admin').
  r.patch('/v1/tickers/:symbol/hidden', { auth: 'admin' }, (c) => {
    const t = tickerBySymbol(c.state, (c.params.symbol as string).trim());
    if (!t) throw notFound(`Ticker ${c.params.symbol} not found`);
    t.is_hidden = c.body?.hidden as boolean;
    t.updated_at = iso(Date.now());
    return t;
  });

  // PATCH v1/tickers/:symbol { logo_url } — @Roles('admin'); the real
  // service also downloads the image into ticker_logos, so the mock starts
  // serving a logo for that symbol afterwards.
  r.patch('/v1/tickers/:symbol', { auth: 'admin' }, (c) => {
    const t = tickerBySymbol(c.state, (c.params.symbol as string).trim());
    if (!t) throw notFound(`Ticker ${c.params.symbol} not found`);
    t.logo_url = c.body?.logo_url as string;
    t.updated_at = iso(Date.now());
    if (t.logo_url) seedOf(c.state, t.symbol).logo = 'ok';
    return t;
  });

  // GET v1/tickers/:symbol/logo — @Public(); image bytes, or 404 text
  // "Logo not found" (302 → /favicon.svg with ?fallback=app). The mock serves
  // a generated monogram, and 404s for ~20% of the universe on purpose.
  r.get('/v1/tickers/:symbol/logo', { auth: 'public', noError: true }, (c) => {
    const t = tickerBySymbol(c.state, c.params.symbol as string);
    const has = t && !t.is_hidden && seedOf(c.state, t.symbol).logo === 'ok';
    if (!has) {
      if (c.query.get('fallback') === 'app') {
        c.res.statusCode = 302;
        c.res.setHeader('Cache-Control', 'no-store');
        c.res.setHeader('Location', '/favicon.svg');
        c.res.end();
        return HANDLED;
      }
      c.res.statusCode = 404;
      c.res.setHeader('Content-Type', 'text/html; charset=utf-8');
      c.res.end('Logo not found');
      return HANDLED;
    }
    c.res.statusCode = 200;
    c.res.setHeader('Content-Type', 'image/svg+xml');
    c.res.setHeader('Cache-Control', 'public, max-age=604800');
    c.res.end(logoSvg(t.symbol));
    return HANDLED;
  });

  // TickersService.assertPublicReadAllowed — gate of the PUBLIC ticker read
  // routes (profile, composite, snapshot, news, history, risk-reward). They
  // stay public (@Public() + OptionalJwtAuthGuard), but:
  //  1. something that cannot be a symbol (empty, > 32 chars) is a 400;
  //  2. a TRACKED ticker is served to everyone, whatever its symbol looks
  //     like — the format rule never locks an existing listing out;
  //  3. an untracked, malformed symbol is a 400 for everyone (the strict
  //     pattern guards creation and provider calls);
  //  4. an ANONYMOUS caller gets a 404 for an untracked symbol — the real API
  //     never lets an anonymous request create a ticker (which would also
  //     start its LLM research);
  //  5. a signed-in caller is unaffected (for an untracked symbol the real
  //     API asks the providers and creates the row; the mock answers "not
  //     found in any provider", as before).
  const publicRead = (c: Ctx): string => {
    const raw = c.params.symbol as string;
    const symbol = raw.trim().toUpperCase();
    if (symbol.length < 1 || symbol.length > 32) throw badRequest('Invalid ticker symbol format');
    if (tickerBySymbol(c.state, symbol)) return raw;
    if (!/^[A-Z0-9.-]{1,10}$/.test(symbol)) throw badRequest('Invalid ticker symbol format');
    let signedIn = false;
    try {
      authenticate(c.state, c.req);
      signedIn = true;
    } catch {
      signedIn = false;
    }
    if (!signedIn) throw notFound(`Ticker ${symbol} not found`);
    return raw;
  };

  // GET v1/tickers/:symbol/composite — @Public(); ticker-detail.controller.ts.
  r.get('/v1/tickers/:symbol/composite', { auth: 'public' }, (c) => {
    const { state } = c;
    const symbol = publicRead(c);
    const snap = snapshot(state, symbol, true);
    const t = snap.ticker as TickerEntity;
    const latest = snap.latestPrice as { close: number; prevClose: number | null; volume: number; ts: string };
    const fund = (snap.fundamentals ?? {}) as Record<string, unknown>;
    const risk = state.risk.get(t.id) ?? null;
    const note = publicNoteSummary(state, symbol);
    const currency = t.currency && t.currency !== 'USD' ? t.currency : inferCurrency(t.exchange, t.symbol) || t.currency || 'USD';
    // getHistory / getAnalystRatings go through getTicker, which throws for a
    // hidden ticker — the controller swallows that into empty arrays.
    const history = t.is_hidden ? [] : historyBetween(state, t, Date.now() - 5 * 365 * DAY, Date.now());
    const seen = new Set<string>();
    const ratings = t.is_hidden
      ? []
      : (state.ratings.get(t.id) ?? []).slice(0, 20).filter((x) => {
          const k = x.firm.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
    return {
      profile: {
        id: t.id,
        symbol: t.symbol,
        name: t.name,
        exchange: t.exchange,
        currency,
        logo_url: t.logo_url,
        industry: t.industry,
        sector: t.sector,
        web_url: t.web_url,
        description: t.description,
      },
      market_data: {
        price: latest.close || 0,
        change_percent: latest.prevClose ? ((latest.close - latest.prevClose) / latest.prevClose) * 100 : 0,
        volume: latest.volume || 0,
        updated_at: latest.ts,
        history,
      },
      fundamentals: {
        ...fund,
        market_cap: fund.market_cap || t.market_capitalization,
        pe_ratio: fund.pe_ttm,
        revenue_ttm: fund.revenue_ttm,
        gross_margin: fund.gross_margin,
        net_profit_margin: fund.net_profit_margin,
        operating_margin: fund.operating_margin,
        roe: fund.roe,
        roa: fund.roa,
        price_to_book: fund.price_to_book,
        book_value_per_share: fund.book_value_per_share,
        free_cash_flow_ttm: fund.free_cash_flow_ttm,
        earnings_growth_yoy: fund.earnings_growth_yoy,
        current_ratio: fund.current_ratio,
        quick_ratio: fund.quick_ratio,
        interest_coverage: fund.interest_coverage,
        debt_to_equity: fund.debt_to_equity,
        dividend_yield: fund.dividend_yield,
        shares_outstanding: t.share_outstanding,
      },
      risk_analysis: risk
        ? {
            overall_score: risk.overall_score,
            financial_risk: risk.financial_risk,
            execution_risk: risk.execution_risk,
            dilution_risk: risk.dilution_risk,
            competitive_risk: risk.competitive_risk,
            regulatory_risk: risk.regulatory_risk,
            sentiment: risk.sentiment,
            dimensions: {
              financial: risk.financial_risk,
              execution: risk.execution_risk,
              dilution: risk.dilution_risk,
              competitive: risk.competitive_risk,
              regulatory: risk.regulatory_risk,
            },
            upside_percent: risk.upside_percent,
            price_target: risk.price_target_weighted,
            // The server's AI rating, as the snapshot computed it.
            rating: (snap.aiAnalysis as { rating: string | null }).rating,
            rating_score: (snap.aiAnalysis as { rating_score: number | null }).rating_score,
            scenarios: risk.scenarios,
            catalysts: risk.catalysts,
            red_flags: risk.red_flags,
            updated_at: risk.created_at,
          }
        : null,
      // Unauthenticated route: the public summary only, never the note.
      notes: note ? [note] : [],
      ratings,
      news: {
        sentiment: t.news_sentiment,
        score: t.news_impact_score,
        summary: t.news_summary,
        updated_at: t.last_news_update,
        research_id: note?.id,
      },
    };
  });

  // ── v1/tickers/:symbol ─ src/modules/market-data/market-data.controller.ts ──

  // GET …/snapshot — @Public(); MarketDataService.getSnapshot.
  r.get('/v1/tickers/:symbol/snapshot', { auth: 'public' }, (c) => snapshot(c.state, publicRead(c), true));

  // GET …/history?days=&from=&to=&interval= — @Public(). Daily rows are
  // price_ohlcv entities; intraday rows come from Yahoo's chart shape.
  r.get('/v1/tickers/:symbol/history', { auth: 'public' }, (c) => {
    publicRead(c);
    const interval = c.query.get('interval') || '1d';
    const from = c.query.get('from');
    const to = c.query.get('to');
    let fromMs: number;
    let toMs = Date.now();
    if (from) {
      fromMs = new Date(from).getTime();
      if (to) toMs = new Date(to).getTime();
      // `new Date('garbage').toISOString()` throws inside the controller → 500.
      if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw internalError();
    } else if (['1m', '2m', '5m'].includes(interval)) fromMs = toMs - 2 * DAY;
    else if (['15m', '30m', '1h', '60m', '90m'].includes(interval)) fromMs = toMs - 14 * DAY;
    else fromMs = toMs - (Number(c.query.get('days')) || 30) * DAY;

    const t = requireTicker(c.state, c.params.symbol as string);
    const normalized = interval === 'D' || interval === '1d' ? '1d' : interval;
    if (['1m', '2m', '5m', '15m', '30m', '1h', '60m', '90m'].includes(normalized)) {
      return intradayHistory(seedOf(c.state, t.symbol), t.id, normalized, fromMs, toMs, Date.now());
    }
    const daily = historyBetween(c.state, t, fromMs, toMs);
    return normalized === '1d' ? daily : aggregate(daily, normalized === '1wk' ? '1wk' : '1mo', t.id);
  });

  // GET …/news?from=&to= — @Public(); company_news rows of the last 7 days,
  // newest first. Errors are swallowed into [] — except the gate's 400 / 404.
  r.get('/v1/tickers/:symbol/news', { auth: 'public', empty: () => [] }, (c) => {
    const t = tickerBySymbol(c.state, publicRead(c));
    if (!t) return [];
    const to = c.query.get('to') ? new Date(c.query.get('to') as string).getTime() : Date.now();
    const from = c.query.get('from') ? new Date(c.query.get('from') as string).getTime() : Date.now() - 7 * DAY;
    return companyNewsRows(c.state, t).filter((n) => {
      const ts = Date.parse(n.datetime);
      return ts >= from && ts <= to;
    });
  });

  // GET …/status — @Public(); MarketStatusService.getMarketStatus(symbol).
  r.get('/v1/tickers/:symbol/status', { auth: 'public' }, (c) => {
    const symbol = c.params.symbol as string;
    return marketStatus(regionOf(symbol), Date.now(), c.scenario.market, symbol);
  });

  // GET …/risk-reward?history=true — @Public(); risk-reward.controller.ts.
  // Latest analysis with scenarios + qualitative_factors + catalysts, or the
  // last 10 (scenarios only) with ?history=true. No analysis → empty body.
  // Both reads resolve the symbol through the (creating) snapshot path, so
  // the public-read gate runs first.
  r.get('/v1/tickers/:symbol/risk-reward', { auth: 'public' }, (c) => {
    const t = ensureTicker(c.state, publicRead(c));
    const risk = c.state.risk.get(t.id) ?? null;
    if (c.query.get('history') === 'true') {
      if (!risk) return [];
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { qualitative_factors, catalysts, ...rest } = risk;
      return [rest];
    }
    return risk;
  });

  // GET v1/tickers/:symbol — @Public(); full ticker row; hidden → 404.
  r.get('/v1/tickers/:symbol', { auth: 'public' }, (c) => requireTicker(c.state, publicRead(c).trim()));

  // ── v1/market-data ─ market-data-bulk.controller.ts (JwtAuthGuard) ─────

  // POST v1/market-data/snapshots { symbols } — 201; one snapshot per
  // de-duplicated symbol (max 100), `{ symbol, error }` for failures.
  r.post('/v1/market-data/snapshots', { auth: 'user', empty: () => [] }, (c) => {
    const symbols = ((c.body?.symbols as string[]) || []).filter((s) => s && s.trim().length > 0);
    return [...new Set(symbols)].slice(0, 100).map((symbol) => {
      try {
        return snapshot(c.state, symbol.toUpperCase(), false);
      } catch (e) {
        return { symbol, error: e instanceof HttpError ? e.message : 'Unknown error' };
      }
    });
  });

  // GET v1/market-data/analyzer — paginated analyzer rows.
  r.get(
    '/v1/market-data/analyzer',
    {
      auth: 'user',
      empty: (c) => ({
        items: [],
        meta: { total: 0, page: Number(c.query.get('page')) || 1, limit: Math.min(Math.max(1, Number(c.query.get('limit')) || 50), 100), totalPages: 0 },
      }),
    },
    analyzer,
  );

  // GET v1/market-data/indices — @Public(); indices.controller.ts
  // `[{ name, symbol, val, ch }]`.
  r.get('/v1/market-data/indices', { auth: 'public', empty: () => [] }, () => [
    { name: 'S&P 500', symbol: '^GSPC', val: 5842.18, ch: 0.42 },
    { name: 'NASDAQ', symbol: '^IXIC', val: 18472.57, ch: 0.81 },
    { name: 'DOW', symbol: '^DJI', val: 42740.42, ch: -0.14 },
    { name: 'RUSSELL 2K', symbol: '^RUT', val: 2248.64, ch: -0.63 },
    { name: 'VIX', symbol: '^VIX', val: 15.72, ch: -3.21 },
    { name: 'BRENT', symbol: 'BZ=F', val: 77.46, ch: -1.94 },
    { name: 'GOLD', symbol: 'GC=F', val: 2668.4, ch: 0.27 },
    { name: '10Y UST', symbol: '^TNX', val: 4.073, ch: 0.0 },
    { name: 'BTC-USD', symbol: 'BTC-USD', val: 66218.5, ch: 2.36 },
    { name: 'EUR/USD', symbol: 'EURUSD=X', val: 1.0932, ch: -0.08 },
  ]);

  // ── v1/stats ─ stats.controller.ts (@Public()) ─────────────────────────
  r.get('/v1/stats/strong-buy', { auth: 'public', empty: () => ({ count: 0, symbols: [] }) }, (c) => {
    const symbols = symbolsRated(c.state, 'Strong Buy');
    return { count: symbols.length, symbols };
  });
  r.get('/v1/stats/sell', { auth: 'public', empty: () => ({ count: 0, symbols: [] }) }, (c) => {
    const symbols = symbolsRated(c.state, 'Sell');
    return { count: symbols.length, symbols };
  });

  // ── v1/market ─ market-status.controller.ts (@Public()) ────────────────
  r.get('/v1/market/status/all', { auth: 'public' }, (c) => ({
    us: marketStatus('US', Date.now(), c.scenario.market),
    eu: marketStatus('EU', Date.now(), c.scenario.market),
  }));

  // ── v1/news ─ news.controller.ts ───────────────────────────────────────

  // GET v1/news/digest — JwtAuthGuard; the digest note + `relatedTickers`,
  // or `{ status: 'pending', message }` when the user has no digest. The note
  // is the bare row: its author (the caller) is not loaded.
  r.get(
    '/v1/news/digest',
    { auth: 'user', empty: () => ({ status: 'pending', message: 'Digest generation in progress or scheduled.' }) },
    (c) => {
      const digest = dailyDigest(c.state, c.user as User);
      if (!digest) return { status: 'pending', message: 'Digest generation in progress or scheduled.' };
      return { ...digest, relatedTickers: tickerSnapshots(c.state, digest.tickers) };
    },
  );

  // GET v1/news/digest/trigger — JwtAuthGuard; the digest note or null.
  r.get('/v1/news/digest/trigger', { auth: 'user' }, (c) => {
    return dailyDigest(c.state, c.user as User);
  });

  // GET v1/news/general — @Public(); raw Finnhub general-news items.
  r.get('/v1/news/general', { auth: 'public', empty: () => [] }, (c) => generalNewsRows(c.state));

  // GET v1/news/stats?tickers=A,B&from=&to= — @Public().
  r.get('/v1/news/stats', { auth: 'public' }, (c) => {
    const symbols = (c.query.get('tickers') || '').split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    const from = c.query.get('from') ?? undefined;
    const to = c.query.get('to') ?? undefined;
    if (symbols.length === 0) return { total: 0, from, to, breakdown: [] };
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - DAY);
    const breakdown = symbols.map((symbol) => {
      const t = tickerBySymbol(c.state, symbol);
      if (!t) return { symbol, count: 0, error: true };
      const count = companyNewsRows(c.state, t).filter((n) => {
        const ts = Date.parse(n.datetime);
        return ts >= fromDate.getTime() - DAY && ts <= toDate.getTime() + DAY;
      }).length;
      return { symbol, count };
    });
    return {
      total: breakdown.reduce((sum, b) => sum + b.count, 0),
      from: fromDate.toISOString().split('T')[0],
      to: toDate.toISOString().split('T')[0],
      breakdown,
    };
  });

  // ── v1/currency ─ currency.controller.ts ───────────────────────────────
  const FLAGS: Record<string, string> = {
    USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', CHF: '🇨🇭', JPY: '🇯🇵', CAD: '🇨🇦', AUD: '🇦🇺', DKK: '🇩🇰',
    HKD: '🇭🇰', SEK: '🇸🇪', NOK: '🇳🇴', CNY: '🇨🇳', SGD: '🇸🇬', KRW: '🇰🇷', INR: '🇮🇳', BRL: '🇧🇷',
    MXN: '🇲🇽', NZD: '🇳🇿', ZAR: '🇿🇦', PLN: '🇵🇱', TRY: '🇹🇷', RUB: '🇷🇺', ILS: '🇮🇱', TWD: '🇹🇼',
  };

  // GET v1/currency/available — @Public(); currencies of tracked tickers.
  r.get('/v1/currency/available', { auth: 'public' }, (c) => {
    const codes = [...new Set(['USD', ...c.state.tickers.map((t) => t.currency).filter(Boolean)])].sort();
    return { currencies: codes.map((code) => ({ code, flag: FLAGS[code] || '💱' })) };
  });

  // GET v1/currency/rates — @Public(); USD-based table.
  r.get('/v1/currency/rates', { auth: 'public' }, (c) => ({
    base: 'USD',
    rates: FX_RATES,
    lastUpdated: iso(c.state.now - 25 * 60_000),
    supported: Object.keys(FX_RATES).sort(),
  }));

  // GET v1/currency/convert?amount=&from=&to= — @Public().
  r.get('/v1/currency/convert', { auth: 'public' }, (c) => {
    const amount = parseFloat(c.query.get('amount') ?? '');
    if (Number.isNaN(amount)) throw badRequest('Invalid amount');
    const from = (c.query.get('from') ?? '').toUpperCase();
    const to = (c.query.get('to') ?? '').toUpperCase();
    const rate = fxRate(from, to);
    if (rate === null) throw new HttpError(503, `Exchange rate for ${from}/${to} unavailable`);
    return { from, to, amount, converted: amount * rate, rate };
  });

  // POST v1/currency/backfill-tickers — @Roles('admin').
  r.post('/v1/currency/backfill-tickers', { auth: 'admin' }, () => ({ updated: 0, skipped: 0, failed: 0 }));

  // ── v1/health ─ health.controller.ts (@Public()) ───────────────────────
  r.get('/v1/health', { auth: 'public', noError: true }, () => ({ status: 'ok', db: 'up', env: 'mock' }));
}

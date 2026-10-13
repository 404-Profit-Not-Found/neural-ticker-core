// Read-side builders shared by several route files: they assemble the same
// composite objects the real services return.
import type { MockState, Note, Position, User } from './state.ts';
import { seedOf, tickerBySymbol, userById } from './state.ts';
import type { Candle, RiskAnalysis, TickerEntity } from './market.ts';
import { dailyHistory, isUsStyleSymbol, latestCandle, sparkline, tickerVerdict } from './market.ts';
import { GENERAL_NEWS, companyNews } from './seed-content.ts';
import { dec, iso, notFound } from './core.ts';
import { hash } from './rng.ts';

const H = 3_600_000;

/** toAccountUser (src/modules/users/public-user.ts) — the account as its
 *  OWNER or an ADMIN sees it: every column, but secret preference values are
 *  dropped and replaced with `<key>_set: true`. Every route that returns an
 *  account goes through this (auth/profile, users/me, the admin user routes). */
export function redactUser<T extends User>(u: T): T {
  if (!u.preferences) return u;
  const safe: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(u.preferences)) {
    if (/(api_key|secret|token|password)/i.test(k)) {
      if (val != null && val !== '') safe[`${k}_set`] = true;
    } else {
      safe[k] = val;
    }
  }
  return { ...u, preferences: safe };
}

/** TickersService.getTicker: unknown → 404 "not found in any provider"
 *  (the real service would first ask Finnhub/Yahoo and create the row);
 *  hidden → 404 unless admin. */
export function requireTicker(state: MockState, symbol: string, isAdmin = false): TickerEntity {
  const t = tickerBySymbol(state, symbol);
  if (!t) throw notFound(`Ticker ${symbol.toUpperCase()} not found in any provider`);
  if (!isAdmin && t.is_hidden) throw notFound(`Ticker ${symbol} not found`);
  return t;
}

/** ensureTicker without the hidden check (snapshot, news, watchlist adds). */
export function ensureTicker(state: MockState, symbol: string): TickerEntity {
  const t = tickerBySymbol(state, symbol);
  if (!t) throw notFound(`Ticker ${symbol.toUpperCase()} not found in any provider`);
  return t;
}

export function notesFor(state: MockState, symbol: string): Note[] {
  return state.notes.filter((n) => n.tickers.includes(symbol));
}

/** ResearchService.getLatestNoteForTicker. */
export function latestNoteFor(state: MockState, symbol: string): Note | null {
  return (
    notesFor(state, symbol)
      .filter((n) => n.status === 'completed')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

/** toPublicUser (src/modules/users/public-user.ts) — the ONLY shape in which a
 *  user is embedded in someone else's response (note / comment / reply author,
 *  @mention target). No email, google_id, full_name, role, credits or
 *  preferences. `nickname` is never empty: an account without one gets an
 *  id-derived handle, never the email. */
export interface PublicUser {
  id: string;
  nickname: string;
  avatar_url: string | null;
  tier: string;
}

export function publicUser(u: User | null | undefined): PublicUser | null {
  if (!u) return null;
  return {
    id: u.id,
    nickname: u.nickname || `Trader-${u.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}`,
    avatar_url: u.avatar_url ?? null,
    tier: u.tier ?? 'free',
  };
}

/** toAdminUserSummary — the public view plus contact fields; ADMIN-ONLY
 *  listings that embed a user (ticker requests). */
export function adminUserSummary(u: User | null | undefined): (PublicUser & { email: string; full_name: string | null }) | null {
  const pub = publicUser(u);
  if (!u || !pub) return null;
  return { ...pub, email: u.email, full_name: u.full_name ?? null };
}

/** ResearchService.getLatestNoteForTicker — what the PUBLIC ticker page
 *  (GET /v1/tickers/:symbol/composite, unauthenticated) gets of the ticker's
 *  latest completed research: a summary only. Never the answer, the asker's
 *  question, the raw LLM response, the numeric context or the author — and a
 *  user's personal daily digest never stands in for a ticker's research. */
export function publicNoteSummary(state: MockState, symbol: string): Record<string, unknown> | null {
  const n = notesFor(state, symbol)
    .filter((x) => x.status === 'completed' && (x.title === null || !x.title.startsWith('Smart News Briefing')))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!n) return null;
  return {
    id: n.id,
    title: n.title,
    status: n.status,
    tickers: n.tickers,
    provider: n.provider,
    models_used: n.models_used,
    rarity: n.rarity,
    quality_score: n.quality_score,
    created_at: n.created_at,
    updated_at: n.updated_at,
  };
}

/** A note as ResearchService returns it together with its author
 *  (getResearchNote, getLatestNoteForTicker, findAll): `user` is the author's
 *  PUBLIC view, or null for system notes. Notes returned without their author
 *  (upload, title update, the daily digest) are the bare row — no `user` key. */
export function noteView(state: MockState, n: Note): Note & { user: PublicUser | null } {
  return { ...n, user: publicUser(userById(state, n.user_id)) };
}

// ── news ─────────────────────────────────────────────────────────────────

export interface CompanyNewsRow {
  id: string;
  symbol_id: string;
  external_id: string;
  datetime: string;
  headline: string;
  source: string;
  url: string;
  summary: string;
  image: string | null;
  related: string | null;
  created_at: string;
}

/** company_news rows for a ticker, newest first (entity shape — note
 *  `datetime` is an ISO timestamp here, unlike the general feed). */
export function companyNewsRows(state: MockState, t: TickerEntity): CompanyNewsRow[] {
  const s = seedOf(state, t.symbol);
  const base = hash('news:' + t.symbol) % 900_000;
  return companyNews(s).map((n, i) => ({
    id: String(100_000 + base + i),
    symbol_id: t.id,
    external_id: String(130_000_000 + base * 10 + i),
    datetime: iso(state.now - n.ageH * H),
    headline: n.headline,
    source: n.source,
    url: `https://example.com/news/${t.symbol.toLowerCase()}/${i + 1}`,
    summary: n.summary,
    image: n.image ? `/api/__mock/news-image/${(base + i) % 12}.svg` : '',
    related: n.related,
    created_at: iso(state.now - n.ageH * H + 60_000),
  }));
}

/** Finnhub `/news?category=general` items, passed through untouched by
 *  MarketDataService.getGeneralNews: `datetime` is EPOCH SECONDS, `id` a number. */
export function generalNewsRows(state: MockState): Array<Record<string, unknown>> {
  return GENERAL_NEWS.map((n, i) => ({
    category: n.category,
    datetime: Math.floor((state.now - n.ageH * H) / 1000),
    headline: n.headline,
    id: 7_400_000 + i,
    image: n.image ? `/api/__mock/news-image/${i % 12}.svg` : '',
    related: n.related,
    source: n.source,
    summary: n.summary,
    url: `https://example.com/markets/${i + 1}`,
  }));
}

// ── snapshot / analyzer ──────────────────────────────────────────────────

export function commentCount(state: MockState, symbol: string): number {
  return state.comments.filter((c) => c.ticker_symbol === symbol).length;
}

function counts(state: MockState, t: TickerEntity): Record<string, number> {
  return {
    news: companyNewsRows(state, t).length,
    research: notesFor(state, t.symbol).length,
    analysts: (state.ratings.get(t.id) ?? []).length,
    social: commentCount(state, t.symbol),
  };
}

/** MarketDataService.scenarioTargets — `bear_price` / `base_price` of an AI
 *  analysis: the `price_mid` of its 'bear' / 'base' scenario as a number, or
 *  null when that scenario is missing. ONE definition for every endpoint that
 *  returns `aiAnalysis` (analyzer and snapshots), because the UI derives
 *  upside, downside and the AI rating from these two values. */
export function scenarioTargets(risk: RiskAnalysis): { bear_price: number | null; base_price: number | null } {
  const mid = (type: string): number | null => {
    const sc = risk.scenarios.find((x) => x.scenario_type === type);
    if (!sc || sc.price_mid === null || sc.price_mid === undefined || sc.price_mid === '') return null;
    const price = parseFloat(String(sc.price_mid));
    return Number.isFinite(price) ? price : null;
  };
  return { bear_price: mid('bear'), base_price: mid('base') };
}

/** The server's AI rating of a ticker — `rating` / `rating_score`, the two
 *  fields every endpoint adds to the analysis it returns (analyzer and
 *  snapshots: `aiAnalysis`; composite and public report: `risk_analysis`).
 *  Same derivation everywhere, so a client can show it instead of
 *  recomputing. */
export function ratingOf(state: MockState, t: TickerEntity, close: number | null): ReturnType<typeof tickerVerdict> {
  const risk = state.risk.get(t.id) ?? null;
  return tickerVerdict({
    close,
    analysis: risk ? { ...risk, ...scenarioTargets(risk) } : null,
    fundamentals: state.fundamentals.get(t.id) ?? null,
    news_sentiment: t.news_sentiment,
    news_impact_score: t.news_impact_score,
  });
}

/** RiskAnalysis loaded with `relations: ['scenarios']` only, plus the same
 *  `bear_price` / `base_price` the analyzer returns for the ticker and the
 *  server's rating. */
function riskWithScenarios(
  risk: RiskAnalysis,
  verdict: ReturnType<typeof tickerVerdict>,
): Omit<RiskAnalysis, 'qualitative_factors' | 'catalysts'> & {
  bear_price: number | null;
  base_price: number | null;
  rating: string | null;
  rating_score: number | null;
} {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { qualitative_factors, catalysts, ...rest } = risk;
  return { ...rest, ...scenarioTargets(risk), rating: verdict.rating, rating_score: verdict.score };
}

/**
 * MarketDataService.performGetSnapshot
 * (src/modules/market-data/market-data.service.ts).
 *  - `live` = single-ticker path: a provider quote was just fetched, so
 *    `quote` is populated and `source` names the provider.
 *  - bulk path (`updateIfStale: false`): `quote` is null, `source` "database".
 */
export function snapshot(state: MockState, symbol: string, live: boolean): Record<string, unknown> {
  const t = ensureTicker(state, symbol);
  const s = seedOf(state, t.symbol);
  const candle = latestCandle(s, t.id, state.now);
  const risk = state.risk.get(t.id) ?? null;
  const yahoo = !isUsStyleSymbol(t.symbol);
  const prev = candle.prevClose ?? candle.close;
  const d = candle.close - prev;
  const quote = !live
    ? null
    : yahoo
      ? { c: candle.close, d: +d.toFixed(4), dp: +((d / prev) * 100).toFixed(4), o: candle.open, h: candle.high, l: candle.low }
      : { c: candle.close, d: +d.toFixed(4), dp: +((d / prev) * 100).toFixed(4), h: candle.high, l: candle.low, o: candle.open, pc: prev, t: Math.floor(state.now / 1000) };
  let title: string | undefined = risk?.metadata?.summary as string | undefined;
  if (risk?.research_note_id && !title) {
    title = state.notes.find((n) => n.id === risk.research_note_id)?.title ?? undefined;
  }
  return {
    ticker: t,
    latestPrice: candle,
    quote,
    fundamentals: state.fundamentals.get(t.id) ?? null,
    aiAnalysis: risk ? riskWithScenarios(risk, ratingOf(state, t, candle.close)) : null,
    source: live ? (yahoo ? 'yahoo' : 'finnhub') : 'database',
    news: risk
      ? {
          sentiment: risk.sentiment,
          score: risk.overall_score,
          summary: title || 'AI Risk Analysis Update',
          updated_at: risk.created_at,
        }
      : null,
    counts: counts(state, t),
    sparkline: sparkline(s, t.id, state.now),
  };
}

export interface AnalyzerRow {
  t: TickerEntity;
  item: Record<string, unknown>;
  // sort / filter keys
  changePct: number;
  /** null = not analysed: no rating, sorts last, matches no rating filter. */
  verdictScore: number | null;
  rating: string | null;
  upside: number | null;
  downside: number | null;
  researchCount: number;
}

/** One element of GET /market-data/analyzer `items`
 *  (MarketDataService.getAnalyzerTickers). */
export function analyzerRow(state: MockState, t: TickerEntity): AnalyzerRow {
  const s = seedOf(state, t.symbol);
  const candle = latestCandle(s, t.id, state.now);
  const fund = state.fundamentals.get(t.id) ?? null;
  const risk = state.risk.get(t.id) ?? null;
  const prev = candle.prevClose;
  const changePct = prev ? ((candle.close - prev) / prev) * 100 : 0;
  // Same definition as the snapshots (scenarioTargets): a "0.00" bear target
  // comes through as the number 0, a missing scenario as null.
  const { base_price: basePrice, bear_price: bearPrice } = risk ? scenarioTargets(risk) : { base_price: null, bear_price: null };
  // Upside, downside, score and rating: the server's ONE derivation (the real
  // API computes them in SQL — VERDICT_SQL — for filter, sort and payload).
  const verdict = ratingOf(state, t, candle.close);
  const { upside, downside } = verdict;
  const c = counts(state, t);
  let ai: Record<string, unknown> | null = null;
  if (risk) {
    // `t.latestRisk` is the bare entity (no relations) + two scenario prices.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { scenarios, qualitative_factors, catalysts, ...cols } = risk;
    ai = { ...cols, bear_price: bearPrice, base_price: basePrice, rating: verdict.rating, rating_score: verdict.score };
  }
  return {
    t,
    changePct,
    verdictScore: verdict.score,
    rating: verdict.rating,
    upside,
    downside,
    researchCount: c.research ?? 0,
    item: {
      ticker: {
        id: t.id,
        symbol: t.symbol,
        name: t.name,
        exchange: t.exchange,
        currency: t.currency,
        logo_url: t.logo_url,
        news_sentiment: t.news_sentiment,
        news_impact_score: t.news_impact_score,
        sector: t.sector || fund?.sector || t.finnhub_industry || 'Unknown',
        industry: t.industry || t.finnhub_industry,
      },
      latestPrice: { ...candle, change: Number.isNaN(changePct) ? 0 : changePct },
      fundamentals: fund ?? {},
      aiAnalysis: ai,
      counts: { analysts: c.analysts, research: c.research, social: c.social, news: c.news },
      sparkline: sparkline(s, t.id, state.now),
    },
  };
}

// ── portfolio ────────────────────────────────────────────────────────────

/** A portfolio_positions row as Postgres hands it back: the two decimal
 *  columns have no transformer, so they are STRINGS ("120.00"). */
export function positionRow(p: Position): Record<string, unknown> {
  return { ...p, shares: dec(p.shares, 2), buy_price: dec(p.buy_price, 2) };
}

/** PortfolioService.findAll enrichment for one lot (native currency). */
export function enrichPosition(state: MockState, p: Position): Record<string, unknown> {
  let snap: Record<string, unknown> | null = null;
  try {
    snap = snapshot(state, p.symbol, false);
  } catch {
    snap = null;
  }
  let currentPrice = Number(p.buy_price);
  let changePercent = 0;
  const lp = snap?.latestPrice as Candle | undefined;
  if (lp) {
    currentPrice = Number(lp.close);
    if (lp.prevClose) changePercent = ((lp.close - lp.prevClose) / lp.prevClose) * 100;
  }
  const currentValue = p.shares * currentPrice;
  const costBasis = p.shares * p.buy_price;
  const gainLoss = currentValue - costBasis;
  return {
    ...positionRow(p),
    ...(snap ?? {}),
    current_price: currentPrice,
    change_percent: changePercent,
    current_value: currentValue,
    cost_basis: costBasis,
    gain_loss: gainLoss,
    gain_loss_percent: costBasis > 0 ? (gainLoss / costBasis) * 100 : 0,
  };
}

// ── currency ─────────────────────────────────────────────────────────────

/** CurrencyService.FALLBACK_RATES (units per 1 USD). */
export const FX_RATES: Record<string, number> = {
  USD: 1, EUR: 0.872, GBP: 0.7559, CHF: 0.8068, JPY: 161.2229, CAD: 1.4149, AUD: 1.4256,
  DKK: 6.5065, HKD: 7.8377, SEK: 9.5792, NOK: 9.693, CNY: 6.789, SGD: 1.2907, KRW: 1531.0046,
  INR: 94.4113, BRL: 5.1559, MXN: 17.3329, NZD: 1.7419, ZAR: 16.4561, PLN: 3.7124,
  TRY: 46.4549, ILS: 2.9592, TWD: 31.6463, CZK: 21.1057, HUF: 306.9427,
};

/** CurrencyService.getRate. */
export function fxRate(from: string, to: string): number | null {
  if (from === to) return 1;
  const a = from === 'USD' ? 1 : FX_RATES[from];
  const b = to === 'USD' ? 1 : FX_RATES[to];
  if (!a || !b) return null;
  return b / a;
}

// ── history lookup shared by routes ──────────────────────────────────────

export function historyBetween(state: MockState, t: TickerEntity, fromMs: number, toMs: number): Candle[] {
  return dailyHistory(seedOf(state, t.symbol), t.id, state.now).filter((c) => {
    const ts = Date.parse(c.ts);
    return ts >= fromMs && ts <= toMs;
  });
}

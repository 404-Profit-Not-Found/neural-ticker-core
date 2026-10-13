// Deterministic market data: entities shaped like the TypeORM rows the real
// API serialises (tickers, fundamentals, price_ohlcv, risk_analyses, …).
//
// Mirrors:
//  - src/modules/tickers/entities/ticker.entity.ts
//  - src/modules/market-data/entities/{price-ohlcv,fundamentals,analyst-rating,company-news}.entity.ts
//  - src/modules/risk-reward/entities/risk-{analysis,scenario,catalyst,qualitative-factor}.entity.ts
//  - src/lib/ticker-verdict.ts (the server's AI rating; maths from the UI's rating-utils.ts)
import type { SeedTicker } from './seed-tickers.ts';
import { scenarioTargets } from './seed-tickers.ts';
import {
  ANALYST_FIRMS,
  CATALYSTS_LONG,
  CATALYSTS_NEAR,
  OPPORTUNITIES,
  RED_FLAGS,
  STRENGTHS,
  THREATS,
  WEAKNESSES,
} from './seed-content.ts';
import { gauss, hash, pick, rng, round, uuid } from './rng.ts';
import { dec, iso, isoDate } from './core.ts';

const DAY = 86_400_000;

export const priceDp = (p: number): number => (p < 1 ? 4 : 2);
const rp = (p: number): number => round(p, p < 1 ? 4 : 2);

// ── entities ─────────────────────────────────────────────────────────────

export interface TickerEntity {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  country: string;
  ipo_date: string | null;
  /** Raw Finnhub value: MILLIONS (fundamentals.market_cap is in units). */
  market_capitalization: number | null;
  /** Raw Finnhub value: millions of shares. */
  share_outstanding: number | null;
  phone: string | null;
  web_url: string | null;
  logo_url: string | null;
  finnhub_industry: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  is_hidden: boolean;
  finnhub_raw: Record<string, unknown> | null;
  news_summary: string | null;
  news_sentiment: string | null;
  news_impact_score: number | null;
  last_news_update: string | null;
  created_at: string;
  updated_at: string;
}

const SECTOR_BLURB: Record<string, string> = {
  Technology: 'develops software, devices and cloud services for consumers and enterprises. Revenue comes from product sales, subscriptions and usage-based platform fees, sold directly and through partners in more than 100 countries',
  Semiconductors: 'designs and sells semiconductors and the software around them for data centres, PCs, vehicles and consumer devices. Customers include cloud providers, device makers and distributors; manufacturing is largely outsourced to foundries',
  Media: 'operates digital platforms and content businesses, earning most of its revenue from advertising and subscriptions. It reaches several billion users through its apps, websites and partner networks',
  Retail: 'sells consumer goods through stores, marketplaces and its own logistics network, alongside membership, advertising and cloud services',
  Automobiles: 'designs, manufactures and sells passenger vehicles, with a growing share of revenue from software, energy and services',
  Banking: 'provides consumer and commercial banking, investment banking, markets and asset-management services to individuals, companies and governments',
  'Financial Services': 'runs payment, lending and trading platforms, earning fees on the volume that flows across its network',
  Insurance: 'is a holding company with insurance and reinsurance at its core, plus wholly owned businesses in rail, energy, manufacturing and retail and a large portfolio of listed equities',
  'Health Care': 'offers health-benefit plans and health services, serving individuals, employers and government programmes',
  Pharmaceuticals: 'discovers, develops and sells medicines across cardiometabolic, oncology, immunology and neuroscience indications',
  Energy: 'explores for, produces, refines and markets oil, natural gas and petrochemicals, with a growing low-carbon portfolio',
  Beverages: 'makes and distributes non-alcoholic beverages through a global network of bottling partners',
  'Aerospace & Defense': 'designs, builds and services commercial aircraft, defence systems and space hardware for airlines and governments',
  Utilities: 'plans, builds and operates wind and solar parks, selling the projects or the electricity they generate',
  Machinery: 'manufactures trucks, buses, construction equipment and marine and industrial engines, and provides financing and services for them',
};

function describe(s: SeedTicker): string {
  const blurb = SECTOR_BLURB[s.sector] ?? 'sells its products and services to consumer, enterprise and government customers worldwide';
  return `${s.name} ${blurb}. The company reports in ${s.currency} and its shares trade on ${s.exchange} under the symbol ${s.sym}.`;
}

export function buildTicker(s: SeedTicker, id: number, now: number): TickerEntity {
  const r = rng('ticker:' + s.sym);
  const created = now - (200 + Math.floor(r() * 500)) * DAY;
  const shares = round((s.mcapB * 1000) / s.price, 4); // millions
  return {
    id: String(id),
    symbol: s.sym,
    name: s.name,
    exchange: s.exchange,
    currency: s.currency,
    country: s.country,
    ipo_date: `${1975 + Math.floor(r() * 45)}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`,
    market_capitalization: round(s.mcapB * 1000, 4),
    share_outstanding: shares,
    phone: s.country === 'US' ? `1${4080000000 + Math.floor(r() * 9999999)}` : null,
    web_url: s.web ?? `https://www.${s.sym.split('.')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '')}.com/`,
    // Real rows hold the provider's CDN URL (profile.logo, e.g.
    // https://static2.finnhub.io/…/AAPL.png). The mock points at its own
    // logo endpoint instead so nothing is fetched from the internet.
    logo_url: s.logo === 'none' ? null : `/api/v1/tickers/${encodeURIComponent(s.sym)}/logo`,
    finnhub_industry: s.sector,
    sector: s.sector,
    industry: s.industry,
    description: describe(s),
    is_hidden: !!s.hidden,
    finnhub_raw: {
      country: s.country,
      currency: s.currency,
      exchange: s.exchange,
      finnhubIndustry: s.sector,
      marketCapitalization: round(s.mcapB * 1000, 4),
      name: s.name,
      shareOutstanding: shares,
      ticker: s.sym,
    },
    news_summary: s.sentiment
      ? `${s.name}: ${s.sentiment.toLowerCase()} set-up into the next catalyst.`
      : null,
    news_sentiment: s.sentiment ?? null,
    news_impact_score: s.newsImpact ?? null,
    last_news_update: s.sentiment ? iso(now - 5 * 3_600_000) : null,
    created_at: iso(created),
    updated_at: iso(now - Math.floor(r() * 20) * 3_600_000),
  };
}

// ── price history ────────────────────────────────────────────────────────

export interface Candle {
  symbol_id: string;
  ts: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number | null;
  volume: number;
  source: string;
  inserted_at: string;
}

const HISTORY_DAYS = 1305; // ≈ 5 trading years, what the composite endpoint returns

/** Most recent weekday at UTC midnight (price_ohlcv.ts for '1d' rows is
 *  normalised to UTC midnight — normalizeDateToUtcMidnight). */
export function lastTradingDay(now: number): number {
  let d = Math.floor(now / DAY) * DAY;
  for (;;) {
    const dow = new Date(d).getUTCDay();
    if (dow !== 0 && dow !== 6) return d;
    d -= DAY;
  }
}

const historyCache = new Map<string, Candle[]>();

/** Five years of daily candles ending at the seed price. Same symbol → same
 *  series every run (only the dates slide with the calendar). */
export function dailyHistory(s: SeedTicker, tickerId: string, now: number): Candle[] {
  const end = lastTradingDay(now);
  const key = `${s.sym}:${end}`;
  const hit = historyCache.get(key);
  if (hit) return hit;

  const r = rng('hist:' + s.sym);
  const dt = 1 / 252;
  const closes: number[] = new Array<number>(HISTORY_DAYS);
  closes[HISTORY_DAYS - 1] = s.price;
  closes[HISTORY_DAYS - 2] = s.price / (1 + s.chg / 100);
  for (let i = HISTORY_DAYS - 3; i >= 0; i--) {
    // A slow regime wave on top of the walk gives charts some structure.
    const wave = Math.sin(i / 55 + (hash(s.sym) % 7)) * 0.0009;
    const step = (s.drift - (s.vol * s.vol) / 2) * dt + wave + s.vol * Math.sqrt(dt) * gauss(r);
    closes[i] = (closes[i + 1] as number) / Math.exp(step);
  }

  const dates: number[] = new Array<number>(HISTORY_DAYS);
  let d = end;
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    dates[i] = d;
    do d -= DAY;
    while ([0, 6].includes(new Date(d).getUTCDay()));
  }

  const shares = (s.mcapB * 1e9) / s.price;
  const baseVol = Math.max(50_000, shares * (0.004 + s.vol * 0.012));
  const rv = rng('vol:' + s.sym);
  const out: Candle[] = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const close = closes[i] as number;
    const prev = i > 0 ? (closes[i - 1] as number) : close * (1 - 0.002);
    const open = prev * (1 + gauss(rv) * s.vol * 0.012);
    const range = Math.abs(gauss(rv)) * s.vol * 0.02 + 0.002;
    const high = Math.max(open, close) * (1 + range * rv());
    const low = Math.min(open, close) * (1 - range * rv());
    const isLast = i === HISTORY_DAYS - 1;
    out.push({
      symbol_id: tickerId,
      ts: iso(dates[i] as number),
      timeframe: '1d',
      open: rp(open),
      high: rp(high),
      low: rp(low),
      close: rp(close),
      // Only the quote-derived latest candle carries prevClose in real data.
      prevClose: isLast ? rp(prev) : null,
      volume: Math.round(baseVol * Math.exp(gauss(rv) * 0.35) * (1 + Math.abs(close / prev - 1) * 18)),
      source: isLast ? (isUsStyleSymbol(s.sym) ? 'finnhub_quote' : 'yahoo_quote') : 'yahoo_historical',
      inserted_at: iso((dates[i] as number) + 22 * 3_600_000),
    });
  }
  historyCache.set(key, out);
  return out;
}

export function latestCandle(s: SeedTicker, tickerId: string, now: number): Candle {
  const h = dailyHistory(s, tickerId, now);
  return h[h.length - 1] as Candle;
}

/** Last 14 daily closes, oldest first (MarketDataService sparkline). */
export function sparkline(s: SeedTicker, tickerId: string, now: number): number[] {
  return dailyHistory(s, tickerId, now)
    .slice(-14)
    .map((c) => c.close);
}

/** Intraday bars — the real API proxies Yahoo's chart for these intervals and
 *  returns { ts, open, high, low, close, volume, symbol_id, timeframe, source }. */
export function intradayHistory(
  s: SeedTicker,
  tickerId: string,
  interval: string,
  fromMs: number,
  toMs: number,
  now: number,
): Array<Omit<Candle, 'prevClose' | 'inserted_at'>> {
  const minutes = interval === '1h' ? 60 : parseInt(interval, 10) || 5;
  const isEu = s.sym.includes('.');
  const openMin = isEu ? 7 * 60 : 13 * 60 + 30; // UTC
  const sessionMin = isEu ? 510 : 390;
  const bars = Math.max(1, Math.floor(sessionMin / minutes));
  const days = dailyHistory(s, tickerId, now).filter((c) => {
    const t = Date.parse(c.ts);
    return t + DAY > fromMs && t <= toMs;
  });
  const out: Array<Omit<Candle, 'prevClose' | 'inserted_at'>> = [];
  for (const day of days) {
    const r = rng(`intra:${s.sym}:${day.ts}:${interval}`);
    const t0 = Date.parse(day.ts) + openMin * 60_000;
    let last = day.open;
    for (let i = 0; i < bars; i++) {
      const ts = t0 + i * minutes * 60_000;
      if (ts > now) break;
      const progress = (i + 1) / bars;
      // Brownian bridge from the day's open to its close, kept inside H/L.
      const target = day.open + (day.close - day.open) * progress;
      const noise = gauss(r) * (day.high - day.low) * 0.18 * Math.sqrt(progress * (1 - progress) + 0.02);
      const close = i === bars - 1 ? day.close : Math.min(day.high, Math.max(day.low, target + noise));
      const hi = Math.min(day.high, Math.max(last, close) * (1 + r() * 0.0012));
      const lo = Math.max(day.low, Math.min(last, close) * (1 - r() * 0.0012));
      out.push({
        ts: iso(ts),
        open: rp(last),
        high: rp(Math.max(hi, last, close)),
        low: rp(Math.min(lo, last, close)),
        close: rp(close),
        volume: Math.round((day.volume / bars) * (0.5 + r())),
        symbol_id: tickerId,
        timeframe: interval,
        source: 'yahoo_intraday',
      });
      last = close;
    }
  }
  return out;
}

// ── fundamentals ─────────────────────────────────────────────────────────

export interface Fundamentals {
  symbol_id: string;
  market_cap: number | null;
  shares_outstanding: number | null;
  pe_ttm: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  eps_ttm: number | null;
  dividend_yield: number | null;
  beta: number | null;
  debt_to_equity: number | null;
  revenue_ttm: number | null;
  gross_margin: number | null;
  net_profit_margin: number | null;
  operating_margin: number | null;
  roe: number | null;
  roa: number | null;
  price_to_book: number | null;
  book_value_per_share: number | null;
  free_cash_flow_ttm: number | null;
  earnings_growth_yoy: number | null;
  current_ratio: number | null;
  quick_ratio: number | null;
  interest_coverage: number | null;
  debt_to_assets: number | null;
  net_income_ttm: number | null;
  total_debt: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  total_cash: number | null;
  next_earnings_date: string | null;
  next_earnings_estimate_eps: number | null;
  consensus_rating: string | null;
  sector: string | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  yahoo_metadata: Record<string, unknown> | null;
  updated_at: string;
}

export function buildFundamentals(s: SeedTicker, tickerId: string, now: number): Fundamentals {
  const r = rng('fund:' + s.sym);
  const mcap = s.mcapB * 1e9;
  const profitable = s.pe !== null;
  const netIncome = profitable ? mcap / (s.pe as number) : -mcap * (0.05 + r() * 0.25);
  const netMargin = profitable ? 0.06 + r() * 0.3 : -(0.1 + r() * 0.9);
  const revenue = Math.abs(netIncome / netMargin);
  const shares = mcap / s.price;
  const year = dailyHistory(s, tickerId, now).slice(-252);
  const hi = Math.max(...year.map((c) => c.high));
  const lo = Math.min(...year.map((c) => c.low));
  const grossMargin = round(Math.min(0.88, Math.max(0.08, netMargin + 0.25 + r() * 0.25)), 4);
  const totalDebt = revenue * (0.1 + r() * 0.6);
  const totalAssets = revenue * (0.9 + r() * 1.6);
  return {
    symbol_id: tickerId,
    market_cap: round(mcap, 4),
    shares_outstanding: round(shares, 2),
    pe_ttm: s.pe,
    trailing_pe: s.pe,
    forward_pe: profitable ? round((s.pe as number) * (0.72 + r() * 0.2), 4) : null,
    eps_ttm: round(netIncome / shares, 4),
    // Stored as a FRACTION here (0.0044 = 0.44%), which is how v1's
    // FinancialHealth renders it (value * 100). The real column is filled
    // from Finnhub's `dividendYieldIndicatedAnnual` unmodified — see the
    // hand-off notes about that unit.
    dividend_yield: s.dividend != null ? round(s.dividend / 100, 4) : null,
    beta: round(0.45 + s.vol * 2.1, 4),
    // Yahoo debtToEquity / 100 (applyYahooEnrichment).
    debt_to_equity: round(0.1 + r() * 1.9, 4),
    revenue_ttm: Math.round(revenue),
    // Margins and returns are fractions (0.4621 = 46.21%).
    gross_margin: grossMargin,
    net_profit_margin: round(netMargin, 4),
    operating_margin: round(netMargin + (profitable ? 0.04 + r() * 0.06 : 0.05), 4),
    roe: round(profitable ? 0.08 + r() * 0.5 : -(0.1 + r() * 0.6), 4),
    roa: round(profitable ? 0.03 + r() * 0.2 : -(0.05 + r() * 0.3), 4),
    price_to_book: round(1.2 + r() * 24, 4),
    book_value_per_share: round(s.price / (1.2 + r() * 12), 4),
    free_cash_flow_ttm: Math.round(profitable ? netIncome * (0.7 + r() * 0.6) : netIncome * 0.8),
    earnings_growth_yoy: round(profitable ? -0.1 + r() * 0.7 : -(r() * 0.4), 4),
    current_ratio: round(0.7 + r() * 2.6, 4),
    quick_ratio: round(0.5 + r() * 2.1, 4),
    interest_coverage: profitable ? round(3 + r() * 40, 4) : null,
    debt_to_assets: round(totalDebt / totalAssets, 4),
    net_income_ttm: Math.round(netIncome),
    total_debt: Math.round(totalDebt),
    total_assets: Math.round(totalAssets),
    total_liabilities: Math.round(totalAssets * (0.35 + r() * 0.4)),
    total_cash: Math.round(revenue * (0.05 + r() * 0.4)),
    next_earnings_date: isoDate(now + (6 + Math.floor(r() * 60)) * DAY),
    next_earnings_estimate_eps: round((netIncome / shares / 4) * (1 + r() * 0.1), 4),
    consensus_rating: s.consensus,
    sector: s.sector,
    fifty_two_week_high: rp(hi),
    fifty_two_week_low: rp(lo),
    // The real column stores the full raw Yahoo quoteSummary blob; the mock
    // keeps only its envelope.
    yahoo_metadata: { summary: {}, quote: { currency: s.currency }, updated_at: iso(now - 3 * 3_600_000) },
    updated_at: iso(now - 3 * 3_600_000),
  };
}

// ── risk analysis ────────────────────────────────────────────────────────

export interface RiskScenario {
  id: string;
  analysis_id: string;
  scenario_type: 'bull' | 'base' | 'bear';
  /** numeric(5,4) without a transformer → string. */
  probability: string;
  description: string;
  /** numeric(10,2) without a transformer → strings. */
  price_low: string;
  price_high: string;
  price_mid: string;
  /** numeric(20,2) without a transformer → string. */
  expected_market_cap: string;
  key_drivers: string[];
}

export interface RiskAnalysis {
  id: string;
  ticker_id: string;
  created_at: string;
  model_version: string;
  overall_score: number;
  financial_risk: number;
  execution_risk: number;
  dilution_risk: number;
  competitive_risk: number;
  regulatory_risk: number;
  time_horizon_years: number;
  price_target_weighted: number;
  upside_percent: number;
  analyst_target_avg: number | null;
  analyst_target_range_low: number | null;
  analyst_target_range_high: number | null;
  sentiment: string | null;
  scenarios: RiskScenario[];
  qualitative_factors: { id: string; analysis_id: string; factor_type: string; description: string }[];
  catalysts: { id: string; analysis_id: string; timeframe: string; description: string }[];
  fundamentals: Record<string, number | null>;
  red_flags: string[];
  research_note_id: string | null;
  metadata: Record<string, unknown> | null;
}

export function buildRisk(s: SeedTicker, tickerId: string, now: number): RiskAnalysis | null {
  if (s.score === null) return null;
  const r = rng('risk:' + s.sym);
  const id = String(5000 + Number(tickerId));
  const p = s.price;
  const { bull, base, bear } = scenarioTargets(s);
  const mcap = s.mcapB * 1e9;
  const clamp = (n: number): number => round(Math.min(10, Math.max(0, n)), 2);
  let sid = Number(id) * 10;
  const scenario = (
    type: 'bull' | 'base' | 'bear',
    prob: number,
    mid: number,
    description: string,
    drivers: string[],
  ): RiskScenario => ({
    id: String(sid++),
    analysis_id: id,
    scenario_type: type,
    probability: dec(prob, 4),
    description,
    price_low: dec(mid * 0.92, 2),
    price_high: dec(mid * 1.08, 2),
    price_mid: dec(mid, 2),
    expected_market_cap: dec((mcap * mid) / p, 2),
    key_drivers: drivers,
  });
  const weighted = rp(bull * 0.25 + base * 0.5 + bear * 0.25);
  const nRed = s.risk >= 8 ? 4 : s.risk >= 6 ? 3 : s.risk >= 4 ? 2 : 1;
  const flags = [...RED_FLAGS].sort(() => r() - 0.5).slice(0, nRed);
  let qid = Number(id) * 100;
  const factors = [
    ...STRENGTHS.slice(0, 2 + Math.floor(r() * 2)).map((d) => ({ factor_type: 'strength', description: d })),
    ...WEAKNESSES.slice(0, 1 + Math.floor(r() * 2)).map((d) => ({ factor_type: 'weakness', description: d })),
    ...OPPORTUNITIES.map((d) => ({ factor_type: 'opportunity', description: d })),
    ...THREATS.slice(0, 2).map((d) => ({ factor_type: 'threat', description: d })),
  ].map((f) => ({ id: String(qid++), analysis_id: id, ...f }));
  const cats = [
    ...CATALYSTS_NEAR.slice(0, 2 + Math.floor(r() * 2)).map((d) => ({ timeframe: 'near_term', description: d })),
    ...CATALYSTS_LONG.slice(0, 2).map((d) => ({ timeframe: 'long_term', description: d })),
  ].map((c) => ({ id: String(qid++), analysis_id: id, ...c }));
  return {
    id,
    ticker_id: tickerId,
    created_at: iso(now - (1 + Math.floor(r() * 9)) * DAY - Math.floor(r() * DAY)),
    model_version: '2.1.0',
    overall_score: s.score,
    financial_risk: s.risk,
    execution_risk: clamp(s.risk + (r() - 0.3) * 2.4),
    dilution_risk: clamp(s.pe === null ? s.risk + 1 : s.risk - 1.5 + r()),
    competitive_risk: clamp(3 + r() * 4.5),
    regulatory_risk: clamp(2 + r() * 5),
    time_horizon_years: 3,
    price_target_weighted: weighted,
    upside_percent: round(((base - p) / p) * 100, 2),
    analyst_target_avg: s.consensus ? rp(p * (1 + (s.upside + 4) / 100)) : null,
    analyst_target_range_low: s.consensus ? rp(p * 0.78) : null,
    analyst_target_range_high: s.consensus ? rp(p * (1.25 + Math.max(0, s.upside) / 100)) : null,
    sentiment: s.sentiment ?? (s.score >= 7 ? 'BULLISH' : s.score < 4.5 ? 'BEARISH' : 'NEUTRAL'),
    scenarios: [
      scenario('bull', 0.25, bull, `${s.name} executes on the second growth curve and margins expand ahead of plan; the multiple re-rates toward the top of its five-year range.`, ['Operating leverage', 'New product ramp', 'Multiple expansion']),
      scenario('base', 0.5, base, 'Growth tracks consensus, margins hold, and capital returns continue at the current pace.', ['Consensus revenue growth', 'Stable margins', 'Buybacks']),
      scenario('bear', 0.25, bear, s.risk >= 8 ? 'Liquidity runs short before the business reaches scale; equity holders are diluted to near zero in a restructuring.' : 'End-demand weakens for two or more quarters and the market de-rates the stock to a trough multiple.', s.risk >= 8 ? ['Cash runway', 'Dilutive financing', 'Covenant breach'] : ['Demand air-pocket', 'Margin compression', 'De-rating']),
    ],
    qualitative_factors: factors,
    catalysts: cats,
    fundamentals: {
      cash_on_hand: Math.round(mcap * (0.02 + r() * 0.06)),
      runway_years: s.pe === null ? round(0.6 + r() * 2.5, 1) : 10,
      revenue_ttm: Math.round(mcap / (4 + r() * 6)),
      gross_margin: round(0.2 + r() * 0.5, 2),
      debt: s.risk >= 6 ? Math.round(mcap * (0.1 + r() * 0.3)) : null,
      shares_outstanding: Math.round(mcap / p),
      dilution_forecast_3yr: round(s.pe === null ? 0.15 + r() * 0.5 : r() * 0.04, 2),
    },
    red_flags: flags,
    research_note_id: null,
    metadata: { summary: `${s.sym}: ${s.score >= 7.5 ? 'quality compounder, premium justified' : s.score >= 5 ? 'balanced risk/reward' : 'thesis under pressure'}` },
  };
}

// ── analyst ratings ──────────────────────────────────────────────────────

export interface AnalystRating {
  id: string;
  symbol_id: string;
  firm: string;
  analyst_name: string | null;
  rating: string;
  price_target: number | null;
  rating_date: string;
  created_at: string;
}

const ANALYST_NAMES = ['Erik Woodring', 'Toshiya Hari', 'Harlan Sur', 'Vivek Arya', 'Tom O\'Malley', 'Aaron Rakers', 'Atif Malik', 'Timothy Arcuri', 'Mark Lipacis', 'Stacy Rasgon', 'Dan Ives', 'Blayne Curtis'];

export function buildRatings(s: SeedTicker, tickerId: string, now: number): AnalystRating[] {
  if (!s.consensus) return [];
  const r = rng('ratings:' + s.sym);
  const n = 5 + Math.floor(r() * 6);
  const bias = s.consensus === 'Strong Buy' ? 0.85 : s.consensus === 'Buy' ? 0.62 : s.consensus === 'Hold' ? 0.3 : 0.08;
  const firms = [...ANALYST_FIRMS].sort(() => r() - 0.5).slice(0, n);
  return firms
    .map((firm, i) => {
      const x = r();
      // The extraction prompt in ResearchService constrains `rating` to
      // "Buy" | "Hold" | "Sell".
      const rating = x < bias ? 'Buy' : x < bias + (1 - bias) * 0.7 ? 'Hold' : 'Sell';
      const lift = rating === 'Sell' ? -0.18 : rating === 'Hold' ? 0.02 : 0.2;
      const ageDays = 2 + Math.floor(r() * 110);
      return {
        id: uuid(`rating:${s.sym}:${i}`),
        symbol_id: tickerId,
        firm,
        analyst_name: r() < 0.8 ? pick(r, ANALYST_NAMES) : null,
        rating,
        price_target: r() < 0.92 ? rp(s.price * (1 + lift + (r() - 0.5) * 0.12)) : null,
        rating_date: isoDate(now - ageDays * DAY),
        created_at: iso(now - ageDays * DAY + 6 * 3_600_000),
      };
    })
    .sort((a, b) => b.rating_date.localeCompare(a.rating_date));
}

// ── AI rating ────────────────────────────────────────────────────────────
// The rating maths is the UI's own file — the reference the real API is held
// to (src/lib/rating-utils.ts there is a byte-for-byte copy, its SQL is
// proven equal on PostgreSQL). Imported, not ported: the mock cannot drift.
import { calculateAiRating, calculateLiveUpside } from '../src/lib/rating-utils.ts';
import type { VerdictInput } from '../src/lib/rating-utils.ts';

export { calculateAiRating };
export type { VerdictInput };

/** What the server derives a ticker's rating from (src/lib/ticker-verdict.ts
 *  `TickerVerdictRow`): its stored values. */
export interface VerdictRow {
  close: number | null;
  analysis: {
    financial_risk: number;
    overall_score: number;
    upside_percent: number;
    base_price: number | null;
    bear_price: number | null;
  } | null;
  fundamentals: {
    consensus_rating?: string | null;
    pe_ttm?: number | null;
    revenue_ttm?: number | null;
    fifty_two_week_high?: number | null;
    fifty_two_week_low?: number | null;
  } | null;
  news_sentiment?: string | null;
  news_impact_score?: number | null;
}

export interface ServerVerdict {
  /** null when the ticker has never been analysed. */
  upside: number | null;
  /** null when there is no bear target and nothing to estimate from. */
  downside: number | null;
  /** "Strong Buy" | "Buy" | "Hold" | "Sell" | "Speculative Buy" | "No Brainer";
   *  null = not analysed (no rating — not a Hold, not a Sell). */
  rating: string | null;
  score: number | null;
}

/** src/lib/ticker-verdict.ts `tickerVerdict` (= the UI's `deriveVerdict` fed
 *  the way `snapshotToTickerData` feeds it). */
export function tickerVerdict(row: VerdictRow): ServerVerdict {
  const a = row.analysis;
  if (!a) return { upside: null, downside: null, rating: null, score: null };
  const f = row.fundamentals;
  const price = Number(row.close ?? 0);
  const risk = Number(a.financial_risk || 0);
  const upside = calculateLiveUpside(price, a.base_price, Number(a.upside_percent ?? 0));
  let downside: number | null = null;
  if (typeof a.bear_price === 'number' && price > 0) downside = ((a.bear_price - price) / price) * 100;
  if (downside === null) {
    if (risk >= 8) downside = -100;
    else if (risk > 0) downside = -(risk * 2.5);
  }
  const consensus = f?.consensus_rating || '-';
  const { rating, score } = calculateAiRating({
    risk,
    upside,
    downside: downside ?? 0,
    overallScore: Number(a.overall_score ?? 0),
    consensus: consensus !== '-' ? consensus : undefined,
    peRatio: Number(f?.pe_ttm ?? 0) || undefined,
    newsSentiment: row.news_sentiment ?? undefined,
    newsImpact: row.news_impact_score ?? undefined,
    currentPrice: price,
    fiftyTwoWeekHigh: Number(f?.fifty_two_week_high ?? 0) || undefined,
    fiftyTwoWeekLow: Number(f?.fifty_two_week_low ?? 0) || undefined,
    revenueTTM: Number(f?.revenue_ttm ?? 0) || null,
  });
  return { upside, downside, rating, score: score ?? null };
}

// ── market status (port of src/modules/market-data/market-status.service.ts) ─

export interface MarketStatus {
  isOpen: boolean;
  session: 'pre' | 'regular' | 'post' | 'closed';
  timezone: string;
  exchange: string;
  region: 'US' | 'EU' | 'OTHER';
  /** Present only when the time-based fallback answered (weekends, Yahoo down). */
  fallback?: boolean;
}

/** EU venues as a symbol's exchange suffix (SAP.DE → 'DE'). */
const EU_SUFFIXES = new Set(['DE', 'L', 'PA', 'AS', 'MC', 'MI', 'SW', 'VI', 'BR', 'HE', 'CO', 'ST', 'OL']);
/** EU venues as a code in the `exchange` field. */
const EU_EXCHANGE_CODES = new Set(['LSE', 'XETRA', ...EU_SUFFIXES]);

/** Every exchange suffix the backend knows (SUFFIX_TO_CURRENCY in
 *  src/modules/tickers/utils/exchange-currency.util.ts). */
const KNOWN_EXCHANGE_SUFFIXES = new Set([
  'L', 'IL', 'DE', 'F', 'PA', 'AS', 'MI', 'MC', 'BR', 'LS', 'HE', 'IR', 'VI',
  'SW', 'ST', 'OL', 'CO', 'WA',
  'T', 'TYO', 'HK', 'SS', 'SZ', 'KS', 'KQ', 'BO', 'NS', 'AX', 'SI',
  'TO', 'V', 'SA', 'MX',
]);

/** getExchangeSuffix (same util): the part after the LAST dot when it is a
 *  known venue — SAP.DE → 'DE', VOLV-B.ST → 'ST', 7203.T → 'T' — else null
 *  (AAPL, and US share classes such as BRK.A / BRK.B). */
function exchangeSuffix(symbol: string): string | null {
  const s = symbol.trim();
  const dot = s.lastIndexOf('.');
  if (dot < 0) return null;
  const suffix = s.slice(dot + 1).toUpperCase();
  return KNOWN_EXCHANGE_SUFFIXES.has(suffix) ? suffix : null;
}

/** isUsStyleSymbol (same util): bare symbols and US share classes — a dot and
 *  ONE letter that is not a venue (BRK.A, BRK.B). Anything with an exchange
 *  suffix, known or not, is non-US. Decides Finnhub vs Yahoo as data source. */
export function isUsStyleSymbol(symbol: string): boolean {
  const s = symbol.trim();
  const dot = s.lastIndexOf('.');
  if (dot < 0) return true;
  if (exchangeSuffix(s)) return false;
  return /^[A-Za-z]$/.test(s.slice(dot + 1));
}

/**
 * Port of MarketStatusService.getRegion. Codes are matched as codes, never as
 * substrings — COIN ("CO"), SMCI ("MC"/"MI") and BRK.A ("BR") are US.
 */
export function regionOf(symbol: string, exchange = 'US'): 'US' | 'EU' | 'OTHER' {
  // 1. A known exchange suffix names the venue.
  const suffix = exchangeSuffix(symbol);
  if (suffix) return EU_SUFFIXES.has(suffix) ? 'EU' : 'OTHER';
  // 2. Otherwise the exchange field, by code.
  const upperExchange = exchange.toUpperCase();
  if (upperExchange.split(/[^A-Z0-9]+/).some((code) => EU_EXCHANGE_CODES.has(code))) return 'EU';
  // 3. Default US: bare symbols and US share classes (a dot + one letter that
  //    is not a venue). A longer unknown suffix is some other venue.
  const unknownVenueSuffix = /\.[A-Z0-9]{2,}$/i.test(symbol.trim());
  if (!unknownVenueSuffix || upperExchange.includes('NASDAQ') || upperExchange.includes('NYSE')) {
    return 'US';
  }
  return 'OTHER';
}

function localParts(now: number, timeZone: string): { dow: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(now));
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '0';
  const hour = get('hour') === '24' ? 0 : parseInt(get('hour'), 10);
  return { dow: get('weekday'), minutes: hour * 60 + parseInt(get('minute'), 10) };
}

export function marketStatus(
  region: 'US' | 'EU' | 'OTHER',
  now: number,
  force: 'auto' | 'open' | 'closed' = 'auto',
  symbol = '',
): MarketStatus {
  const tokyo = region === 'OTHER' && /\.T$/i.test(symbol);
  const tz = region === 'EU' ? 'Europe/Berlin' : tokyo ? 'Asia/Tokyo' : 'America/New_York';
  const exchange = region === 'EU' ? 'EU' : tokyo ? 'JPX' : 'US';
  const base = { timezone: tz, exchange, region };
  if (force === 'open') return { ...base, isOpen: true, session: 'regular' };
  if (force === 'closed') return { ...base, isOpen: false, session: 'closed' };
  const { dow, minutes } = localParts(now, tz);
  if (dow === 'Sat' || dow === 'Sun') {
    return { ...base, isOpen: false, session: 'closed', fallback: true };
  }
  if (region === 'EU') {
    // Xetra core hours 09:00–17:30 CET.
    const open = minutes >= 540 && minutes < 1050;
    return { ...base, isOpen: open, session: open ? 'regular' : 'closed' };
  }
  if (tokyo) {
    const open = minutes >= 540 && minutes < 930;
    return { ...base, isOpen: open, session: open ? 'regular' : 'closed' };
  }
  if (minutes >= 240 && minutes < 570) return { ...base, isOpen: false, session: 'pre' };
  if (minutes >= 570 && minutes < 960) return { ...base, isOpen: true, session: 'regular' };
  if (minutes >= 960 && minutes < 1200) return { ...base, isOpen: false, session: 'post' };
  return { ...base, isOpen: false, session: 'closed' };
}

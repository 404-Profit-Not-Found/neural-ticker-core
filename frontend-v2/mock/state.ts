// In-memory database for the mock API. `createState()` builds the seed;
// handlers mutate it; POST /api/__mock/reset rebuilds it.
//
// Row shapes follow the TypeORM entities in src/modules/**/entities. Dates are
// held as ISO strings (what the real API emits), numbers as numbers — the
// serialisers in the route files turn un-transformed decimal columns into
// strings where Postgres would.
import { createHmac } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { Scenario } from './core.ts';
import { iso, isoDate } from './core.ts';
import { rng, round2, uuid } from './rng.ts';
import { SEED_TICKERS } from './seed-tickers.ts';
import type { SeedTicker } from './seed-tickers.ts';
import {
  buildFundamentals,
  buildRatings,
  buildRisk,
  buildTicker,
  latestCandle,
} from './market.ts';
import type { AnalystRating, Fundamentals, RiskAnalysis, TickerEntity } from './market.ts';
import {
  COMMENTS,
  comparisonMarkdown,
  deepDiveMarkdown,
  digestMarkdown,
  earningsMarkdown,
  portfolioAnalysisMarkdown,
} from './seed-content.ts';

const H = 3_600_000;
const DAY = 24 * H;

// ── row types ────────────────────────────────────────────────────────────

/** src/modules/users/entities/user.entity.ts */
export interface User {
  id: string;
  email: string;
  google_id: string | null;
  full_name: string | null;
  role: string; // user | admin | waitlist | revoked
  tier: 'free' | 'pro' | 'whale';
  credits_balance: number;
  credits_reset_at: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  last_login: string;
  preferences: Record<string, unknown> | null;
  nickname: string | null;
  view_mode: string;
  has_onboarded: boolean;
  theme: string;
}

export interface AllowedUser {
  id: string;
  email: string;
  added_by: string | null;
  created_at: string;
}

export interface CreditTx {
  id: number;
  user_id: string;
  amount: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Watchlist {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WatchlistItem {
  id: string;
  watchlist_id: string;
  ticker_id: string;
  added_at: string;
}

export interface Position {
  id: string;
  user_id: string;
  symbol: string;
  shares: number;
  buy_price: number;
  buy_date: string;
  created_at: string;
  updated_at: string;
  currency: string;
}

export interface Trade {
  id: string;
  user_id: string;
  position_id: string | null;
  symbol: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
  total_value: number;
  fees: number;
  realized_pnl: number | null;
  currency: string;
  trade_date: string;
  source: string;
  external_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Cash {
  id: string;
  user_id: string;
  currency: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface PendingOrder {
  id: string;
  user_id: string;
  position_id: string | null;
  symbol: string;
  side: 'buy' | 'sell';
  shares: number;
  currency: string;
  status: 'pending' | 'filled' | 'cancelled' | 'failed';
  region: string | null;
  requested_price: number | null;
  fees: number;
  note: string | null;
  attempts: number;
  filled_at: string | null;
  filled_price: number | null;
  filled_trade_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortfolioAnalysis {
  id: string;
  userId: string;
  riskAppetite: string | null;
  horizon: string | null;
  goal: string | null;
  model: string | null;
  prompt: string;
  response: string;
  createdAt: string;
}

export interface Alert {
  id: string;
  user_id: string;
  ticker_id: string;
  symbol: string;
  alert_type: string;
  target_value: number;
  reference_price: number | null;
  enabled: boolean;
  triggered_at: string | null;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
}

/** src/modules/research/entities/research-note.entity.ts */
export interface Note {
  id: string;
  request_id: string;
  tickers: string[];
  question: string;
  provider: string;
  quality: string;
  models_used: string[];
  title: string | null;
  answer_markdown: string | null;
  full_response: string | null;
  numeric_context: Record<string, unknown>;
  grounding_metadata: Record<string, unknown> | null;
  thinking_process: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error: string | null;
  user_id: string | null;
  quality_score: number | null;
  rarity: string | null;
  content_hash: string | null;
  enrichment_status: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  ticker_symbol: string;
  content: string;
  user_id: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  moderation_status: string;
  moderation_reason: string | null;
}

export interface CommentLike {
  id: string;
  comment_id: string;
  user_id: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface PushSub {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
}

export interface TickerRequest {
  id: string;
  symbol: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface StocktwitsAnalysisRow {
  id: string;
  ticker_id: string;
  symbol: string;
  sentiment_score: number;
  sentiment_label: string;
  posts_analyzed: number;
  weighted_sentiment_score: number;
  summary: string;
  model_used: string;
  tokens_used: number | null;
  analysis_start: string;
  analysis_end: string;
  /** The entity type also declares `top_mentions`, but the prompt in
   *  StockTwitsService never asks for it, so stored rows do not have it. */
  highlights: {
    topics: string[];
    bullish_points: string[];
    bearish_points: string[];
  };
  extracted_events: unknown[];
  created_at: string;
}

export interface SseClient {
  userId: string;
  res: ServerResponse;
  lastEventId: number;
}

export interface MockState {
  /** Wall-clock "now" used for all seed timestamps. */
  now: number;
  seq: Record<string, number>;
  users: User[];
  allowed: AllowedUser[];
  creditTx: CreditTx[];
  seeds: Map<string, SeedTicker>;
  tickers: TickerEntity[];
  fundamentals: Map<string, Fundamentals>;
  risk: Map<string, RiskAnalysis | null>;
  ratings: Map<string, AnalystRating[]>;
  watchlists: Watchlist[];
  watchlistItems: WatchlistItem[];
  positions: Position[];
  trades: Trade[];
  cash: Cash[];
  pendingOrders: PendingOrder[];
  analyses: PortfolioAnalysis[];
  alerts: Alert[];
  notes: Note[];
  comments: Comment[];
  likes: CommentLike[];
  notifications: Notification[];
  pushSubs: PushSub[];
  tickerRequests: TickerRequest[];
  stocktwitsAnalyses: StocktwitsAnalysisRow[];
  deletedStocktwitsAnalyses: Set<string>;
  sseClients: Set<SseClient>;
  timers: Set<ReturnType<typeof setTimeout>>;
  /** Global scenario (a `mock_scenario` cookie overrides it per browser). */
  scenario: Scenario;
  /** Well-known ids for tests and the screenshot harness. */
  ids: { user: string; admin: string };
}

export const DEFAULT_SCENARIO: Scenario = {
  latency: 120,
  empty: false,
  error: false,
  market: 'auto',
  notify: 90,
};

export const SHARE_SECRET = 'mock-research-share-secret';

/** QualityScoringService: Common 0-40, Uncommon 41-70, Rare 71-85,
 *  Epic 86-95, Legendary 96-100. */
export function rarityOf(score: number): 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' {
  if (score <= 40) return 'Common';
  if (score <= 70) return 'Uncommon';
  if (score <= 85) return 'Rare';
  if (score <= 95) return 'Epic';
  return 'Legendary';
}

/** ResearchService.generatePublicSignature: HMAC-SHA256(secret, researchId) hex. */
export function shareSignature(researchId: string): string {
  return createHmac('sha256', SHARE_SECRET).update(researchId).digest('hex');
}

// ── lookups ──────────────────────────────────────────────────────────────

export function nextId(state: MockState, table: string): string {
  state.seq[table] = (state.seq[table] ?? 0) + 1;
  return String(state.seq[table]);
}

export function tickerBySymbol(state: MockState, symbol: string): TickerEntity | undefined {
  const up = symbol.toUpperCase();
  return state.tickers.find((t) => t.symbol === up);
}

export function tickerById(state: MockState, id: string): TickerEntity | undefined {
  return state.tickers.find((t) => t.id === id);
}

export function seedOf(state: MockState, symbol: string): SeedTicker {
  const s = state.seeds.get(symbol.toUpperCase());
  if (!s) throw new Error(`no seed for ${symbol}`);
  return s;
}

export function userById(state: MockState, id: string | null | undefined): User | undefined {
  return id ? state.users.find((u) => u.id === id) : undefined;
}

/** Register a brand-new ticker (admin approve / manual add) with synthetic
 *  but deterministic data, standing in for the Finnhub/Yahoo profile fetch in
 *  TickersService.ensureTicker. */
export function synthTicker(state: MockState, symbol: string): TickerEntity {
  const sym = symbol.toUpperCase();
  const existing = tickerBySymbol(state, sym);
  if (existing) return existing;
  const r = rng('synth:' + sym);
  const seed: SeedTicker = {
    sym,
    name: `${sym.split('.')[0]} Holdings Inc`,
    exchange: sym.includes('.') ? 'XETRA' : 'NASDAQ NMS - GLOBAL MARKET',
    currency: sym.endsWith('.DE') || sym.endsWith('.PA') || sym.endsWith('.AS') ? 'EUR' : sym.endsWith('.L') ? 'GBP' : sym.endsWith('.CO') ? 'DKK' : 'USD',
    country: sym.includes('.') ? 'DE' : 'US',
    sector: 'Technology',
    industry: null,
    price: Math.round((8 + r() * 240) * 100) / 100,
    chg: Math.round((r() * 6 - 3) * 100) / 100,
    mcapB: Math.round((1 + r() * 60) * 10) / 10,
    pe: r() < 0.7 ? Math.round((9 + r() * 50) * 10) / 10 : null,
    score: null,
    risk: 5,
    upside: 0,
    consensus: null,
    logo: 'none',
    vol: 0.3 + r() * 0.4,
    drift: r() * 0.3 - 0.05,
  };
  const id = Math.max(...state.tickers.map((t) => Number(t.id))) + 1;
  const entity = buildTicker(seed, id, Date.now());
  entity.created_at = iso(Date.now());
  entity.updated_at = entity.created_at;
  state.seeds.set(sym, seed);
  state.tickers.push(entity);
  state.fundamentals.set(entity.id, buildFundamentals(seed, entity.id, state.now));
  state.risk.set(entity.id, null);
  state.ratings.set(entity.id, []);
  return entity;
}

// ── seed ─────────────────────────────────────────────────────────────────

const NICK = ['SwiftFalcon482', 'QuietOtter17', 'IronBadger903', 'LuckyHeron256', 'BoldLynx64', 'CalmMarmot731', 'WiseRaven12', 'RapidGecko880', 'MellowYak305', 'NobleStoat49', 'ZenWalrus618', 'BraveIbis77'];

function mkUser(
  n: number,
  email: string,
  fullName: string | null,
  role: string,
  tier: User['tier'],
  credits: number,
  now: number,
  ageDays: number,
  lastLoginH: number,
  extra: Partial<User> = {},
): User {
  return {
    id: uuid('user:' + email),
    email,
    google_id: role === 'waitlist' && !fullName ? null : `1${String(1e19 + n * 7_919_191_919).slice(1, 21)}`,
    full_name: fullName,
    role,
    tier,
    credits_balance: credits,
    credits_reset_at: iso(now + 12 * DAY),
    avatar_url: '',
    created_at: iso(now - ageDays * DAY),
    updated_at: iso(now - lastLoginH * H),
    last_login: iso(now - lastLoginH * H),
    preferences: null,
    nickname: NICK[n % NICK.length] ?? null,
    view_mode: 'PRO',
    has_onboarded: true,
    theme: 'dark',
    ...extra,
  };
}

function note(
  state: MockState,
  userId: string | null,
  partial: Partial<Note> & Pick<Note, 'tickers' | 'question' | 'status'>,
  ageH: number,
): Note {
  const id = nextId(state, 'research_notes');
  const created = state.now - ageH * H;
  const n: Note = {
    id,
    request_id: uuid('note:' + id),
    provider: 'gemini',
    quality: 'deep',
    models_used: [],
    title: null,
    answer_markdown: null,
    full_response: null,
    numeric_context: {},
    grounding_metadata: null,
    thinking_process: null,
    tokens_in: null,
    tokens_out: null,
    error: null,
    user_id: userId,
    quality_score: null,
    rarity: null,
    content_hash: null,
    enrichment_status: null,
    created_at: iso(created),
    updated_at: iso(created + 4 * 60_000),
    ...partial,
  };
  if (n.quality_score !== null) n.rarity = rarityOf(n.quality_score);
  if (n.status === 'completed' && n.answer_markdown) {
    n.tokens_in ??= 6200 + (Number(id) * 137) % 9000;
    n.tokens_out ??= 2400 + (Number(id) * 211) % 5000;
    n.full_response ??= JSON.stringify({ answerMarkdown: '[omitted in mock]', models: n.models_used }, null, 2);
    n.numeric_context = Object.fromEntries(
      n.tickers.map((sym) => {
        const s = state.seeds.get(sym);
        return [sym, s ? { price: s.price, risk_reward: { overall_score: s.score, financial_risk: s.risk, upside: s.upside } } : {}];
      }),
    );
  }
  state.notes.push(n);
  return n;
}

/** Portfolio, watchlists, alerts, research, notifications for one account. */
function seedUserData(state: MockState, user: User, variant: 'full' | 'lite'): void {
  const now = state.now;
  const S = (sym: string): SeedTicker => seedOf(state, sym);
  const T = (sym: string): TickerEntity => tickerBySymbol(state, sym) as TickerEntity;
  const tag = user.id.slice(0, 8);

  // Watchlists — WatchlistService.toggleFavorite auto-creates "Favourites".
  const lists: Array<[string, string[], number]> = [
    ['Favourites', ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMD', 'PLTR', 'BRK.A', 'ASML.AS', 'MULN', 'TSM', 'EKT.DE', '7203.T'], 240],
    ['AI & Semis', ['NVDA', 'AMD', 'AVGO', 'MU', 'TSM', 'ASML.AS', 'INTC', 'SMCI'], 90],
    // EDGE: empty watchlist.
    ['Ideas (empty)', [], 3],
  ];
  for (const [name, syms, ageDays] of variant === 'full' ? lists : lists.slice(0, 2)) {
    const wl: Watchlist = {
      id: nextId(state, 'watchlists'),
      name,
      user_id: user.id,
      created_at: iso(now - ageDays * DAY),
      updated_at: iso(now - ageDays * DAY),
      deleted_at: null,
    };
    state.watchlists.push(wl);
    syms.forEach((sym, i) => {
      state.watchlistItems.push({
        id: nextId(state, 'watchlist_items'),
        watchlist_id: wl.id,
        ticker_id: T(sym).id,
        added_at: iso(now - (ageDays - i) * DAY + i * H),
      });
    });
  }

  // Portfolio — winners and losers, three currencies.
  const lots: Array<[string, number, number, number]> = [
    // symbol, shares, buy_price, days ago
    ['NVDA', 120, 48.2, 940],
    ['AAPL', 40, 171.35, 700],
    ['MSFT', 15, 402.1, 590],
    ['TSLA', 25, 291.6, 300],
    ['RIVN', 300, 17.85, 420],
    ['INTC', 200, 34.1, 510],
    ['ASML.AS', 6, 655, 260],
    ['SHEL.L', 150, 27.1, 140],
  ];
  for (const [sym, shares, buyPrice, ageDays] of variant === 'full' ? lots : lots.slice(0, 5)) {
    const created = now - ageDays * DAY;
    const pos: Position = {
      id: uuid(`pos:${tag}:${sym}`),
      user_id: user.id,
      symbol: sym,
      shares,
      buy_price: buyPrice,
      buy_date: isoDate(created),
      created_at: iso(created),
      updated_at: iso(created),
      currency: S(sym).currency,
    };
    state.positions.push(pos);
    state.trades.push(mkTrade(tag, pos.id, user.id, sym, 'buy', shares, buyPrice, S(sym).currency, created, null, 'app', null));
  }
  // Closed / partial trades for the ledger.
  const closed: Array<[string, 'buy' | 'sell', number, number, number, number | null, string, string | null]> = [
    ['AMD', 'buy', 60, 98.4, 380, null, 'app', null],
    ['AMD', 'sell', 60, 162.75, 45, round2(60 * 162.75 - 60 * 98.4), 'app', 'Took profits ahead of earnings'],
    ['PLTR', 'buy', 400, 16.9, 330, null, 'robinhood', null],
    ['PLTR', 'sell', 400, 31.4, 75, round2(400 * 31.4 - 400 * 16.9 - 1), 'robinhood', null],
    ['RIVN', 'sell', 100, 12.1, 20, round2(100 * 12.1 - 100 * 17.85), 'app', 'Cut a third of the position'],
    ['COIN', 'buy', 12, 205.3, 160, null, 'mcp', 'Imported from broker statement'],
    ['COIN', 'sell', 12, 148.2, 96, round2(12 * 148.2 - 12 * 205.3 - 2.5), 'mcp', null],
  ];
  if (variant === 'full') {
    for (const [sym, side, shares, price, ageDays, pnl, source, noteText] of closed) {
      const t = mkTrade(tag, null, user.id, sym, side, shares, price, 'USD', now - ageDays * DAY, pnl, source, noteText);
      if (sym === 'PLTR' && side === 'sell') t.fees = 1;
      if (sym === 'COIN' && side === 'sell') t.fees = 2.5;
      state.trades.push(t);
    }
  }
  const cash: Array<[string, number]> = variant === 'full' ? [['EUR', 2150], ['GBP', 310.4], ['USD', 12480.55]] : [['USD', 5000]];
  for (const [currency, amount] of cash) {
    state.cash.push({ id: uuid(`cash:${tag}:${currency}`), user_id: user.id, currency, amount, created_at: iso(now - 400 * DAY), updated_at: iso(now - 2 * DAY) });
  }
  if (variant === 'full') {
    const tsla = state.positions.find((p) => p.user_id === user.id && p.symbol === 'TSLA') as Position;
    const nvda = state.positions.find((p) => p.user_id === user.id && p.symbol === 'NVDA') as Position;
    const order = (i: number, p: Partial<PendingOrder> & Pick<PendingOrder, 'symbol' | 'side' | 'shares' | 'status'>, ageH: number): PendingOrder => ({
      id: uuid(`order:${tag}:${i}`),
      user_id: user.id,
      position_id: null,
      currency: 'USD',
      region: 'US',
      requested_price: null,
      fees: 0,
      note: null,
      attempts: 0,
      filled_at: null,
      filled_price: null,
      filled_trade_id: null,
      error: null,
      created_at: iso(now - ageH * H),
      updated_at: iso(now - ageH * H),
      ...p,
    });
    state.pendingOrders.push(
      order(1, { symbol: 'TSLA', side: 'sell', shares: 5, status: 'pending', position_id: tsla.id, requested_price: 248.5, note: 'Trim into strength' }, 3),
      order(2, { symbol: 'NVDA', side: 'buy', shares: 10, status: 'filled', position_id: nvda.id, requested_price: 117.9, filled_price: 118.05, filled_at: iso(now - 26 * H), attempts: 1 }, 40),
      order(3, { symbol: 'AAPL', side: 'sell', shares: 10, status: 'cancelled', requested_price: 229.1 }, 70),
      order(4, { symbol: 'MSFT', side: 'buy', shares: 30, status: 'failed', requested_price: 428, attempts: 3, error: 'Insufficient USD cash: need 12840.00, have 12480.55. Deposit cash first.' }, 96),
    );
    for (const [i, [risk, horizon, goal, ageH]] of ([['medium', 'medium-term', 'growth', 30], ['high', 'long-term', 'aggressive growth', 200]] as Array<[string, string, string, number]>).entries()) {
      state.analyses.push({
        id: uuid(`analysis:${tag}:${i}`),
        userId: user.id,
        riskAppetite: risk,
        horizon,
        goal,
        model: i === 0 ? 'gemini' : 'gemini-3-pro-preview',
        prompt: '[prompt omitted in mock]',
        response: portfolioAnalysisMarkdown(risk, horizon, goal),
        createdAt: iso(now - ageH * H),
      });
    }
  }

  // Alerts — some triggered.
  const alerts: Array<[string, string, number, number | null, boolean, number | null, number]> = [
    // symbol, type, target, reference, enabled, triggered hours ago, created days ago
    ['NVDA', 'price_above', 130, null, true, null, 6],
    ['TSLA', 'price_below', 250, null, true, 3, 12],
    ['PLTR', 'percent_change_up', 10, 33.8, true, 22, 9],
    ['AAPL', 'price_above', 230, null, false, 50, 30],
    ['MSFT', 'price_below', 400, null, true, null, 18],
    ['COIN', 'percent_change_down', 15, 172.3, false, null, 2],
  ];
  alerts.slice(0, variant === 'full' ? 6 : 3).forEach(([sym, type, target, ref, enabled, trigH, ageDays], i) => {
    state.alerts.push({
      id: uuid(`alert:${tag}:${i}`),
      user_id: user.id,
      ticker_id: T(sym).id,
      symbol: sym,
      alert_type: type,
      target_value: target,
      reference_price: ref,
      enabled,
      triggered_at: trigH === null ? null : iso(now - trigH * H),
      cooldown_minutes: 60,
      created_at: iso(now - ageDays * DAY),
      updated_at: iso(now - (trigH ?? ageDays * 24) * H),
    });
  });

  // Research notes: completed / processing / pending / failed.
  const deep = (sym: string, question: string, ageH: number, extra: Partial<Note> = {}): Note =>
    note(state, user.id, {
      tickers: [sym],
      question,
      status: 'completed',
      title: extra.title ?? `${sym}: ${question.replace(/\?$/, '')}`,
      answer_markdown: deepDiveMarkdown(S(sym), question),
      models_used: ['gemini-3-pro-preview'],
      quality_score: 82,
      rarity: 'Epic',
      thinking_process: 'Pulled the last three 10-K filings, reconciled segment revenue, then stress-tested the margin assumptions against the bear case.',
      grounding_metadata: {
        groundingChunks: [
          { web: { uri: 'https://www.sec.gov/cgi-bin/browse-edgar', title: 'sec.gov' } },
          { web: { uri: 'https://example.com/ir/q3-deck.pdf', title: 'Investor relations' } },
        ],
        judgment_reasoning: 'Well sourced, clear scenarios, explicit risks.',
      },
      enrichment_status: { title: 'ok', quality: 'ok', risk_analysis: 'ok', financials: 'ok' },
      ...extra,
    }, ageH);

  const nvdaNote =
    variant === 'full'
      ? deep('NVDA', 'Is the data-centre growth durable through next year?', 5, { title: 'NVDA: Data-Centre Demand Is Supply-Constrained, Not Demand-Constrained', quality_score: 97 })
      : deep('NVDA', 'How big and how durable is sovereign AI demand?', 14, { title: 'NVDA: Sovereign AI — A New Customer Class or a One-Off?', quality_score: 84 });
  if (variant === 'full') {
    deep('AAPL', 'How much of the services margin is at risk from regulation?', 28, { quality_score: 74, rarity: 'Rare' });
    note(state, user.id, { tickers: ['MSFT'], question: 'Earnings reaction', status: 'completed', title: 'MSFT Q1 Print: Azure Re-accelerates', answer_markdown: earningsMarkdown(S('MSFT')), models_used: ['gemini-3-flash-preview'], quality: 'medium', quality_score: 58, rarity: 'Uncommon', enrichment_status: { title: 'ok', quality: 'ok', risk_analysis: 'skipped' } }, 52);
    note(state, user.id, { tickers: ['NVDA', 'AMD', 'AVGO'], question: 'Compare NVDA, AMD and AVGO for a 3-year hold', status: 'completed', title: 'NVDA vs AMD vs AVGO: Which One Earns the Incremental Dollar?', answer_markdown: comparisonMarkdown(S('NVDA'), S('AMD'), S('AVGO')), provider: 'ensemble', models_used: ['gemini-3-pro-preview', 'gpt-5.1'], quality_score: 88, rarity: 'Epic', enrichment_status: { title: 'ok', quality: 'ok', risk_analysis: 'ok', financials: 'failed' } }, 75);
    deep('TSLA', 'What has to go right for the robotaxi case?', 120, { quality_score: 66, rarity: 'Rare', models_used: ['gpt-5.1'], provider: 'openai' });
    // EDGE: manual upload, very long title, no model.
    note(state, user.id, { tickers: ['ASML.AS'], question: 'Manual Upload', status: 'completed', provider: 'manual', quality: 'manual', title: 'ASML Holding: Notes From the Capital Markets Day — EUV Roadmap, High-NA Adoption Curve, China Exposure, Service Revenue Mix and What the 2030 Targets Really Imply for Free Cash Flow', answer_markdown: deepDiveMarkdown(S('ASML.AS'), 'Capital markets day notes'), models_used: [], quality_score: 41, rarity: 'Common', grounding_metadata: { judgment_reasoning: 'Mostly restates the company deck.' } }, 190);
    deep('PLTR', 'Is the valuation defensible on commercial growth alone?', 300, { quality_score: 79, rarity: 'Epic' });
    // In flight.
    note(state, user.id, { tickers: ['COIN'], question: 'Deep dive analysis into COIN', status: 'processing' }, 0.05);
    note(state, user.id, { tickers: ['JPM'], question: 'How exposed is net interest income to cuts?', status: 'pending', quality: 'medium' }, 0.01);
    // Failed.
    note(state, user.id, { tickers: ['SMCI'], question: 'Deep dive analysis into SMCI', status: 'failed', error: 'Deep research failed: 503 The model is overloaded. Please try again later.' }, 9);

    // Daily digest (ResearchService.getOrGenerateDailyDigest) — lives in the
    // same table and is what GET /news/digest returns.
    const digestTickers = ['NVDA', 'TSLA', 'AAPL', 'INTC', 'ASML.AS'];
    const d = new Date(now - 2 * H);
    note(state, user.id, {
      tickers: digestTickers,
      question: `Daily Smart News Digest for: ${digestTickers.join(', ')}`,
      status: 'completed',
      title: `Smart News Briefing (${isoDate(now)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')})`,
      answer_markdown: digestMarkdown(digestTickers.map(S)),
      quality: 'medium',
      models_used: ['gemini-3.8-flash'],
      tokens_in: 4120,
      tokens_out: 980,
    }, 2);
  }

  // Notifications (three unread).
  const notif = (i: number, type: string, title: string, message: string, data: Record<string, unknown>, ageH: number, read: boolean): void => {
    state.notifications.push({ id: uuid(`notif:${tag}:${i}`), user_id: user.id, type, title, message, read, data, created_at: iso(now - ageH * H) });
  };
  notif(1, 'research_complete', 'Research Ready: NVDA', 'Your AI research on NVDA is complete.', { researchId: nvdaNote.id, ticker: 'NVDA' }, 4.9, false);
  notif(2, 'price_alert', 'TSLA dropped to $248.50', 'TSLA fell to $248.50, below your target of $250.00.', { symbol: 'TSLA', alertType: 'price_below', targetValue: 250, currentPrice: 248.5 }, 3, false);
  if (variant === 'full') {
    notif(3, 'comment_reply', 'QuietOtter17 replied to your comment', '"Until the App Store ruling bites."', { symbol: 'AAPL', commentId: '7', parentCommentId: '6' }, 4, false);
    notif(4, 'comment_like', 'IronBadger903 liked your comment', '"Services margin keeps doing the heavy lifting. Hardware is a distribution channel at this point."', { symbol: 'AAPL', commentId: '6' }, 11, true);
    notif(5, 'price_alert', 'PLTR up 10.1%', 'PLTR is up 10.1% from $33.80 to $37.20 (target: +10.0%).', { symbol: 'PLTR', alertType: 'percent_change_up', targetValue: 10, currentPrice: 37.2 }, 22, true);
    notif(6, 'comment_mention', 'LuckyHeron256 mentioned you on NVDA', '"Anyone modelling the export-control scenario? @user you had numbers on this."', { symbol: 'NVDA', commentId: '5' }, 44, true);
    notif(7, 'research_complete_watcher', 'New research on AMD', 'New AI research on AMD has been published.', { researchId: nvdaNote.id, ticker: 'AMD' }, 60, true);
    notif(8, 'research_failed', 'Research Failed: SMCI', 'We encountered an error analyzing SMCI.', { researchId: '0', error: '503 The model is overloaded.' }, 9, true);
  }

  // Credit ledger.
  const tx = (amount: number, reason: string, metadata: Record<string, unknown> | null, ageH: number): void => {
    state.creditTx.push({ id: Number(nextId(state, 'credit_transactions')), user_id: user.id, amount, reason, metadata, created_at: iso(now - ageH * H) });
  };
  tx(-5, 'research_spend', { research_id: nvdaNote.id, model: 'gemini', quality: 'deep', ticker: 'NVDA' }, 5);
  if (variant === 'full') {
    tx(-1, 'research_spend', { model: 'gemini', quality: 'medium', ticker: 'MSFT' }, 52);
    tx(5, 'manual_contribution', { rarity: 'Rare', score: 74 }, 60);
    tx(-5, 'portfolio_analysis_spend', { riskAppetite: 'medium', horizon: 'medium-term', goal: 'growth', model: 'gemini' }, 30);
    tx(-1, 'social_analysis_spend', { symbol: 'NVDA' }, 90);
    tx(25, 'admin_gift', { gifted_by: 'admin' }, 200);
    tx(50, 'monthly_reset', null, 18 * 24);
  }
}

function mkTrade(
  tag: string,
  positionId: string | null,
  userId: string,
  symbol: string,
  side: 'buy' | 'sell',
  shares: number,
  price: number,
  currency: string,
  at: number,
  pnl: number | null,
  source: string,
  noteText: string | null,
): Trade {
  return {
    id: uuid(`trade:${tag}:${symbol}:${side}:${at}`),
    user_id: userId,
    position_id: positionId,
    symbol,
    side,
    shares,
    price,
    total_value: round2(shares * price),
    fees: 0,
    realized_pnl: pnl,
    currency,
    trade_date: isoDate(at),
    source,
    external_id: source === 'app' ? null : `ext-${symbol}-${isoDate(at)}`,
    note: noteText,
    created_at: iso(at),
    updated_at: iso(at),
  };
}

export function createState(): MockState {
  const now = Date.now();
  const state: MockState = {
    now,
    seq: { research_notes: 100, comments: 0, watchlists: 10, watchlist_items: 200, comment_likes: 0, credit_transactions: 500 },
    users: [],
    allowed: [],
    creditTx: [],
    seeds: new Map(),
    tickers: [],
    fundamentals: new Map(),
    risk: new Map(),
    ratings: new Map(),
    watchlists: [],
    watchlistItems: [],
    positions: [],
    trades: [],
    cash: [],
    pendingOrders: [],
    analyses: [],
    alerts: [],
    notes: [],
    comments: [],
    likes: [],
    notifications: [],
    pushSubs: [],
    tickerRequests: [],
    stocktwitsAnalyses: [],
    deletedStocktwitsAnalyses: new Set(),
    sseClients: new Set(),
    timers: new Set(),
    scenario: { ...DEFAULT_SCENARIO },
    ids: { user: '', admin: '' },
  };

  // Tickers.
  SEED_TICKERS.forEach((seed, i) => {
    // Clone: handlers mutate seeds (e.g. an admin logo upload flips `logo`),
    // and a reset must not inherit that.
    const s = { ...seed };
    const t = buildTicker(s, i + 1, now);
    state.seeds.set(s.sym, s);
    state.tickers.push(t);
    state.fundamentals.set(t.id, buildFundamentals(s, t.id, now));
    state.risk.set(t.id, buildRisk(s, t.id, now));
    state.ratings.set(t.id, buildRatings(s, t.id, now));
    // Touch the cache so the first page load is not paying for 40 histories.
    latestCandle(s, t.id, now);
  });

  // Users. `dev@test.com` is the dev-login default in the app's login form.
  const dev = mkUser(0, 'dev@test.com', 'Dev User', 'user', 'pro', 42, now, 410, 0.2, {
    preferences: {
      displayCurrency: 'USD',
      language: 'en',
      notifications: { push_enabled: true, email_enabled: false },
      // Secrets are stored but never returned (UsersService.redactPreferences).
      gemini_api_key: 'AIza-mock-not-a-real-key',
    },
  });
  const admin = mkUser(1, 'admin@test.com', 'Ada Admin', 'admin', 'pro', 250, now, 600, 1);
  state.users.push(
    dev,
    admin,
    mkUser(2, 'maria.keller@example.com', 'Maria Keller', 'user', 'pro', 18, now, 300, 5),
    mkUser(3, 'tomas.novak@example.com', 'Tomáš Novák', 'user', 'free', 3, now, 120, 30),
    mkUser(4, 'priya.raman@example.com', 'Priya Raman', 'user', 'whale', 480, now, 520, 2),
    mkUser(5, 'li.wei@example.com', 'Li Wei', 'user', 'free', 0, now, 45, 200),
    // EDGE: very long name + email.
    mkUser(6, 'maximilian.alexander.von.hohenzollern-sigmaringen@very-long-corporate-domain.example.com', 'Maximilian Alexander von Hohenzollern-Sigmaringen', 'user', 'free', 10, now, 14, 70),
    mkUser(7, 'second.admin@example.com', 'Juraj Hudák', 'admin', 'pro', 99, now, 590, 48),
    mkUser(8, 'waiting.one@example.com', 'Wanda Waitlist', 'waitlist', 'free', 10, now, 6, 140),
    mkUser(9, 'waiting.two@example.com', 'Walter Queue', 'waitlist', 'free', 10, now, 2, 40),
    mkUser(10, 'banned@example.com', 'Rex Revoked', 'revoked', 'free', 0, now, 200, 2000),
    // EDGE: no name, never onboarded.
    mkUser(11, 'noname@example.com', null, 'user', 'free', 10, now, 1, 20, { nickname: null, has_onboarded: false }),
  );
  state.ids = { user: dev.id, admin: admin.id };

  // Invite list (allowed_users): registered + invited-but-never-signed-up.
  const allow = (email: string, by: string, ageDays: number): void => {
    state.allowed.push({ id: uuid('allowed:' + email), email, added_by: by, created_at: iso(now - ageDays * DAY) });
  };
  for (const u of state.users.filter((x) => x.role === 'user' || x.role === 'admin')) allow(u.email, 'admin', 400);
  allow('invited.not.joined@example.com', 'admin@test.com', 9);
  allow('another.invite@example.com', 'Admin Console', 1);

  seedUserData(state, dev, 'full');
  seedUserData(state, admin, 'lite');

  // Community research by other users (ticker pages list everyone's notes).
  const others = state.users.filter((u) => u.role === 'user' && u.id !== dev.id);
  note(state, others[0]?.id ?? null, { tickers: ['NVDA'], question: 'Bear case for NVDA', status: 'completed', title: 'NVDA: The Custom-Silicon Bear Case', answer_markdown: deepDiveMarkdown(seedOf(state, 'NVDA'), 'What breaks the thesis?'), models_used: ['gpt-5.1'], provider: 'openai', quality_score: 71, rarity: 'Rare' }, 33);
  note(state, others[2]?.id ?? null, { tickers: ['NVDA'], question: 'Manual Upload', status: 'completed', provider: 'manual', quality: 'manual', title: 'Supply-chain notes (Taiwan trip)', answer_markdown: earningsMarkdown(seedOf(state, 'NVDA')), models_used: [], quality_score: 35, rarity: 'Common' }, 80);
  // System (scanner) note — user_id NULL.
  note(state, null, { tickers: ['NVDA'], question: 'Deep dive analysis into NVDA', status: 'completed', title: 'NVDA: Scheduled Risk/Reward Refresh', answer_markdown: deepDiveMarkdown(seedOf(state, 'NVDA'), 'Scheduled refresh'), models_used: ['gemini-3.8-flash'], quality: 'medium', quality_score: 64, rarity: 'Uncommon' }, 150);
  for (const sym of ['AAPL', 'MSFT', 'TSLA', 'AMD', 'LLY', 'COIN', 'ASML.AS', 'TSM', 'BRK.A']) {
    note(state, null, { tickers: [sym], question: `Deep dive analysis into ${sym}`, status: 'completed', title: `${sym}: Scheduled Risk/Reward Refresh`, answer_markdown: deepDiveMarkdown(seedOf(state, sym), 'Scheduled refresh'), models_used: ['gemini-3.8-flash'], quality: 'medium', quality_score: 60, rarity: 'Uncommon' }, 100 + sym.length * 7);
  }
  // Link each analysed ticker's risk analysis to its newest completed note.
  for (const t of state.tickers) {
    const risk = state.risk.get(t.id);
    const latest = state.notes
      .filter((n) => n.status === 'completed' && n.tickers.includes(t.symbol) && !(n.title ?? '').startsWith('Smart News Briefing'))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (risk && latest) risk.research_note_id = latest.id;
  }

  // Social comments.
  const authors = [dev, ...others];
  const author = (i: number): User => authors[i % authors.length] as User;
  for (const c of COMMENTS) {
    const id = nextId(state, 'comments');
    const created = now - c.ageH * H;
    state.comments.push({
      id,
      ticker_symbol: c.sym,
      content: c.content.replace('<@USER0>', `<@${dev.id}>`),
      user_id: author(c.author).id,
      parent_id: null,
      created_at: iso(created),
      updated_at: iso(created),
      moderation_status: c.status ?? 'ok',
      moderation_reason: null,
    });
    const likers = authors.filter((u) => u.id !== author(c.author).id);
    for (let i = 0; i < c.likes; i++) {
      state.likes.push({ id: nextId(state, 'comment_likes'), comment_id: id, user_id: likers[i % likers.length]?.id ?? uuid(`liker:${id}:${i}`), created_at: iso(created + (i + 1) * 60_000) });
      // Extra likes beyond the seeded users come from anonymous ids.
      if (i >= likers.length) (state.likes[state.likes.length - 1] as CommentLike).user_id = uuid(`liker:${id}:${i}`);
    }
    for (const rep of c.replies ?? []) {
      const rid = nextId(state, 'comments');
      const rc = now - rep.ageH * H;
      state.comments.push({ id: rid, ticker_symbol: c.sym, content: rep.content, user_id: author(rep.author).id, parent_id: id, created_at: iso(rc), updated_at: iso(rc), moderation_status: 'ok', moderation_reason: null });
      for (let i = 0; i < rep.likes; i++) {
        state.likes.push({ id: nextId(state, 'comment_likes'), comment_id: rid, user_id: uuid(`liker:${rid}:${i}`), created_at: iso(rc + (i + 1) * 60_000) });
      }
    }
  }

  // Ticker requests (admin queue).
  const req = (symbol: string, status: TickerRequest['status'], u: User, ageH: number): void => {
    state.tickerRequests.push({ id: uuid('treq:' + symbol), symbol, status, user_id: u.id, created_at: iso(now - ageH * H), updated_at: iso(now - ageH * H) });
  };
  req('ORSTED.CO', 'PENDING', dev, 6);
  req('VWS.CO', 'PENDING', author(2), 30);
  req('ARM', 'PENDING', author(3), 52);
  req('SNOW', 'APPROVED', author(1), 200);
  req('GME', 'REJECTED', author(4), 320);

  return state;
}

// Per-user data: watchlists, portfolio (paper trading), price alerts,
// notifications (+ SSE), web push, ticker requests.
import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { Ctx, Router } from './core.ts';
import { HANDLED, badRequest, conflict, dec, forbidden, iso, notFound, internalError, v, validate } from './core.ts';
import type {
  Alert,
  MockState,
  Notification,
  PendingOrder,
  Position,
  SseClient,
  Trade,
  User,
} from './state.ts';
import { nextId, seedOf, synthTicker, tickerById, tickerBySymbol, userById } from './state.ts';
import { latestCandle, marketStatus, regionOf } from './market.ts';
import { adminUserSummary, enrichPosition, ensureTicker, fxRate, positionRow } from './views.ts';
import { QUICK_RECOMMENDATION, portfolioAnalysisMarkdown } from './seed-content.ts';
import { round2 } from './rng.ts';

// ── quotas ─ src/common/quota/quota.service.ts ───────────────────────────

const LIMITS = {
  watchlists: { free: 5, pro: 25, label: 'watchlists' },
  watchlistItems: { free: 50, pro: 250, label: 'items in this watchlist' },
  portfolioPositions: { free: 50, pro: 500, label: 'portfolio positions' },
  priceAlerts: { free: 20, pro: 100, label: 'price alerts' },
} as const;

function assertWithinLimit(user: User, resource: keyof typeof LIMITS, count: number): void {
  if (user.role === 'admin') return;
  const tier = !user.tier || user.tier === 'free' ? 'free' : 'pro';
  const max = LIMITS[resource][tier];
  if (count >= max) {
    throw forbidden(`You've reached your limit of ${max} ${LIMITS[resource].label} on the ${tier} tier.`);
  }
}

// ── notifications ────────────────────────────────────────────────────────

/** Wire format of Nest's SseStream (@nestjs/core/router/sse-stream.js):
 *  `event: <type>\nid: <n>\ndata: <json>\n\n`, ids auto-incremented per
 *  connection, response headers committed with the FIRST message. */
export function sseWrite(client: { res: ServerResponse; lastEventId: number }, type: string, data: unknown): void {
  const { res } = client;
  if (res.writableEnded) return;
  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
      Pragma: 'no-cache',
      Expire: '0',
      'X-Accel-Buffering': 'no',
    });
    res.write('\n');
  }
  client.lastEventId++;
  const body = JSON.stringify(data)
    .split(/\r\n|\r|\n/)
    .map((line) => `data: ${line}\n`)
    .join('');
  res.write(`event: ${type}\nid: ${client.lastEventId}\n${body}\n`);
}

/** NotificationsService.create — persist, then push to the user's open streams. */
export function notify(
  state: MockState,
  userId: string,
  type: string,
  title: string,
  message: string,
  data?: Record<string, unknown>,
): Notification {
  const n: Notification = {
    id: randomUUID(),
    user_id: userId,
    type,
    title,
    message,
    read: false,
    data: data ?? null,
    created_at: iso(Date.now()),
  };
  state.notifications.push(n);
  for (const client of state.sseClients) {
    if (client.userId === userId) sseWrite(client, 'notification', n);
  }
  return n;
}

const AMBIENT: Array<(state: MockState, user: User) => [string, string, string, Record<string, unknown>]> = [
  () => ['price_alert', 'NVDA hit $130.00', 'NVDA reached $130.00, above your target of $130.00.', { symbol: 'NVDA', alertType: 'price_above', targetValue: 130, currentPrice: 130 }],
  () => ['comment_like', 'QuietOtter17 liked your comment', '"Agree — CoWoS is the bottleneck. Watching TSM capex for the tell."', { symbol: 'NVDA', commentId: '2' }],
  () => ['research_complete_watcher', 'New research on TSLA', 'New AI research on TSLA has been published.', { ticker: 'TSLA', researchId: '105' }],
  () => ['comment_reply', 'BoldLynx64 replied to your comment', '"Fair, but the mix shift is real."', { symbol: 'AAPL', commentId: '6' }],
];

// ── portfolio helpers ────────────────────────────────────────────────────

const todayIso = (): string => new Date().toISOString().slice(0, 10);

function cashRow(state: MockState, userId: string, currency: string): { amount: number; updated_at: string } {
  let row = state.cash.find((c) => c.user_id === userId && c.currency === currency);
  if (!row) {
    row = { id: randomUUID(), user_id: userId, currency, amount: 0, created_at: iso(Date.now()), updated_at: iso(Date.now()) };
    state.cash.push(row);
  }
  return row;
}

/** PortfolioService.adjustCashTx. */
function adjustCash(state: MockState, userId: string, currency: string, delta: number, enforce: boolean): number {
  const existing = state.cash.find((c) => c.user_id === userId && c.currency === currency);
  const current = existing ? existing.amount : 0;
  const next = round2(current + delta);
  if (enforce && next < 0) {
    throw badRequest(`Insufficient ${currency} cash: need ${Math.abs(delta).toFixed(2)}, have ${current.toFixed(2)}. Deposit cash first.`);
  }
  const row = cashRow(state, userId, currency);
  row.amount = next;
  row.updated_at = iso(Date.now());
  return next;
}

/** PortfolioService.insertTradeTx. */
function insertTrade(
  state: MockState,
  t: { userId: string; positionId: string | null; symbol: string; side: 'buy' | 'sell'; shares: number; price: number; fees?: number; realizedPnl?: number | null; currency: string; tradeDate: string; source?: string; externalId?: string | null; note?: string | null },
): Trade {
  const now = iso(Date.now());
  const trade: Trade = {
    id: randomUUID(),
    user_id: t.userId,
    position_id: t.positionId,
    symbol: t.symbol,
    side: t.side,
    shares: t.shares,
    price: t.price,
    total_value: round2(t.shares * t.price),
    fees: t.fees ?? 0,
    realized_pnl: t.realizedPnl ?? null,
    currency: t.currency,
    trade_date: t.tradeDate,
    source: t.source ?? 'app',
    external_id: t.externalId ?? null,
    note: t.note ?? null,
    created_at: now,
    updated_at: now,
  };
  state.trades.push(trade);
  return trade;
}

/** A portfolio_trades row read back from Postgres: decimals are strings. */
const tradeRow = (t: Trade): Record<string, unknown> => ({
  ...t,
  shares: dec(t.shares, 8),
  price: dec(t.price, 8),
  total_value: dec(t.total_value, 2),
  fees: dec(t.fees, 2),
  realized_pnl: t.realized_pnl === null ? null : dec(t.realized_pnl, 2),
});

/** A portfolio_pending_orders row read back from Postgres. */
const orderRow = (o: PendingOrder): Record<string, unknown> => ({
  ...o,
  shares: dec(o.shares, 8),
  requested_price: o.requested_price === null ? null : dec(o.requested_price, 8),
  fees: dec(o.fees, 2),
  filled_price: o.filled_price === null ? null : dec(o.filled_price, 8),
});

function findPosition(state: MockState, userId: string, id: string): Position {
  const p = state.positions.find((x) => x.id === id && x.user_id === userId);
  if (!p) throw notFound('Position not found');
  return p;
}

function currentPrice(state: MockState, symbol: string): number | null {
  const t = tickerBySymbol(state, symbol);
  if (!t) return null;
  const close = latestCandle(seedOf(state, t.symbol), t.id, state.now).close;
  return Number.isFinite(close) && close > 0 ? close : null;
}

/** PortfolioService.placePendingOrder. */
function placePendingOrder(
  state: MockState,
  userId: string,
  a: { position: Position; side: 'buy' | 'sell'; shares: number; currency: string; region: string; requestedPrice: number | null; fees?: number; note?: string },
): { status: 'pending'; side: 'buy' | 'sell'; order: PendingOrder } {
  if (a.side === 'sell') {
    const reserved = state.pendingOrders
      .filter((o) => o.user_id === userId && o.position_id === a.position.id && o.side === 'sell' && o.status === 'pending')
      .reduce((sum, o) => sum + o.shares, 0);
    const available = round2(a.position.shares - reserved);
    if (a.shares > available + 1e-9) {
      throw badRequest(`Cannot queue a sell of ${a.shares}: only ${available} shares available (${reserved} already queued).`);
    }
  }
  const now = iso(Date.now());
  const order: PendingOrder = {
    id: randomUUID(),
    user_id: userId,
    position_id: a.position.id,
    symbol: a.position.symbol,
    side: a.side,
    shares: a.shares,
    currency: a.currency,
    status: 'pending',
    region: a.region,
    requested_price: a.requestedPrice,
    fees: a.fees ?? 0,
    note: a.note ?? null,
    attempts: 0,
    filled_at: null,
    filled_price: null,
    filled_trade_id: null,
    error: null,
    created_at: now,
    updated_at: now,
  };
  state.pendingOrders.push(order);
  return { status: 'pending', side: a.side, order };
}

const positionDtoChecks = (partial: boolean) => (o: Record<string, unknown>, has: (k: string) => boolean): Array<string | null> => {
  const need = (k: string): boolean => !partial || has(k);
  return [
    // Messages in class-validator order (last decorator first).
    ...(need('symbol') ? [v.isNotEmpty(o, 'symbol'), v.isString(o, 'symbol')] : []),
    ...(need('shares') ? [v.min(o, 'shares', 0.01), v.isNumber(o, 'shares')] : []),
    ...(need('buy_price') ? [v.min(o, 'buy_price', 0.01), v.isNumber(o, 'buy_price')] : []),
    ...(need('buy_date') ? [v.isDateString(o, 'buy_date')] : []),
    ...(has('currency') ? [v.isIn(o, 'currency', ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD']), v.isString(o, 'currency')] : []),
  ];
};

export function registerUser(r: Router): void {
  // ── v1/watchlists ─ src/modules/watchlist/watchlist.controller.ts ──────

  // GET v1/watchlists — lists oldest first, each with items[] and the full
  // ticker row per item (no prices here — the UI asks /market-data/snapshots).
  r.get('/v1/watchlists', { auth: 'user', empty: () => [] }, (c) => {
    const me = c.user as User;
    return c.state.watchlists
      .filter((w) => w.user_id === me.id && !w.deleted_at)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((w) => ({
        ...w,
        items: c.state.watchlistItems
          .filter((i) => i.watchlist_id === w.id)
          .map((i) => ({ ...i, ticker: tickerById(c.state, i.ticker_id) }))
          .filter((i) => i.ticker && (me.role === 'admin' || !i.ticker.is_hidden)),
      }));
  });

  // POST v1/watchlists { name } — returns the existing list when the name is
  // taken; 403 on quota.
  r.post('/v1/watchlists', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const name = c.body?.name as string;
    const mine = c.state.watchlists.filter((w) => w.user_id === me.id && !w.deleted_at);
    const existing = mine.find((w) => w.name === name);
    if (existing) return existing;
    assertWithinLimit(me, 'watchlists', mine.length);
    // `name` is NOT NULL and there is no DTO: a missing name is a DB error.
    if (name === undefined || name === null) throw internalError();
    const now = iso(Date.now());
    const wl = { id: nextId(c.state, 'watchlists'), name, user_id: me.id, created_at: now, updated_at: now, deleted_at: null };
    c.state.watchlists.push(wl);
    return wl;
  });

  // POST v1/watchlists/favorites/toggle { symbol } — @HttpCode(200).
  r.post('/v1/watchlists/favorites/toggle', { auth: 'user', status: 200 }, (c) => {
    const me = c.user as User;
    const symbol = c.body?.symbol as string;
    let wl = c.state.watchlists.find((w) => w.user_id === me.id && !w.deleted_at && w.name === 'Favourites');
    if (!wl) {
      const now = iso(Date.now());
      wl = { id: nextId(c.state, 'watchlists'), name: 'Favourites', user_id: me.id, created_at: now, updated_at: now, deleted_at: null };
      c.state.watchlists.push(wl);
    }
    const t = ensureTicker(c.state, String(symbol ?? ''));
    if (me.role !== 'admin' && t.is_hidden) throw notFound(`Ticker ${symbol} not found`);
    const listId = wl.id;
    const existing = c.state.watchlistItems.find((i) => i.watchlist_id === listId && i.ticker_id === t.id);
    if (existing) {
      c.state.watchlistItems = c.state.watchlistItems.filter((i) => i !== existing);
      return { added: false, message: `${symbol} removed from Favourites` };
    }
    c.state.watchlistItems.push({ id: nextId(c.state, 'watchlist_items'), watchlist_id: listId, ticker_id: t.id, added_at: iso(Date.now()) });
    return { added: true, message: `${symbol} added to Favourites` };
  });

  const ownList = (c: Ctx): { id: string; name: string; updated_at: string; deleted_at: string | null } => {
    const wl = c.state.watchlists.find((w) => w.id === c.params.id && w.user_id === (c.user as User).id && !w.deleted_at);
    if (!wl) throw notFound('Watchlist not found or access denied');
    return wl;
  };

  // PATCH v1/watchlists/:id { name }.
  r.patch('/v1/watchlists/:id', { auth: 'user' }, (c) => {
    const wl = ownList(c);
    wl.name = c.body?.name as string;
    wl.updated_at = iso(Date.now());
    return wl;
  });

  // POST v1/watchlists/:id/items { symbol } — 404 unknown/hidden ticker,
  // 409 duplicate, 403 quota. Returns the bare watchlist_items row.
  r.post('/v1/watchlists/:id/items', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const wl = ownList(c);
    const symbol = String(c.body?.symbol ?? '');
    const t = ensureTicker(c.state, symbol);
    if (me.role !== 'admin' && t.is_hidden) throw notFound(`Ticker ${symbol} not found`);
    const items = c.state.watchlistItems.filter((i) => i.watchlist_id === wl.id);
    if (items.some((i) => i.ticker_id === t.id)) throw conflict(`${symbol} is already in this watchlist`);
    assertWithinLimit(me, 'watchlistItems', items.length);
    const item = { id: nextId(c.state, 'watchlist_items'), watchlist_id: wl.id, ticker_id: t.id, added_at: iso(Date.now()) };
    c.state.watchlistItems.push(item);
    return item;
  });

  // DELETE v1/watchlists/:id/items/:itemId — `{ success: true }` even when
  // the item did not exist.
  r.delete('/v1/watchlists/:id/items/:itemId', { auth: 'user' }, (c) => {
    const wl = ownList(c);
    c.state.watchlistItems = c.state.watchlistItems.filter((i) => !(i.id === c.params.itemId && i.watchlist_id === wl.id));
    return { success: true };
  });

  // DELETE v1/watchlists/:id — soft delete.
  r.delete('/v1/watchlists/:id', { auth: 'user' }, (c) => {
    const wl = ownList(c);
    c.state.watchlistItems = c.state.watchlistItems.filter((i) => i.watchlist_id !== wl.id);
    wl.deleted_at = iso(Date.now());
    return { success: true };
  });

  // ── v1/portfolio ─ src/modules/portfolio/portfolio.controller.ts ───────

  /** PortfolioService.findAll, with the optional display-currency conversion. */
  const positions = (state: MockState, userId: string, displayCurrency?: string): Array<Record<string, unknown>> => {
    const rows = state.positions
      .filter((p) => p.user_id === userId)
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map((p) => enrichPosition(state, p));
    if (!displayCurrency) return rows;
    return rows.map((pos) => {
      const native = (pos.currency as string) || 'USD';
      if (native === displayCurrency) return { ...pos, display_currency: displayCurrency };
      const rate = fxRate(native, displayCurrency);
      if (rate === null) return { ...pos, display_currency: displayCurrency, conversion_unavailable: true };
      return {
        ...pos,
        original_currency: pos.currency,
        original_current_price: pos.current_price,
        original_current_value: pos.current_value,
        original_cost_basis: pos.cost_basis,
        original_gain_loss: pos.gain_loss,
        original_buy_price: pos.buy_price,
        currency: displayCurrency,
        current_price: (pos.current_price as number) * rate,
        current_value: (pos.current_value as number) * rate,
        cost_basis: (pos.cost_basis as number) * rate,
        gain_loss: (pos.gain_loss as number) * rate,
        // `pos.buy_price` is the decimal STRING here; JS coerces it.
        buy_price: Number(pos.buy_price) * rate,
        conversion_rate: rate,
      };
    });
  };

  // GET v1/portfolio/positions?displayCurrency= — each lot merged with its
  // full market snapshot plus current_price / gain_loss / … Note `shares` and
  // `buy_price` are decimal strings.
  r.get('/v1/portfolio/positions', { auth: 'user', empty: () => [] }, (c) =>
    positions(c.state, (c.user as User).id, c.query.get('displayCurrency') || undefined),
  );

  // POST v1/portfolio/positions — CreatePortfolioPositionDto; debits cash in
  // the ticker's native currency (400 when unfunded); 403 on quota.
  r.post('/v1/portfolio/positions', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const dto = validate(c.body, ['symbol', 'shares', 'buy_price', 'buy_date', 'currency'], positionDtoChecks(false));
    const symbol = dto.symbol as string;
    const shares = dto.shares as number;
    const buyPrice = dto.buy_price as number;
    const currency = (dto.currency as string) || tickerBySymbol(c.state, symbol)?.currency || 'USD';
    assertWithinLimit(me, 'portfolioPositions', c.state.positions.filter((p) => p.user_id === me.id).length);
    adjustCash(c.state, me.id, currency, -round2(shares * buyPrice), true);
    const now = iso(Date.now());
    const pos: Position = { id: randomUUID(), user_id: me.id, symbol, shares, buy_price: buyPrice, buy_date: dto.buy_date as string, created_at: now, updated_at: now, currency };
    c.state.positions.push(pos);
    insertTrade(c.state, { userId: me.id, positionId: pos.id, symbol, side: 'buy', shares, price: buyPrice, currency, tradeDate: pos.buy_date, source: 'app' });
    // The freshly saved entity still carries JS numbers.
    return { ...dto, currency, user_id: me.id, id: pos.id, created_at: now, updated_at: now };
  });

  // PATCH v1/portfolio/positions/:id — UpdatePortfolioPositionDto (all
  // optional). Returns the saved row: untouched decimals stay strings, the
  // fields just assigned are numbers.
  r.patch('/v1/portfolio/positions/:id', { auth: 'user' }, (c) => {
    const dto = validate(c.body, ['symbol', 'shares', 'buy_price', 'buy_date', 'currency'], positionDtoChecks(true));
    const pos = findPosition(c.state, (c.user as User).id, c.params.id as string);
    Object.assign(pos, dto);
    pos.updated_at = iso(Date.now());
    return { ...positionRow(pos), ...dto };
  });

  // DELETE v1/portfolio/positions/:id — @HttpCode(204), no body.
  r.delete('/v1/portfolio/positions/:id', { auth: 'user', status: 204 }, (c) => {
    const pos = findPosition(c.state, (c.user as User).id, c.params.id as string);
    c.state.positions = c.state.positions.filter((p) => p !== pos);
    return undefined;
  });

  // POST v1/portfolio/positions/:id/sell — SellPositionDto. Market open →
  // `{ status:'executed', side, position|null, trade, proceeds, realized_pnl,
  // cash_balance }`; closed → `{ status:'pending', side, order }`.
  r.post('/v1/portfolio/positions/:id/sell', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const dto = validate(c.body, ['shares', 'price', 'sell_date', 'fees', 'note'], (o, has) => [
      v.min(o, 'shares', 0.0001), v.isNumber(o, 'shares'),
      v.min(o, 'price', 0.0001), v.isNumber(o, 'price'),
      ...(has('sell_date') ? [v.isDateString(o, 'sell_date')] : []),
      ...(has('fees') ? [v.min(o, 'fees', 0), v.isNumber(o, 'fees')] : []),
      ...(has('note') ? [v.isString(o, 'note')] : []),
    ]);
    const pos = findPosition(c.state, me.id, c.params.id as string);
    const currency = pos.currency || 'USD';
    const shares = dto.shares as number;
    const price = dto.price as number;
    const fees = (dto.fees as number | undefined) ?? 0;
    const status = marketStatus(regionOf(pos.symbol), Date.now(), c.scenario.market, pos.symbol);
    if (!status.isOpen) {
      return placePendingOrder(c.state, me.id, { position: pos, side: 'sell', shares, currency, region: status.region, requestedPrice: price, fees: dto.fees as number | undefined, note: dto.note as string | undefined });
    }
    // PortfolioService.executeSellTx.
    const held = pos.shares;
    if (shares > held + 1e-9) throw badRequest(`Cannot sell ${shares} shares; only ${held} held.`);
    const proceeds = round2(round2(shares * price) - fees);
    const realizedPnl = round2(proceeds - round2(shares * pos.buy_price));
    const remaining = round2(held - shares);
    let updated: Record<string, unknown> | null;
    let tradePositionId: string | null;
    if (remaining <= 0) {
      c.state.positions = c.state.positions.filter((p) => p !== pos);
      updated = null;
      tradePositionId = null;
    } else {
      pos.shares = remaining;
      pos.updated_at = iso(Date.now());
      updated = { ...positionRow(pos), shares: remaining };
      tradePositionId = pos.id;
    }
    const trade = insertTrade(c.state, { userId: me.id, positionId: tradePositionId, symbol: pos.symbol, side: 'sell', shares, price, fees, realizedPnl, currency, tradeDate: (dto.sell_date as string) || todayIso(), source: 'app', note: dto.note as string | undefined });
    const cashAfter = adjustCash(c.state, me.id, currency, proceeds, false);
    return { status: 'executed', side: 'sell', position: updated, trade, proceeds, realized_pnl: realizedPnl, cash_balance: { currency, amount: cashAfter } };
  });

  // POST v1/portfolio/positions/:id/buy — BuyAtMarketDto; buys at the live
  // snapshot price. Same executed/pending split as sell.
  r.post('/v1/portfolio/positions/:id/buy', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const dto = validate(c.body, ['shares', 'fees', 'note'], (o, has) => [
      v.min(o, 'shares', 0.0001), v.isNumber(o, 'shares'),
      ...(has('fees') ? [v.min(o, 'fees', 0), v.isNumber(o, 'fees')] : []),
      ...(has('note') ? [v.isString(o, 'note')] : []),
    ]);
    const pos = findPosition(c.state, me.id, c.params.id as string);
    const currency = pos.currency || 'USD';
    const shares = dto.shares as number;
    const fees = (dto.fees as number | undefined) ?? 0;
    const status = marketStatus(regionOf(pos.symbol), Date.now(), c.scenario.market, pos.symbol);
    const price = currentPrice(c.state, pos.symbol);
    if (price == null) throw badRequest(`No live price available for ${pos.symbol}; cannot place a market buy.`);
    if (!status.isOpen) {
      const cash = c.state.cash.find((x) => x.user_id === me.id && x.currency === currency)?.amount ?? 0;
      const estCost = round2(shares * price + fees);
      if (estCost > cash) {
        throw badRequest(`Insufficient ${currency} cash: ~${estCost.toFixed(2)} needed at the current price, have ${cash.toFixed(2)}. Deposit cash first.`);
      }
      return placePendingOrder(c.state, me.id, { position: pos, side: 'buy', shares, currency, region: status.region, requestedPrice: price, fees: dto.fees as number | undefined, note: dto.note as string | undefined });
    }
    // PortfolioService.executeBuyTx — weighted-average into the lot.
    const cost = round2(shares * price + fees);
    const cashAfter = adjustCash(c.state, me.id, currency, -cost, true);
    const newShares = round2(pos.shares + shares);
    pos.buy_price = newShares > 0 ? round2((pos.shares * pos.buy_price + shares * price) / newShares) : pos.buy_price;
    pos.shares = newShares;
    pos.updated_at = iso(Date.now());
    const trade = insertTrade(c.state, { userId: me.id, positionId: pos.id, symbol: pos.symbol, side: 'buy', shares, price, fees, currency, tradeDate: todayIso(), source: 'app', note: dto.note as string | undefined });
    return { status: 'executed', side: 'buy', position: { ...pos }, trade, cost, cash_balance: { currency, amount: cashAfter } };
  });

  // GET v1/portfolio/pending-orders — newest 50, any status; decimals are strings.
  r.get('/v1/portfolio/pending-orders', { auth: 'user', empty: () => [] }, (c) =>
    c.state.pendingOrders
      .filter((o) => o.user_id === (c.user as User).id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 50)
      .map(orderRow),
  );

  // DELETE v1/portfolio/pending-orders/:id — cancels; 400 unless still pending.
  r.delete('/v1/portfolio/pending-orders/:id', { auth: 'user' }, (c) => {
    const order = c.state.pendingOrders.find((o) => o.id === c.params.id && o.user_id === (c.user as User).id);
    if (!order) throw notFound('Pending order not found');
    if (order.status !== 'pending') throw badRequest(`Order is already ${order.status}; nothing to cancel.`);
    order.status = 'cancelled';
    order.updated_at = iso(Date.now());
    return orderRow(order);
  });

  // GET v1/portfolio/summary?displayCurrency= — PortfolioService.getPortfolioSummary.
  r.get('/v1/portfolio/summary', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const display = c.query.get('displayCurrency') || undefined;
    const rows = c.scenario.empty ? [] : positions(c.state, me.id, display);
    const holdings = rows.reduce((sum, p) => sum + (Number(p.current_value) || 0), 0);
    const cash = c.scenario.empty
      ? []
      : c.state.cash.filter((x) => x.user_id === me.id).sort((a, b) => a.currency.localeCompare(b.currency)).map((x) => ({ currency: x.currency, amount: x.amount }));
    let cashValue = 0;
    for (const x of cash) {
      if (display && x.currency !== display) {
        const rate = fxRate(x.currency, display);
        cashValue += rate != null ? x.amount * rate : x.amount;
      } else cashValue += x.amount;
    }
    return {
      currency: display || (rows[0]?.currency as string) || 'USD',
      holdings_value: round2(holdings),
      cash_value: round2(cashValue),
      net_worth: round2(holdings + cashValue),
      positions_count: rows.length,
      cash_balances: cash,
    };
  });

  // GET v1/portfolio/cash — `[{ currency, amount }]`, currency ASC, amounts
  // are numbers (the service coerces them).
  r.get('/v1/portfolio/cash', { auth: 'user', empty: () => [] }, (c) =>
    c.state.cash
      .filter((x) => x.user_id === (c.user as User).id)
      .sort((a, b) => a.currency.localeCompare(b.currency))
      .map((x) => ({ currency: x.currency, amount: x.amount })),
  );

  // POST v1/portfolio/cash/deposit | withdraw — CashOperationDto.
  const cashOp = (sign: 1 | -1) => (c: Ctx): unknown => {
    const dto = validate(c.body, ['amount', 'currency', 'note'], (o, has) => [
      v.min(o, 'amount', 0.01), v.isNumber(o, 'amount'),
      ...(has('currency') ? [/^[A-Z]{3}$/.test(String(o.currency)) ? null : 'currency must be a 3-letter ISO code', v.isString(o, 'currency')] : []),
      ...(has('note') ? [v.isString(o, 'note')] : []),
    ]);
    const currency = (dto.currency as string) || 'USD';
    const amount = adjustCash(c.state, (c.user as User).id, currency, sign * round2(dto.amount as number), sign === -1);
    return { currency, amount };
  };
  r.post('/v1/portfolio/cash/deposit', { auth: 'user' }, cashOp(1));
  r.post('/v1/portfolio/cash/withdraw', { auth: 'user' }, cashOp(-1));

  // GET v1/portfolio/trades?symbol=&limit=&offset= — ledger, newest first;
  // decimal columns are strings.
  r.get('/v1/portfolio/trades', { auth: 'user', empty: () => [] }, (c) => {
    const symbol = c.query.get('symbol');
    const limit = c.query.get('limit') ? parseInt(c.query.get('limit') as string, 10) : undefined;
    const offset = c.query.get('offset') ? parseInt(c.query.get('offset') as string, 10) : 0;
    return c.state.trades
      .filter((t) => t.user_id === (c.user as User).id && (!symbol || t.symbol === symbol.toUpperCase()))
      .sort((a, b) => b.trade_date.localeCompare(a.trade_date) || b.created_at.localeCompare(a.created_at))
      .slice(offset, offset + Math.min(limit ?? 100, 500))
      .map(tradeRow);
  });

  // POST v1/portfolio/trades — RecordTradeDto; permissive external-trade
  // import, idempotent on external_id → `{ trade, idempotent }`.
  r.post('/v1/portfolio/trades', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const currencies = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];
    const dto = validate(c.body, ['symbol', 'side', 'shares', 'price', 'trade_date', 'currency', 'fees', 'position_id', 'source', 'external_id', 'note'], (o, has) => [
      v.isNotEmpty(o, 'symbol'), v.isString(o, 'symbol'),
      v.isIn(o, 'side', ['buy', 'sell']), v.isString(o, 'side'),
      v.min(o, 'shares', 0.0001), v.isNumber(o, 'shares'),
      v.min(o, 'price', 0.0001), v.isNumber(o, 'price'),
      v.isDateString(o, 'trade_date'),
      ...(has('currency') ? [v.isIn(o, 'currency', currencies), v.isString(o, 'currency')] : []),
      ...(has('fees') ? [v.min(o, 'fees', 0), v.isNumber(o, 'fees')] : []),
      ...(['position_id', 'source', 'external_id', 'note'] as const).flatMap((k) => (has(k) ? [v.isString(o, k)] : [])),
    ]);
    const symbol = (dto.symbol as string).toUpperCase();
    const currency = (dto.currency as string) || tickerBySymbol(c.state, symbol)?.currency || 'USD';
    const source = (dto.source as string) || 'mcp';
    const fees = (dto.fees as number | undefined) ?? 0;
    const shares = dto.shares as number;
    const price = dto.price as number;
    if (dto.external_id) {
      const existing = c.state.trades.find((t) => t.user_id === me.id && t.external_id === dto.external_id);
      if (existing) return { trade: tradeRow(existing), idempotent: true };
    }
    const common = { userId: me.id, symbol, shares, price, fees, currency, tradeDate: dto.trade_date as string, source, externalId: (dto.external_id as string) ?? null, note: (dto.note as string) ?? null };
    if (dto.side === 'buy') {
      adjustCash(c.state, me.id, currency, -round2(shares * price + fees), false);
      const now = iso(Date.now());
      const pos: Position = { id: randomUUID(), user_id: me.id, symbol, shares, buy_price: price, buy_date: dto.trade_date as string, created_at: now, updated_at: now, currency };
      c.state.positions.push(pos);
      return { trade: insertTrade(c.state, { ...common, positionId: pos.id, side: 'buy' }), idempotent: false };
    }
    let pos: Position | null = null;
    if (dto.position_id) pos = findPosition(c.state, me.id, dto.position_id as string);
    else pos = c.state.positions.filter((p) => p.user_id === me.id && p.symbol === symbol).sort((a, b) => a.buy_date.localeCompare(b.buy_date))[0] ?? null;
    let realizedPnl: number | null = null;
    let tradePositionId: string | null = null;
    if (pos) {
      const sell = Math.min(shares, pos.shares);
      realizedPnl = round2(round2(sell * price) - round2(sell * pos.buy_price));
      const remaining = round2(pos.shares - sell);
      if (remaining <= 0) {
        const gone = pos;
        c.state.positions = c.state.positions.filter((p) => p !== gone);
      } else {
        pos.shares = remaining;
        tradePositionId = pos.id;
      }
    }
    adjustCash(c.state, me.id, currency, round2(shares * price - fees), false);
    return { trade: insertTrade(c.state, { ...common, positionId: tradePositionId, side: 'sell', realizedPnl }), idempotent: false };
  });

  // POST v1/portfolio/analyze { riskAppetite?, horizon?, goal?, model? } —
  // CreditGuard; returns the markdown as a bare STRING (text/html), 201.
  r.post('/v1/portfolio/analyze', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const b = (c.body ?? {}) as Record<string, string | undefined>;
    creditGuard(me, b.provider, b.quality);
    if (c.state.positions.filter((p) => p.user_id === me.id).length === 0) {
      return 'You have no positions to analyze. Add some stocks to your portfolio first.';
    }
    const risk = b.riskAppetite || 'medium';
    const horizon = b.horizon || 'medium-term';
    const goal = b.goal || 'growth';
    const model = b.model || 'gemini';
    deductCredits(c.state, me, modelCost(model), 'portfolio_analysis_spend', { riskAppetite: risk, horizon, goal, model });
    const response = portfolioAnalysisMarkdown(risk, horizon, goal);
    c.state.analyses.push({ id: randomUUID(), userId: me.id, riskAppetite: risk, horizon, goal, model, prompt: '[prompt omitted in mock]', response, createdAt: iso(Date.now()) });
    return response;
  });

  // GET v1/portfolio/analyses — last 20 PortfolioAnalysis rows (camelCase columns).
  r.get('/v1/portfolio/analyses', { auth: 'user', empty: () => [] }, (c) =>
    c.state.analyses.filter((a) => a.userId === (c.user as User).id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20),
  );

  // GET v1/portfolio/quick-recommendation — free; `{ recommendation, model, positions }`.
  r.get('/v1/portfolio/quick-recommendation', { auth: 'user' }, (c) => {
    const n = c.scenario.empty ? 0 : c.state.positions.filter((p) => p.user_id === (c.user as User).id).length;
    if (n === 0) return { recommendation: 'No positions yet. Add stocks to your portfolio to get recommendations.', model: 'none', positions: 0 };
    return { recommendation: QUICK_RECOMMENDATION, model: 'gemini-3.5-flash-lite', positions: n };
  });

  // ── v1/price-alerts ─ src/modules/price-alerts/price-alerts.controller.ts ──

  // GET v1/price-alerts — newest first, each with its full `ticker` row.
  r.get('/v1/price-alerts', { auth: 'user', empty: () => [] }, (c) =>
    c.state.alerts
      .filter((a) => a.user_id === (c.user as User).id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((a) => ({ ...a, ticker: tickerById(c.state, a.ticker_id) })),
  );

  // POST v1/price-alerts — CreatePriceAlertDto; 403 quota, 404 unknown ticker.
  r.post('/v1/price-alerts', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const types = ['price_above', 'price_below', 'percent_change_up', 'percent_change_down'];
    const dto = validate(c.body, ['symbol', 'alert_type', 'target_value', 'cooldown_minutes'], (o, has) => [
      v.isString(o, 'symbol'),
      v.isIn(o, 'alert_type', types),
      v.min(o, 'target_value', 0), v.isNumber(o, 'target_value'),
      ...(has('cooldown_minutes') ? [v.min(o, 'cooldown_minutes', 1), v.isInt(o, 'cooldown_minutes')] : []),
    ]);
    assertWithinLimit(me, 'priceAlerts', c.state.alerts.filter((a) => a.user_id === me.id).length);
    const t = tickerBySymbol(c.state, dto.symbol as string);
    if (!t) throw notFound(`Ticker ${dto.symbol} not found`);
    const type = dto.alert_type as string;
    const now = iso(Date.now());
    const alert: Alert = {
      id: randomUUID(),
      user_id: me.id,
      ticker_id: t.id,
      symbol: t.symbol,
      alert_type: type,
      target_value: dto.target_value as number,
      reference_price: type.startsWith('percent') ? currentPrice(c.state, t.symbol) : null,
      enabled: true,
      triggered_at: null,
      cooldown_minutes: (dto.cooldown_minutes as number | undefined) ?? 60,
      created_at: now,
      updated_at: now,
    };
    c.state.alerts.push(alert);
    return alert;
  });

  // PATCH v1/price-alerts/:id — UpdatePriceAlertDto { enabled?, target_value?, cooldown_minutes? }.
  r.patch('/v1/price-alerts/:id', { auth: 'user' }, (c) => {
    const dto = validate(c.body, ['enabled', 'target_value', 'cooldown_minutes'], (o, has) => [
      ...(has('target_value') ? [v.min(o, 'target_value', 0), v.isNumber(o, 'target_value')] : []),
      ...(has('cooldown_minutes') ? [v.min(o, 'cooldown_minutes', 1), v.isInt(o, 'cooldown_minutes')] : []),
    ]);
    const alert = c.state.alerts.find((a) => a.id === c.params.id && a.user_id === (c.user as User).id);
    if (!alert) throw notFound('Alert not found');
    if (dto.enabled !== undefined) alert.enabled = dto.enabled as boolean;
    if (dto.target_value !== undefined) alert.target_value = dto.target_value as number;
    if (dto.cooldown_minutes !== undefined) alert.cooldown_minutes = dto.cooldown_minutes as number;
    alert.updated_at = iso(Date.now());
    return alert;
  });

  // DELETE v1/price-alerts/:id — 200 with an empty body; 404 when not found.
  r.delete('/v1/price-alerts/:id', { auth: 'user' }, (c) => {
    const before = c.state.alerts.length;
    c.state.alerts = c.state.alerts.filter((a) => !(a.id === c.params.id && a.user_id === (c.user as User).id));
    if (c.state.alerts.length === before) throw notFound('Alert not found');
    return undefined;
  });

  // ── v1/notifications ─ src/modules/notifications/notifications.controller.ts ──

  // GET v1/notifications/stream — @Sse(); `event: notification` messages
  // whose data is the Notification row. The connection stays open; the real
  // server sends nothing (not even headers) until the first notification.
  r.get('/v1/notifications/stream', { auth: 'user', noError: true }, (c) => {
    const { state, res, req } = c;
    const me = c.user as User;
    req.socket.setKeepAlive(true);
    req.socket.setNoDelay(true);
    req.socket.setTimeout(0);
    const client: SseClient = { userId: me.id, res, lastEventId: 0 };
    state.sseClients.add(client);
    // Mock extra: an "ambient" notification every `notify` seconds so the
    // bell visibly updates during development (scenario notify=0 turns it off).
    const every = c.scenario.notify;
    let n = 0;
    const timer = every > 0
      ? setInterval(() => {
          const tpl = AMBIENT[n++ % AMBIENT.length];
          if (!tpl || !userById(state, me.id)) return;
          const [type, title, message, data] = tpl(state, me);
          notify(state, me.id, type, title, message, data);
        }, every * 1000)
      : null;
    req.on('close', () => {
      if (timer) clearInterval(timer);
      state.sseClients.delete(client);
      if (!res.writableEnded) res.end();
    });
    return HANDLED;
  });

  // GET v1/notifications — newest 20.
  r.get('/v1/notifications', { auth: 'user', empty: () => [] }, (c) =>
    c.state.notifications.filter((n) => n.user_id === (c.user as User).id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20),
  );

  // GET v1/notifications/count — `{ count }` of unread.
  r.get('/v1/notifications/count', { auth: 'user', empty: () => ({ count: 0 }) }, (c) => ({
    count: c.state.notifications.filter((n) => n.user_id === (c.user as User).id && !n.read).length,
  }));

  // PATCH v1/notifications/read-all and /:id/read — both return an empty 200.
  r.patch('/v1/notifications/read-all', { auth: 'user' }, (c) => {
    for (const n of c.state.notifications) if (n.user_id === (c.user as User).id) n.read = true;
    return undefined;
  });
  r.patch('/v1/notifications/:id/read', { auth: 'user' }, (c) => {
    const n = c.state.notifications.find((x) => x.id === c.params.id && x.user_id === (c.user as User).id);
    if (n) n.read = true;
    return undefined;
  });

  // ── v1/push ─ src/modules/web-push/web-push.controller.ts ──────────────

  // GET v1/push/vapid-key — @Public(); `{ key }`. (A syntactically valid
  // P-256 public key so pushManager.subscribe() accepts it; no push is sent.)
  r.get('/v1/push/vapid-key', { auth: 'public' }, () => ({
    key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  }));

  // POST v1/push/subscribe { endpoint, keys: { p256dh, auth } } — upsert on
  // endpoint; returns the push_subscriptions row.
  r.post('/v1/push/subscribe', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const endpoint = c.body?.endpoint as string;
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw badRequest('Invalid push endpoint URL');
    }
    if (url.protocol !== 'https:') throw badRequest('Push endpoint must use https');
    const hosts = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com'];
    if (!hosts.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) {
      throw badRequest('Unrecognized push service host');
    }
    let sub = c.state.pushSubs.find((s) => s.endpoint === endpoint);
    if (!sub) {
      sub = { id: randomUUID(), user_id: me.id, endpoint, p256dh: '', auth: '', user_agent: null, created_at: iso(Date.now()) };
      c.state.pushSubs.push(sub);
    }
    sub.user_id = me.id;
    sub.p256dh = c.body?.keys?.p256dh as string;
    sub.auth = c.body?.keys?.auth as string;
    sub.user_agent = (c.req.headers['user-agent'] as string) ?? null;
    return sub;
  });

  // POST v1/push/unsubscribe { endpoint } — `{ success: true }`.
  r.post('/v1/push/unsubscribe', { auth: 'user' }, (c) => {
    c.state.pushSubs = c.state.pushSubs.filter((s) => !(s.user_id === (c.user as User).id && s.endpoint === c.body?.endpoint));
    return { success: true };
  });

  // ── v1/ticker-requests ─ src/modules/ticker-requests/ticker-requests.controller.ts ──

  // POST v1/ticker-requests { symbol } — 400 on bad format / already tracked /
  // daily cap (20); returns the caller's pending request row. When the symbol
  // is already requested by SOMEONE ELSE, only `{ symbol, status }` — never
  // their row (id, user_id, dates).
  r.post('/v1/ticker-requests', { auth: 'user' }, (c) => {
    const me = c.user as User;
    if (!c.body?.symbol) throw badRequest('Symbol is required');
    const symbol = String(c.body.symbol).trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,10}$/.test(symbol)) throw badRequest('Invalid ticker symbol format');
    const since = Date.now() - 24 * 3_600_000;
    if (c.state.tickerRequests.filter((x) => x.user_id === me.id && Date.parse(x.created_at) >= since).length >= 20) {
      throw badRequest('Daily ticker-request limit reached (20). Try again tomorrow.');
    }
    if (tickerBySymbol(c.state, symbol)) {
      throw badRequest(`Ticker ${symbol} is currently being tracked. You can search for it now.`);
    }
    const pending = c.state.tickerRequests.find((x) => x.symbol === symbol && x.status === 'PENDING');
    if (pending) return pending.user_id === me.id ? pending : { symbol, status: 'PENDING' };
    const mine = c.state.tickerRequests.find((x) => x.user_id === me.id && x.symbol === symbol);
    const now = iso(Date.now());
    if (mine) {
      mine.status = 'PENDING';
      mine.updated_at = now;
      return mine;
    }
    const req = { id: randomUUID(), symbol, status: 'PENDING' as const, user_id: me.id, created_at: now, updated_at: now };
    c.state.tickerRequests.push(req);
    return req;
  });

  // GET v1/ticker-requests — @Roles('admin'); newest first, each with a
  // summary of its requester: the public view + email / full_name (never the
  // `users` row).
  r.get('/v1/ticker-requests', { auth: 'admin', empty: () => [] }, (c) =>
    [...c.state.tickerRequests].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((x) => ({ ...x, user: adminUserSummary(userById(c.state, x.user_id)) })),
  );

  // PATCH v1/ticker-requests/:id/approve — @Roles('admin'); ensures the
  // ticker (the mock synthesises one) and marks the request APPROVED.
  r.patch('/v1/ticker-requests/:id/approve', { auth: 'admin' }, (c) => {
    const req = c.state.tickerRequests.find((x) => x.id === c.params.id);
    if (!req) throw notFound('Request not found');
    if (req.status === 'APPROVED') return req;
    synthTicker(c.state, req.symbol);
    req.status = 'APPROVED';
    req.updated_at = iso(Date.now());
    return req;
  });

  // PATCH v1/ticker-requests/:id/reject — @Roles('admin').
  r.patch('/v1/ticker-requests/:id/reject', { auth: 'admin' }, (c) => {
    const req = c.state.tickerRequests.find((x) => x.id === c.params.id);
    if (!req) throw notFound('Request not found');
    req.status = 'REJECTED';
    req.updated_at = iso(Date.now());
    return req;
  });
}

// ── credits ─ src/modules/users/credit.service.ts + research/guards/credit.guard.ts ──

/** CreditService.getResearchCost. */
export function researchCost(provider?: string, quality?: string): number {
  return (provider || '').toLowerCase() === 'ensemble' || (quality || '').toLowerCase() === 'deep' ? 5 : 1;
}

/** CreditService.getModelCost. */
export function modelCost(model?: string): number {
  if (!model) return 1;
  const m = model.toLowerCase();
  if (m.includes('pro') || m.includes('gpt-5')) return 5;
  if (['gemini-3-flash-preview', 'gemini-3-flash', 'gemini-3.8-flash', 'gemini-3.5-flash'].includes(m)) return 2;
  if (m.includes('mini') || m.includes('gpt-4') || m.includes('flash-lite')) return 1;
  return 5;
}

/** CreditGuard.canActivate — 403s with the real messages. */
export function creditGuard(user: User, provider?: string, quality?: string): void {
  const cost = researchCost(provider, quality);
  if (cost > 1 && user.tier === 'free') throw forbidden('Pro models require a Pro subscription.');
  if (user.role === 'admin') return;
  const balance = user.credits_balance ?? 0;
  if (balance < cost) throw forbidden(`Insufficient credits. You need ${cost} but have ${balance}.`);
}

/** CreditService.deductCredits. */
export function deductCredits(state: MockState, user: User, amount: number, reason: string, metadata: Record<string, unknown>): void {
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Deduction amount must be a positive number');
  if (user.credits_balance < amount) throw badRequest('Insufficient credits');
  user.credits_balance -= amount;
  state.creditTx.push({ id: Number(nextId(state, 'credit_transactions')), user_id: user.id, amount: -amount, reason, metadata, created_at: iso(Date.now()) });
}

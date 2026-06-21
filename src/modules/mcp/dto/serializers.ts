/**
 * Output helpers for MCP tools.
 *
 * Every tool returns `{ content: [{ type: 'text', text }] }`. Raw TypeORM
 * entities carry lazy/eager relations and circular back-references, so we
 * never hand them to `JSON.stringify` directly:
 *   - `toolJson` uses a circular- and bigint-safe stringify for public,
 *     non-PII payloads (market data, risk scores, currency).
 *   - The explicit `serialize*` functions whitelist fields for user-scoped
 *     entities so we never leak the full `User` relation (PII, credit balance)
 *     or unbounded nested graphs.
 */

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

/** Circular- and bigint-safe JSON stringify. */
export function safeStringify(data: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(data, (_key, value) => {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return undefined; // drop circular reference
      seen.add(value);
    }
    return value;
  });
}

/** Wrap any (plain or entity) value as a JSON text tool result. */
export function toolJson(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: safeStringify(data) }] };
}

/** Wrap a raw string (e.g. markdown answer) as a text tool result. */
export function toolText(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

/** Full research note (single-note reads). Strips the eager `user` relation. */
export function serializeResearchNote(n: any): Record<string, unknown> | null {
  if (!n) return null;
  return {
    id: String(n.id),
    request_id: n.request_id,
    tickers: n.tickers,
    question: n.question,
    provider: n.provider,
    quality: n.quality,
    models_used: n.models_used,
    title: n.title,
    answer_markdown: n.answer_markdown,
    numeric_context: n.numeric_context,
    grounding_metadata: n.grounding_metadata,
    thinking_process: n.thinking_process,
    tokens_in: n.tokens_in,
    tokens_out: n.tokens_out,
    status: n.status,
    error: n.error,
    quality_score: n.quality_score,
    rarity: n.rarity,
    user_id: n.user_id,
    created_at: n.created_at,
    updated_at: n.updated_at,
  };
}

/** Lightweight research summary (list views). */
export function serializeResearchSummary(n: any): Record<string, unknown> {
  return {
    id: String(n.id),
    tickers: n.tickers,
    question: n.question,
    title: n.title,
    provider: n.provider,
    quality: n.quality,
    status: n.status,
    quality_score: n.quality_score,
    rarity: n.rarity,
    user_id: n.user_id,
    created_at: n.created_at,
  };
}

/** Portfolio position (used when returning a freshly-created entity). */
export function serializePortfolioPosition(p: any): Record<string, unknown> {
  return {
    id: p.id,
    symbol: p.symbol,
    shares: p.shares,
    buy_price: p.buy_price,
    buy_date: p.buy_date,
    currency: p.currency,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

/** A trade-ledger entry. Strips the `user` and `position` relations. */
export function serializePortfolioTrade(t: any): Record<string, unknown> {
  return {
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    shares: Number(t.shares),
    price: Number(t.price),
    total_value: Number(t.total_value),
    fees: Number(t.fees),
    realized_pnl: t.realized_pnl == null ? null : Number(t.realized_pnl),
    currency: t.currency,
    trade_date: t.trade_date,
    source: t.source,
    external_id: t.external_id,
    note: t.note,
    position_id: t.position_id,
    created_at: t.created_at,
  };
}

/** A single cash balance row ({ currency, amount }). */
export function serializeCashBalance(c: any): Record<string, unknown> {
  return {
    currency: c.currency,
    amount: Number(c.amount),
  };
}

/** Price alert. Strips the `user` and full `ticker` relations. */
export function serializePriceAlert(a: any): Record<string, unknown> {
  return {
    id: a.id,
    symbol: a.symbol ?? a.ticker?.symbol,
    alert_type: a.alert_type,
    target_value: a.target_value,
    reference_price: a.reference_price,
    enabled: a.enabled,
    triggered_at: a.triggered_at,
    cooldown_minutes: a.cooldown_minutes,
    created_at: a.created_at,
    updated_at: a.updated_at,
  };
}

/** A single watchlist item, flattened to the essential ticker fields. */
export function serializeWatchlistItem(it: any): Record<string, unknown> {
  return {
    id: String(it.id),
    ticker_id: it.ticker_id,
    symbol: it.ticker?.symbol ?? it.symbol,
    name: it.ticker?.name ?? it.ticker?.company_name,
    added_at: it.added_at,
  };
}

/**
 * Ticker-add request. Flattens the eager `user` relation down to a safe
 * `requested_by` summary (id/name/email) for the admin list view — never the
 * full `User` (credits, preferences, etc.).
 */
export function serializeTickerRequest(r: any): Record<string, unknown> | null {
  if (!r) return null;
  const out: Record<string, unknown> = {
    id: String(r.id),
    symbol: r.symbol,
    status: r.status,
    user_id: r.user_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
  if (r.user) {
    out.requested_by = {
      id: r.user.id,
      name: r.user.full_name ?? r.user.nickname ?? null,
      email: r.user.email,
    };
  }
  return out;
}

/** Watchlist with its items. Strips the `user` relation. */
export function serializeWatchlist(w: any): Record<string, unknown> {
  return {
    id: String(w.id),
    name: w.name,
    created_at: w.created_at,
    updated_at: w.updated_at,
    items: Array.isArray(w.items) ? w.items.map(serializeWatchlistItem) : [],
  };
}

/**
 * Admin Logo Manager row. Whitelists the branding-relevant ticker fields and
 * normalizes the logo state: a saved string `'null'` (seen in legacy rows) and
 * empty strings are treated as "no logo". Accepts both a full `TickerEntity`
 * (from `updateLogo`) and the partial select from `searchTickersAdmin`.
 */
export function serializeAdminTickerLogo(
  t: any,
): Record<string, unknown> | null {
  if (!t) return null;
  const logoUrl: string | null =
    typeof t.logo_url === 'string' && t.logo_url.trim() && t.logo_url !== 'null'
      ? t.logo_url
      : null;
  return {
    id: t.id != null ? String(t.id) : undefined,
    symbol: t.symbol,
    name: t.name,
    exchange: t.exchange,
    currency: t.currency,
    logo_url: logoUrl,
    has_logo: logoUrl !== null,
  };
}

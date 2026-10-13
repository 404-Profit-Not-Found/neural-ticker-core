/**
 * LOCAL DEVELOPMENT ONLY — load the frontend mock's demo data set
 * (frontend-v2/mock) into the real tables of `neural_ticker_local`.
 *
 *   npm run seed:local
 *
 * - Hard guard first (scripts/local-db.ts): database `neural_ticker_local` on
 *   localhost only; DATABASE_URL is ignored.
 * - Idempotent: every run empties ALL application tables and reloads them in
 *   one transaction, so re-running resets the demo data. Timestamps are
 *   relative to "now", exactly as in the mock.
 * - Rows go through the app's entities, so column names, types and
 *   transformers are the app's own. What the mock serves as a computed view
 *   (analyzer rows, snapshots, portfolio values, counts, sparklines, AI
 *   rating) is NOT stored — the backend computes it from these rows.
 *
 * The schema must exist and be current: start the backend once before seeding
 * (its migrations build / update it).
 */
import type { DataSource, EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { connectLocal, resolveLocalTarget, runScript } from './local-db';
import { MockSource } from './mock-source';
import { dailyHistory } from '../frontend-v2/mock/market';
import { FX_RATES, companyNewsRows } from '../frontend-v2/mock/views';

import { User } from '../src/modules/users/entities/user.entity';
import { AllowedUser } from '../src/modules/users/entities/allowed-user.entity';
import { CreditTransaction } from '../src/modules/users/entities/credit-transaction.entity';
import { AuthLog } from '../src/modules/auth/entities/auth-log.entity';
import { TickerEntity } from '../src/modules/tickers/entities/ticker.entity';
import { TickerLogoEntity } from '../src/modules/tickers/entities/ticker-logo.entity';
import { Fundamentals } from '../src/modules/market-data/entities/fundamentals.entity';
import { PriceOhlcv } from '../src/modules/market-data/entities/price-ohlcv.entity';
import { AnalystRating } from '../src/modules/market-data/entities/analyst-rating.entity';
import { CompanyNews } from '../src/modules/market-data/entities/company-news.entity';
import { RiskAnalysis } from '../src/modules/risk-reward/entities/risk-analysis.entity';
import { RiskScenario } from '../src/modules/risk-reward/entities/risk-scenario.entity';
import { RiskQualitativeFactor } from '../src/modules/risk-reward/entities/risk-qualitative-factor.entity';
import { RiskCatalyst } from '../src/modules/risk-reward/entities/risk-catalyst.entity';
import { ResearchNote } from '../src/modules/research/entities/research-note.entity';
import { Watchlist } from '../src/modules/watchlist/entities/watchlist.entity';
import { WatchlistItem } from '../src/modules/watchlist/entities/watchlist-item.entity';
import { PortfolioPosition } from '../src/modules/portfolio/entities/portfolio-position.entity';
import { PortfolioTrade } from '../src/modules/portfolio/entities/portfolio-trade.entity';
import { PortfolioCashBalance } from '../src/modules/portfolio/entities/portfolio-cash-balance.entity';
import { PortfolioPendingOrder } from '../src/modules/portfolio/entities/portfolio-pending-order.entity';
import { PortfolioAnalysis } from '../src/modules/portfolio/entities/portfolio-analysis.entity';
import { PriceAlert } from '../src/modules/price-alerts/entities/price-alert.entity';
import { Comment } from '../src/modules/social/entities/comment.entity';
import { CommentLike } from '../src/modules/social/entities/comment-like.entity';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { TickerRequestEntity } from '../src/modules/ticker-requests/entities/ticker-request.entity';
import { StockTwitsPost } from '../src/modules/stocktwits/entities/stocktwits-post.entity';
import { StockTwitsWatcher } from '../src/modules/stocktwits/entities/stocktwits-watcher.entity';
import { StocktwitsAnalysis } from '../src/modules/stocktwits/entities/stocktwits-analysis.entity';
import { EventCalendar } from '../src/modules/stocktwits/entities/event-calendar.entity';
import { ExchangeRateEntity } from '../src/modules/currency/entities/exchange-rate.entity';

/** The two accounts the docs tell you to sign in with. */
const DEMO_LOGINS = ['dev@test.com', 'admin@test.com'];
const DIGEST_TITLE = 'Smart News Briefing';

type Row<T> = QueryDeepPartialEntity<T>;
// jsonb columns are typed Record<string, any> on the entities.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const date = (iso: string): Date => new Date(iso);
const dateOrNull = (iso: string | null | undefined): Date | null =>
  iso ? new Date(iso) : null;
const quote = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

/**
 * Insert plain rows through an entity, in chunks (Postgres caps a statement
 * at 65 535 bind parameters). Explicit ids and timestamps are kept.
 *
 * The column list is passed explicitly: left to itself TypeORM omits an
 * auto-increment primary key from the INSERT even when the row carries a
 * value. The key is listed only when the rows actually provide it, so tables
 * seeded without ids still get them from their sequence.
 */
async function insert<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  rows: Row<T>[],
  chunkSize = 500,
): Promise<void> {
  if (rows.length === 0) return;
  const columns = manager.connection
    .getMetadata(entity)
    .columns.filter((col) => col.isInsert)
    .filter(
      (col) =>
        !(col.isGenerated && col.generationStrategy === 'increment') ||
        rows.some(
          (row) => (row as ObjectLiteral)[col.propertyName] !== undefined,
        ),
    )
    .map((col) => col.propertyPath);
  for (let i = 0; i < rows.length; i += chunkSize) {
    await manager
      .createQueryBuilder()
      .insert()
      .into(entity, columns)
      .values(rows.slice(i, i + chunkSize))
      .updateEntity(false)
      .execute();
  }
}

/**
 * The schema must have every table and column the entities define. A missing
 * table means the schema was never built; a missing column means a migration
 * for an entity change is still pending — both are fixed by starting the
 * backend once. (A column the database has and the entities do not is fine.)
 */
async function assertSchemaIsCurrent(ds: DataSource): Promise<void> {
  const rows = (await ds.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema()`,
  )) as { table_name: string; column_name: string }[];
  const columns = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!columns.has(r.table_name)) columns.set(r.table_name, new Set());
    columns.get(r.table_name)?.add(r.column_name);
  }

  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  for (const meta of ds.entityMetadatas) {
    const have = columns.get(meta.tableName);
    if (!have) {
      missingTables.push(meta.tableName);
      continue;
    }
    for (const col of meta.columns) {
      if (!have.has(col.databaseName)) {
        missingColumns.push(`${meta.tableName}.${col.databaseName}`);
      }
    }
  }
  if (missingTables.length === 0 && missingColumns.length === 0) return;

  const lines = ['The database schema is not ready for seeding.'];
  if (missingTables.length > 0) {
    lines.push(`  Missing tables: ${missingTables.join(', ')}`);
  }
  if (missingColumns.length > 0) {
    lines.push(`  Missing columns: ${missingColumns.join(', ')}`);
  }
  lines.push(
    'Start the backend once (its migrations build and update the schema), then run the seed again.',
    'See docs/local-development.md.',
  );
  throw new Error(lines.join('\n'));
}

async function main(): Promise<void> {
  const target = resolveLocalTarget(); // hard guard — before anything else
  const ds = await connectLocal(target);
  try {
    console.log(
      `Database: ${target.database} @ ${target.host}:${target.port} (user ${target.username})`,
    );
    await assertSchemaIsCurrent(ds);

    const mock = new MockSource();
    const { state } = mock;
    const now = state.now;
    const notes: string[] = [];

    // ── users ────────────────────────────────────────────────────────────
    // Dev login (AuthService.localDevLogin) rewrites google_id and full_name
    // on every sign-in; the two demo accounts are seeded already in that
    // shape so signing in does not visibly change them.
    const users: Row<User>[] = state.users.map((u) => {
      const demo = DEMO_LOGINS.includes(u.email);
      return {
        id: u.id,
        email: u.email,
        google_id: demo ? `dev-${u.email}` : (u.google_id ?? undefined),
        full_name: demo ? 'Dev User' : (u.full_name ?? undefined),
        role: u.role,
        tier: u.tier,
        credits_balance: u.credits_balance,
        credits_reset_at: dateOrNull(u.credits_reset_at) ?? undefined,
        avatar_url: u.avatar_url ?? undefined,
        created_at: date(u.created_at),
        updated_at: date(u.updated_at),
        last_login: date(u.last_login),
        preferences: (u.preferences ?? undefined) as Json | undefined,
        nickname: u.nickname ?? undefined,
        view_mode: u.view_mode,
        has_onboarded: u.has_onboarded,
        theme: u.theme,
      };
    });
    const userIds = new Set(state.users.map((u) => u.id));
    const admin = state.users.find((u) => u.id === state.ids.admin) ?? null;

    const allowedUsers: Row<AllowedUser>[] = state.allowed.map((a) => ({
      id: a.id,
      email: a.email,
      added_by: a.added_by ?? undefined,
      created_at: date(a.created_at),
    }));

    // The mock derives its login history in a route.
    const authLogs: Row<AuthLog>[] = (
      await mock.get<Json[]>('/v1/users/logins?limit=1000', admin)
    ).body.map((l) => ({
      id: l.id as string,
      userId: l.userId as string,
      provider: l.provider as string,
      email: l.email as string,
      loginAt: date(l.loginAt as string),
      ipAddress: (l.ipAddress as string | null) ?? undefined,
      userAgent: (l.userAgent as string | null) ?? undefined,
    }));

    // ── tickers, logos, fundamentals, candles, ratings, news ─────────────
    const tickers: Row<TickerEntity>[] = state.tickers.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      name: t.name,
      exchange: t.exchange,
      currency: t.currency,
      country: t.country,
      ipo_date: t.ipo_date ?? undefined,
      market_capitalization: t.market_capitalization ?? undefined,
      share_outstanding: t.share_outstanding ?? undefined,
      phone: t.phone ?? undefined,
      web_url: t.web_url ?? undefined,
      logo_url: t.logo_url ?? undefined,
      finnhub_industry: t.finnhub_industry ?? undefined,
      sector: t.sector ?? undefined,
      industry: t.industry ?? undefined,
      description: t.description ?? undefined,
      is_hidden: t.is_hidden,
      finnhub_raw: (t.finnhub_raw ?? undefined) as Json | undefined,
      news_summary: t.news_summary ?? undefined,
      news_sentiment: t.news_sentiment ?? undefined,
      news_impact_score: t.news_impact_score ?? undefined,
      last_news_update: dateOrNull(t.last_news_update) ?? undefined,
      created_at: date(t.created_at),
      updated_at: date(t.updated_at),
    }));

    // GET :symbol/logo serves ticker_logos rows; the mock serves a generated
    // tile for ~80% of the universe and 404s for the rest on purpose.
    const logos: Row<TickerLogoEntity>[] = [];
    for (const t of state.tickers) {
      const res = await mock.get<string>(`/v1/tickers/${t.symbol}/logo`);
      if (res.status !== 200) continue;
      logos.push({
        symbol_id: t.id,
        image_data: Buffer.from(res.body, 'utf8'),
        mime_type: res.headers['content-type'] ?? 'image/svg+xml',
      });
    }

    const fundamentals: Row<Fundamentals>[] = [...state.fundamentals.values()].map(
      (f) => ({
        ...f,
        next_earnings_date: f.next_earnings_date ?? undefined,
        next_earnings_estimate_eps: f.next_earnings_estimate_eps ?? undefined,
        consensus_rating: f.consensus_rating ?? undefined,
        sector: f.sector ?? undefined,
        yahoo_metadata: (f.yahoo_metadata ?? undefined) as Json | undefined,
        updated_at: date(f.updated_at),
      }),
    );

    // Five years of daily candles per ticker. The composite endpoint asks for
    // five years and re-syncs from a provider when coverage is below 95%.
    const candles: Row<PriceOhlcv>[] = [];
    for (const t of state.tickers) {
      const seed = state.seeds.get(t.symbol);
      if (!seed) continue;
      for (const c of dailyHistory(seed, t.id, now)) {
        candles.push({
          symbol_id: c.symbol_id,
          ts: date(c.ts),
          timeframe: c.timeframe,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          prevClose: c.prevClose ?? undefined,
          volume: c.volume,
          source: c.source,
          inserted_at: date(c.inserted_at),
        });
      }
    }

    const ratings: Row<AnalystRating>[] = [...state.ratings.values()]
      .flat()
      .map((r) => ({
        id: r.id,
        symbol_id: r.symbol_id,
        firm: r.firm,
        analyst_name: r.analyst_name ?? undefined,
        rating: r.rating,
        price_target: r.price_target ?? undefined,
        rating_date: r.rating_date,
        created_at: date(r.created_at),
      }));

    // The mock's thumbnails are generated SVGs behind a mock-only URL; stored
    // inline (data: URI) so they render without that route.
    const thumbnails = new Map<string, string>();
    const thumbnail = async (url: string | null): Promise<string> => {
      if (!url) return '';
      const match = /\/__mock\/news-image\/(.+)$/.exec(url);
      if (!match) return url;
      const key = match[1] as string;
      if (!thumbnails.has(key)) {
        const res = await mock.get<string>(`/__mock/news-image/${key}`);
        thumbnails.set(
          key,
          res.status === 200
            ? `data:image/svg+xml;base64,${Buffer.from(res.body, 'utf8').toString('base64')}`
            : '',
        );
      }
      return thumbnails.get(key) ?? '';
    };
    const news: Row<CompanyNews>[] = [];
    for (const t of state.tickers) {
      for (const n of companyNewsRows(state, t)) {
        news.push({
          // id left to the sequence: the mock's ids are not unique across tickers.
          symbol_id: n.symbol_id,
          external_id: n.external_id,
          datetime: date(n.datetime),
          headline: n.headline,
          source: n.source,
          url: n.url,
          summary: n.summary,
          image: await thumbnail(n.image),
          related: n.related ?? undefined,
          created_at: date(n.created_at),
        });
      }
    }

    // ── research notes ───────────────────────────────────────────────────
    const researchNotes: Row<ResearchNote>[] = state.notes.map((n) => {
      // GET /news/digest serves a digest for 24 h after it was created: date
      // the seeded one "now" so a fresh seed gives the full window.
      const digest = (n.title ?? '').startsWith(DIGEST_TITLE);
      const created = digest ? new Date(now) : date(n.created_at);
      const stamp = created.toISOString();
      return {
        id: n.id,
        request_id: n.request_id,
        tickers: n.tickers,
        question: n.question,
        provider: n.provider as ResearchNote['provider'],
        quality: n.quality,
        models_used: n.models_used,
        title: digest
          ? `${DIGEST_TITLE} (${stamp.slice(0, 10)} ${stamp.slice(11, 16)})`
          : (n.title ?? undefined),
        answer_markdown: n.answer_markdown ?? undefined,
        full_response: n.full_response ?? undefined,
        numeric_context: n.numeric_context as Json,
        grounding_metadata: (n.grounding_metadata ?? undefined) as Json | undefined,
        thinking_process: n.thinking_process,
        tokens_in: n.tokens_in,
        tokens_out: n.tokens_out,
        status: n.status as ResearchNote['status'],
        error: n.error ?? undefined,
        user_id: n.user_id ?? undefined,
        quality_score: n.quality_score,
        rarity: n.rarity,
        content_hash: n.content_hash,
        enrichment_status: n.enrichment_status as ResearchNote['enrichment_status'],
        created_at: created,
        updated_at: digest ? created : date(n.updated_at),
      };
    });

    // ── risk analyses (+ scenarios, factors, catalysts) ──────────────────
    const riskAnalyses: Row<RiskAnalysis>[] = [];
    const riskScenarios: Row<RiskScenario>[] = [];
    const riskFactors: Row<RiskQualitativeFactor>[] = [];
    const riskCatalysts: Row<RiskCatalyst>[] = [];
    for (const risk of state.risk.values()) {
      if (!risk) continue;
      riskAnalyses.push({
        id: risk.id,
        ticker_id: risk.ticker_id,
        created_at: date(risk.created_at),
        model_version: risk.model_version,
        overall_score: risk.overall_score,
        financial_risk: risk.financial_risk,
        execution_risk: risk.execution_risk,
        dilution_risk: risk.dilution_risk,
        competitive_risk: risk.competitive_risk,
        regulatory_risk: risk.regulatory_risk,
        time_horizon_years: risk.time_horizon_years,
        price_target_weighted: risk.price_target_weighted,
        upside_percent: risk.upside_percent,
        analyst_target_avg: risk.analyst_target_avg ?? undefined,
        analyst_target_range_low: risk.analyst_target_range_low ?? undefined,
        analyst_target_range_high: risk.analyst_target_range_high ?? undefined,
        sentiment: risk.sentiment ?? undefined,
        fundamentals: risk.fundamentals as RiskAnalysis['fundamentals'],
        red_flags: risk.red_flags,
        research_note_id: risk.research_note_id ?? undefined,
        metadata: (risk.metadata ?? undefined) as Json | undefined,
      });
      for (const s of risk.scenarios) {
        riskScenarios.push({
          id: s.id,
          analysis_id: s.analysis_id,
          scenario_type: s.scenario_type as RiskScenario['scenario_type'],
          probability: Number(s.probability),
          description: s.description,
          price_low: Number(s.price_low),
          price_high: Number(s.price_high),
          price_mid: Number(s.price_mid),
          expected_market_cap: Number(s.expected_market_cap),
          key_drivers: s.key_drivers,
        });
      }
      for (const f of risk.qualitative_factors) {
        riskFactors.push({
          id: f.id,
          analysis_id: f.analysis_id,
          factor_type: f.factor_type as RiskQualitativeFactor['factor_type'],
          description: f.description,
        });
      }
      for (const c of risk.catalysts) {
        riskCatalysts.push({
          id: c.id,
          analysis_id: c.analysis_id,
          timeframe: c.timeframe as RiskCatalyst['timeframe'],
          description: c.description,
        });
      }
    }

    // ── watchlists ───────────────────────────────────────────────────────
    const watchlists: Row<Watchlist>[] = state.watchlists.map((w) => ({
      id: w.id,
      name: w.name,
      user_id: w.user_id,
      created_at: date(w.created_at),
      updated_at: date(w.updated_at),
    }));
    const watchlistItems: Row<WatchlistItem>[] = state.watchlistItems.map((i) => ({
      id: i.id,
      watchlist_id: i.watchlist_id,
      ticker_id: i.ticker_id,
      added_at: date(i.added_at),
    }));

    // ── portfolio ────────────────────────────────────────────────────────
    const positions: Row<PortfolioPosition>[] = state.positions.map((p) => ({
      id: p.id,
      user_id: p.user_id,
      symbol: p.symbol,
      shares: p.shares,
      buy_price: p.buy_price,
      buy_date: p.buy_date,
      created_at: date(p.created_at),
      updated_at: date(p.updated_at),
      currency: p.currency,
    }));
    const trades: Row<PortfolioTrade>[] = state.trades.map((t) => ({
      id: t.id,
      user_id: t.user_id,
      position_id: t.position_id,
      symbol: t.symbol,
      side: t.side,
      shares: t.shares,
      price: t.price,
      total_value: t.total_value,
      fees: t.fees,
      realized_pnl: t.realized_pnl,
      currency: t.currency,
      trade_date: t.trade_date,
      source: t.source,
      external_id: t.external_id,
      note: t.note,
      created_at: date(t.created_at),
      updated_at: date(t.updated_at),
    }));
    const cash: Row<PortfolioCashBalance>[] = state.cash.map((c) => ({
      id: c.id,
      user_id: c.user_id,
      currency: c.currency,
      amount: c.amount,
      created_at: date(c.created_at),
      updated_at: date(c.updated_at),
    }));
    const pendingOrders: Row<PortfolioPendingOrder>[] = state.pendingOrders.map(
      (o) => ({
        id: o.id,
        user_id: o.user_id,
        position_id: o.position_id,
        symbol: o.symbol,
        side: o.side,
        shares: o.shares,
        currency: o.currency,
        status: o.status,
        region: o.region,
        requested_price: o.requested_price,
        fees: o.fees,
        note: o.note,
        attempts: o.attempts,
        filled_at: dateOrNull(o.filled_at),
        filled_price: o.filled_price,
        filled_trade_id: o.filled_trade_id,
        error: o.error,
        created_at: date(o.created_at),
        updated_at: date(o.updated_at),
      }),
    );
    const portfolioAnalyses: Row<PortfolioAnalysis>[] = state.analyses.map((a) => ({
      id: a.id,
      userId: a.userId,
      riskAppetite: a.riskAppetite ?? undefined,
      horizon: a.horizon ?? undefined,
      goal: a.goal ?? undefined,
      model: a.model ?? undefined,
      prompt: a.prompt,
      response: a.response,
      createdAt: date(a.createdAt),
    }));

    const alerts: Row<PriceAlert>[] = state.alerts.map((a) => ({
      id: a.id,
      user_id: a.user_id,
      ticker_id: a.ticker_id,
      symbol: a.symbol,
      alert_type: a.alert_type as PriceAlert['alert_type'],
      target_value: a.target_value,
      reference_price: a.reference_price ?? undefined,
      enabled: a.enabled,
      triggered_at: dateOrNull(a.triggered_at) ?? undefined,
      cooldown_minutes: a.cooldown_minutes,
      created_at: date(a.created_at),
      updated_at: date(a.updated_at),
    }));

    // ── social ───────────────────────────────────────────────────────────
    // Parents have lower ids than their replies, so id order satisfies the FK.
    const comments: Row<Comment>[] = [...state.comments]
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((c) => ({
        id: c.id,
        ticker_symbol: c.ticker_symbol,
        content: c.content,
        user_id: c.user_id,
        parent_id: c.parent_id,
        created_at: date(c.created_at),
        updated_at: date(c.updated_at),
        moderation_status: c.moderation_status,
        moderation_reason: c.moderation_reason,
      }));

    // comment_likes.user_id is a foreign key to users. The mock pads its like
    // counts with anonymous ids that have no user; those likes are given to
    // seeded users who have not liked the comment yet (never the author, and
    // never the demo user, whose own likes stay as the mock has them). A
    // comment cannot have more likes than there are such users.
    const demoUserId = state.ids.user;
    const likes: Row<CommentLike>[] = [];
    let likesDropped = 0;
    for (const comment of state.comments) {
      const mockLikes = state.likes.filter((l) => l.comment_id === comment.id);
      const used = new Set<string>();
      const add = (userId: string, createdAt: string): void => {
        used.add(userId);
        likes.push({
          comment_id: comment.id,
          user_id: userId,
          created_at: date(createdAt),
        });
      };
      const anonymous = mockLikes.filter(
        (l) => !userIds.has(l.user_id) || l.user_id === comment.user_id,
      );
      for (const like of mockLikes) {
        if (!anonymous.includes(like) && !used.has(like.user_id)) {
          add(like.user_id, like.created_at);
        }
      }
      const standIns = state.users
        .map((u) => u.id)
        .filter((id) => id !== comment.user_id && id !== demoUserId);
      for (const like of anonymous) {
        const userId = standIns.find((id) => !used.has(id));
        if (userId) add(userId, like.created_at);
        else likesDropped++;
      }
    }
    if (likesDropped > 0) {
      notes.push(
        `comment_likes: ${likesDropped} of the mock's ${state.likes.length} likes were not stored — ` +
          'a like needs a users row and a comment cannot have more likes than there are seeded users.',
      );
    }

    const notifications: Row<Notification>[] = state.notifications.map((n) => ({
      id: n.id,
      user_id: n.user_id,
      type: n.type,
      title: n.title,
      message: n.message ?? undefined,
      read: n.read,
      data: (n.data ?? undefined) as Json | undefined,
      created_at: date(n.created_at),
    }));

    const creditTransactions: Row<CreditTransaction>[] = state.creditTx.map((t) => ({
      id: t.id,
      user_id: t.user_id,
      amount: t.amount,
      reason: t.reason as CreditTransaction['reason'],
      metadata: (t.metadata ?? undefined) as Json | undefined,
      created_at: date(t.created_at),
    }));

    const tickerRequests: Row<TickerRequestEntity>[] = state.tickerRequests.map(
      (r) => ({
        id: r.id,
        symbol: r.symbol,
        status: r.status,
        user_id: r.user_id,
        created_at: date(r.created_at),
        updated_at: date(r.updated_at),
      }),
    );

    // ── StockTwits + event calendar (fixtures that live in mock routes) ───
    const stPosts: Row<StockTwitsPost>[] = [];
    const stPostIds = new Set<number>();
    const stWatchers: Row<StockTwitsWatcher>[] = [];
    const stAnalyses: Row<StocktwitsAnalysis>[] = [];
    const events: Row<EventCalendar>[] = [];
    let stPostsSkipped = 0;
    for (const t of state.tickers) {
      const base = `/v1/stocktwits/${t.symbol}`;
      for (let page = 1; ; page++) {
        const { body } = await mock.get<{ data: Json[]; total: number }>(
          `${base}/posts?page=${page}&limit=100`,
        );
        for (const p of body.data) {
          const id = p.id as number;
          if (stPostIds.has(id)) {
            stPostsSkipped++;
            continue;
          }
          stPostIds.add(id);
          stPosts.push({
            id,
            symbol: p.symbol as string,
            username: p.username as string,
            body: p.body as string,
            likes_count: p.likes_count as number,
            user_followers_count: p.user_followers_count as number,
            created_at: date(p.created_at as string),
            inserted_at: date(p.inserted_at as string),
          });
        }
        if (body.data.length === 0 || page * 100 >= body.total) break;
      }
      for (const w of (await mock.get<Json[]>(`${base}/watchers`)).body) {
        stWatchers.push({
          id: w.id as string,
          symbol: w.symbol as string,
          count: w.count as number,
          timestamp: date(w.timestamp as string),
        });
      }
      for (const a of (await mock.get<Json[]>(`${base}/history`)).body) {
        stAnalyses.push({
          id: a.id as string,
          ticker_id: a.ticker_id as string,
          symbol: a.symbol as string,
          sentiment_score: Number(a.sentiment_score),
          sentiment_label: a.sentiment_label as string,
          posts_analyzed: a.posts_analyzed as number,
          weighted_sentiment_score: Number(a.weighted_sentiment_score),
          summary: a.summary as string,
          model_used: a.model_used as string,
          tokens_used: (a.tokens_used as number | null) ?? undefined,
          analysis_start: date(a.analysis_start as string),
          analysis_end: date(a.analysis_end as string),
          highlights: a.highlights as StocktwitsAnalysis['highlights'],
          extracted_events: a.extracted_events as Json[],
          created_at: date(a.created_at as string),
        });
      }
      for (const e of (await mock.get<Json[]>(`${base}/events`)).body) {
        events.push({
          id: e.id as string,
          ticker_id: e.ticker_id as string,
          symbol: e.symbol as string,
          title: e.title as string,
          description: (e.description as string | null) ?? undefined,
          event_date: (e.event_date as string | null) ?? undefined,
          date_text: (e.date_text as string | null) ?? undefined,
          confidence: Number(e.confidence),
          impact_score: (e.impact_score as number | null) ?? undefined,
          expected_impact: (e.expected_impact as string | null) ?? undefined,
          event_type: e.event_type as string,
          source: e.source as string,
          source_reference: (e.source_reference as Json | null) ?? undefined,
          created_at: date(e.created_at as string),
          updated_at: date(e.updated_at as string),
        });
      }
    }
    if (stPostsSkipped > 0) {
      notes.push(
        `stocktwits_posts: ${stPostsSkipped} posts skipped (the mock gave two symbols the same post id).`,
      );
    }

    // The mock's FX table is CurrencyService's static snapshot; stored as the
    // DB cache tier. A live refresh at backend start replaces it.
    const exchangeRates: Row<ExchangeRateEntity>[] = Object.entries(FX_RATES).map(
      ([code, rate]) => ({
        currency_code: code,
        rate_to_usd: rate,
        last_updated: new Date(now),
      }),
    );

    // ── write: one transaction, all or nothing ───────────────────────────
    const tables = ds.entityMetadatas.map((m) => m.tableName);
    await ds.transaction(async (manager) => {
      await manager.query(
        `TRUNCATE TABLE ${tables.map(quote).join(', ')} RESTART IDENTITY CASCADE`,
      );

      await insert(manager, User, users);
      await insert(manager, AllowedUser, allowedUsers);
      await insert(manager, AuthLog, authLogs);
      await insert(manager, TickerEntity, tickers);
      await insert(manager, TickerLogoEntity, logos);
      await insert(manager, Fundamentals, fundamentals);
      await insert(manager, PriceOhlcv, candles, 2000);
      await insert(manager, AnalystRating, ratings);
      await insert(manager, CompanyNews, news);
      await insert(manager, ResearchNote, researchNotes, 50);
      await insert(manager, RiskAnalysis, riskAnalyses);
      await insert(manager, RiskScenario, riskScenarios);
      await insert(manager, RiskQualitativeFactor, riskFactors);
      await insert(manager, RiskCatalyst, riskCatalysts);
      await insert(manager, Watchlist, watchlists);
      await insert(manager, WatchlistItem, watchlistItems);
      await insert(manager, PortfolioPosition, positions);
      await insert(manager, PortfolioTrade, trades);
      await insert(manager, PortfolioCashBalance, cash);
      await insert(manager, PortfolioPendingOrder, pendingOrders);
      await insert(manager, PortfolioAnalysis, portfolioAnalyses);
      await insert(manager, PriceAlert, alerts);
      await insert(manager, Comment, comments);
      await insert(manager, CommentLike, likes);
      await insert(manager, Notification, notifications);
      await insert(manager, CreditTransaction, creditTransactions);
      await insert(manager, TickerRequestEntity, tickerRequests);
      await insert(manager, StockTwitsPost, stPosts, 1000);
      await insert(manager, StockTwitsWatcher, stWatchers, 1000);
      await insert(manager, StocktwitsAnalysis, stAnalyses);
      await insert(manager, EventCalendar, events);
      await insert(manager, ExchangeRateEntity, exchangeRates);

      // Rows carry the mock's ids; move every id sequence past them so the
      // backend's own inserts do not collide.
      for (const meta of ds.entityMetadatas) {
        for (const col of meta.primaryColumns) {
          if (!col.isGenerated || col.generationStrategy !== 'increment') continue;
          const table = quote(meta.tableName);
          await manager.query(
            `SELECT setval(pg_get_serial_sequence($1, $2),
                           COALESCE((SELECT MAX(${quote(col.databaseName)}) FROM ${table}), 1),
                           EXISTS (SELECT 1 FROM ${table}))`,
            [table, col.databaseName],
          );
        }
      }
    });

    // ── report ───────────────────────────────────────────────────────────
    console.log(`Seeded at ${new Date(now).toISOString()}. Rows per table:`);
    let total = 0;
    for (const table of [...tables].sort()) {
      const [{ count }] = (await ds.query(
        `SELECT COUNT(*)::int AS count FROM ${quote(table)}`,
      )) as { count: number }[];
      total += count;
      console.log(`  ${table.padEnd(28)} ${String(count).padStart(7)}`);
    }
    console.log(`  ${'TOTAL'.padEnd(28)} ${String(total).padStart(7)}`);
    for (const note of notes) console.log(`Note — ${note}`);
    console.log(
      `Sign in: POST /api/auth/dev/token {"email":"${DEMO_LOGINS[0]}"} (demo user) or "${DEMO_LOGINS[1]}" (admin).`,
    );
  } finally {
    await ds.destroy();
  }
}

runScript(main);

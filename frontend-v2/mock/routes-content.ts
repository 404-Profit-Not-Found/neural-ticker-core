// Research (tickets, notes, SSE deep-research stream, public reports),
// social comments, and StockTwits.
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Router } from './core.ts';
import { HANDLED, badRequest, dec, forbidden, internalError, iso, isoDate, notFound, numericId, sleep, v, validate } from './core.ts';
import { authenticate } from './session.ts';
import type { Comment, MockState, Note, StocktwitsAnalysisRow, User } from './state.ts';
import { nextId, rarityOf, seedOf, shareSignature, tickerBySymbol, userById } from './state.ts';
import { companyNewsRows, historyBetween, latestNoteFor, noteView, publicUser, ratingOf, snapshot } from './views.ts';
import { STOCKTWITS_BODIES, deepDiveMarkdown } from './seed-content.ts';
import { creditGuard, deductCredits, modelCost, notify, researchCost, sseWrite } from './routes-user.ts';
import { hash, pick, rng, uuid } from './rng.ts';

const H = 3_600_000;
const DAY = 24 * H;
const SYMBOL_RE = /^[A-Z0-9.-]{1,10}$/;

function blankNote(state: MockState, userId: string | null, tickers: string[], question: string): Note {
  const now = iso(Date.now());
  return {
    id: nextId(state, 'research_notes'),
    request_id: randomUUID(),
    tickers,
    question,
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
    status: 'pending',
    error: null,
    user_id: userId,
    quality_score: null,
    rarity: null,
    content_hash: null,
    enrichment_status: null,
    created_at: now,
    updated_at: now,
  };
}

/** Stand-in for ResearchService.processTicket: pending → processing →
 *  completed over a few seconds, then the creator is notified. */
function processTicket(state: MockState, note: Note): void {
  const later = (ms: number, fn: () => void): void => {
    const t = setTimeout(() => {
      state.timers.delete(t);
      if (state.notes.includes(note)) fn();
    }, ms);
    state.timers.add(t);
  };
  later(1200, () => {
    note.status = 'processing';
    note.updated_at = iso(Date.now());
  });
  later(6500, () => {
    const sym = note.tickers[0] as string;
    const seed = state.seeds.get(sym);
    note.status = 'completed';
    note.answer_markdown = seed ? deepDiveMarkdown(seed, note.question) : `# ${sym}\n\nNo data available for this symbol.`;
    note.models_used = note.provider === 'openai' ? ['gpt-5.1'] : note.provider === 'ensemble' ? ['gemini-3-pro-preview', 'gpt-5.1'] : [note.quality === 'deep' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview'];
    note.full_response = JSON.stringify({ answerMarkdown: '[omitted in mock]', models: note.models_used }, null, 2);
    note.tokens_in = 7400;
    note.tokens_out = 3100;
    note.numeric_context = Object.fromEntries(note.tickers.map((t) => [t, state.seeds.get(t) ? { price: state.seeds.get(t)?.price } : {}]));
    note.title = `${sym}: ${note.question.length > 70 ? note.question.slice(0, 70) + '…' : note.question}`;
    note.quality_score = 78;
    note.rarity = rarityOf(78);
    note.enrichment_status = { title: 'ok', quality: 'ok', risk_analysis: 'ok', financials: 'ok' };
    note.updated_at = iso(Date.now());
    if (note.user_id) {
      notify(state, note.user_id, 'research_complete', `Research Ready: ${note.tickers.join(', ')}`, `Your AI research on ${note.tickers.join(', ')} is complete.`, { researchId: note.id, ticker: sym });
    }
  });
}

/** ResearchService.createManualNote — dedup by content hash, judge quality,
 *  reward credits by rarity (capped at 50 per rolling day). */
function createManualNote(state: MockState, user: User, tickersIn: string[], title: string, content: string, model?: string): Note {
  const tickers = [...new Set((tickersIn || []).map((t) => String(t).trim().toUpperCase()))].filter(Boolean);
  const note = blankNote(state, user.id, tickers, 'Manual Upload');
  note.provider = 'manual';
  note.quality = 'manual';
  note.title = title;
  note.answer_markdown = content;
  note.status = 'completed';
  note.models_used = model ? [model] : [];
  note.content_hash = createHash('sha256').update((content || '').toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex');
  const prior = state.notes.filter((n) => n.user_id === user.id && n.content_hash === note.content_hash).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  if (prior) {
    note.quality_score = prior.quality_score;
    note.rarity = prior.rarity;
    note.grounding_metadata = prior.grounding_metadata;
    state.notes.push(note);
    return note;
  }
  // The real judge is an LLM; the mock grades on length and structure.
  const score = Math.min(100, Math.round(18 + Math.min(content.length, 6000) / 90 + (/\|.*\|/.test(content) ? 8 : 0) + (/^#+ /m.test(content) ? 6 : 0)));
  note.quality_score = score;
  note.rarity = rarityOf(score);
  note.grounding_metadata = { judgment_reasoning: 'Mock judge: graded on length and structure.' };
  state.notes.push(note);
  const reward = { Common: 1, Uncommon: 3, Rare: 5, Epic: 10, Legendary: 25 }[note.rarity] ?? 0;
  const since = Date.now() - DAY;
  const earned = state.creditTx.filter((t) => t.user_id === user.id && t.reason === 'manual_contribution' && t.amount > 0 && Date.parse(t.created_at) >= since).reduce((s, t) => s + t.amount, 0);
  const granted = Math.min(reward, 50 - earned);
  if (granted > 0) {
    user.credits_balance += granted;
    state.creditTx.push({ id: Number(nextId(state, 'credit_transactions')), user_id: user.id, amount: granted, reason: 'manual_contribution', metadata: { noteId: note.request_id, rarity: note.rarity, score: note.quality_score }, created_at: iso(Date.now()) });
  }
  return note;
}

/** ResearchService.publicReportNews. */
function publicReportNews(
  latest: object | null,
  ticker?: { news_sentiment?: string | null; news_impact_score?: number | null },
): Record<string, unknown> | null {
  const sentiment = ticker?.news_sentiment ?? null;
  const score = ticker?.news_impact_score ?? null;
  if (!latest && sentiment === null && score === null) return null;
  return { ...latest, sentiment, score };
}

function findNote(state: MockState, id: string): Note | undefined {
  // research_notes.id is a bigint: a non-numeric id makes Postgres reject the
  // query ("invalid input syntax for type bigint") → 500. The research routes
  // validate their `:id` first (numericId → 400); only the signed public
  // report still gets here with an arbitrary id.
  if (!/^\d+$/.test(id)) throw internalError();
  return state.notes.find((n) => n.id === id);
}

// ── stocktwits fixtures ──────────────────────────────────────────────────

const ST_SYMBOLS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'PLTR', 'COIN', 'AMD', 'SMCI', 'MULN', 'META', 'AMZN'];

function stPosts(state: MockState, symbol: string): Array<Record<string, unknown>> {
  if (!tickerBySymbol(state, symbol) || symbol !== symbol.toUpperCase()) return [];
  const r = rng('st-posts:' + symbol);
  const n = ST_SYMBOLS.includes(symbol) ? 180 : 24;
  const users = ['bull_runner', 'thetagang_mike', 'chartwizard', 'value_or_bust', 'optionsqueen', 'longterm_larry', 'macro_maya', 'scalp_king', 'divgrowth', 'quant_kiwi'];
  return Array.from({ length: n }, (_, i) => {
    const created = state.now - Math.floor((i * (30 * DAY)) / n + r() * H);
    return {
      id: 590_000_000 + (hash(symbol) % 100_000) * 100 + (n - i),
      symbol,
      username: pick(r, users),
      body: pick(r, STOCKTWITS_BODIES).replace(/\$SYM/g, `$${symbol}`),
      likes_count: Math.floor(r() * r() * 60),
      user_followers_count: Math.floor(r() * r() * 9000),
      created_at: iso(created),
      inserted_at: iso(created + 20 * 60_000),
    };
  });
}

function stAnalysis(state: MockState, symbol: string, ageH: number, idx: number): StocktwitsAnalysisRow {
  const t = tickerBySymbol(state, symbol);
  const seed = seedOf(state, symbol);
  const r = rng(`st-analysis:${symbol}:${idx}`);
  // The LLM is asked for a 0–1 score, "where 1 is Super Bullish".
  const centre = seed.sentiment === 'BULLISH' ? 0.74 : seed.sentiment === 'BEARISH' ? 0.27 : 0.5;
  const score = Math.max(0.03, Math.min(0.97, centre + (r() - 0.5) * 0.16));
  const label = score >= 0.6 ? 'Bullish' : score <= 0.4 ? 'Bearish' : 'Neutral';
  const end = state.now - ageH * H;
  return {
    id: uuid(`st-analysis:${symbol}:${idx}`),
    ticker_id: t?.id ?? '0',
    symbol,
    sentiment_score: +score.toFixed(2),
    sentiment_label: label,
    posts_analyzed: 120 + Math.floor(r() * 900),
    // StockTwitsService stores the same value in both columns.
    weighted_sentiment_score: +score.toFixed(2),
    summary: `Retail chatter on $${symbol} is ${label.toLowerCase()}. The most-liked posts focus on the next earnings print and on positioning; a vocal minority expects a pullback first. Volume of posts is ${r() < 0.5 ? 'above' : 'in line with'} the 30-day average.`,
    model_used: idx === 0 ? 'gemini-3-flash-preview' : 'gemini-3.5-flash-lite',
    tokens_used: 4000 + Math.floor(r() * 9000),
    analysis_start: iso(end - 14 * DAY),
    analysis_end: iso(end),
    highlights: {
      topics: ['Earnings', 'Guidance', 'Options flow', 'Short interest'].slice(0, 2 + Math.floor(r() * 3)),
      bullish_points: ['Strong demand commentary from suppliers', 'Buyback authorisation raised', 'Chart holding the 50-day average'],
      bearish_points: ['Valuation stretched versus history', 'Insider selling picked up'],
    },
    extracted_events: [
      { title: `${symbol} quarterly earnings`, date: new Date(state.now + 20 * DAY).toISOString().slice(0, 10), type: 'earnings', impact_score: 8, expected_impact: 'Guidance is the swing factor; options imply a wide range.', confidence: 0.9 },
    ],
    created_at: iso(end),
  };
}

/** numeric columns without a transformer come back as strings. */
const stAnalysisRow = (a: StocktwitsAnalysisRow): Record<string, unknown> => ({
  ...a,
  sentiment_score: String(a.sentiment_score),
  weighted_sentiment_score: String(a.weighted_sentiment_score),
});

function stAnalyses(state: MockState, symbol: string): StocktwitsAnalysisRow[] {
  if (ST_SYMBOLS.includes(symbol) && !state.stocktwitsAnalyses.some((a) => a.symbol === symbol)) {
    [20, 190, 420].forEach((ageH, i) => {
      const a = stAnalysis(state, symbol, ageH, i);
      if (!state.deletedStocktwitsAnalyses.has(a.id)) state.stocktwitsAnalyses.push(a);
    });
  }
  return state.stocktwitsAnalyses.filter((a) => a.symbol === symbol).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function registerContent(r: Router): void {
  // ── v1/research ─ src/modules/research/research.controller.ts (JwtAuthGuard) ──

  // Tickers of an uploaded note: normalized first (trim + upper-case, as the
  // service always did), then at most 10 symbols of the usual format.
  const tickerChecks = (o: Record<string, unknown>): Array<string | null> => {
    if (Array.isArray(o.tickers)) o.tickers = (o.tickers as unknown[]).map((t) => (typeof t === 'string' ? t.trim().toUpperCase() : t));
    const list = Array.isArray(o.tickers) ? (o.tickers as unknown[]) : [];
    return [
      v.isArray(o, 'tickers'),
      v.arrayMaxSize(o, 'tickers', 10),
      ...(list.some((t) => typeof t !== 'string') ? ['each value in tickers must be a string'] : []),
      ...(list.some((t) => typeof t !== 'string' || !SYMBOL_RE.test(t)) ? ['Each ticker must be 1-10 chars of A-Z, 0-9, dot or hyphen.'] : []),
    ];
  };

  // POST v1/research/upload — UploadResearchDto (title ≤ 200, content ≤
  // 100 000, model ≤ 100 chars); returns the saved note.
  r.post('/v1/research/upload', { auth: 'user' }, (c) => {
    const dto = validate(c.body, ['tickers', 'title', 'content', 'status', 'model'], (o, has) => [
      ...tickerChecks(o),
      v.isString(o, 'title'),
      v.maxLength(o, 'title', 200),
      v.isString(o, 'content'),
      v.maxLength(o, 'content', 100_000),
      ...(has('status') ? [v.isString(o, 'status'), v.maxLength(o, 'status', 20)] : []),
      ...(has('model') ? [v.isString(o, 'model'), v.maxLength(o, 'model', 100)] : []),
    ]);
    return createManualNote(c.state, c.user as User, dto.tickers as string[], dto.title as string, dto.content as string, dto.model as string | undefined);
  });

  // POST v1/research/contribute — ContributeDto { tickers, content }.
  r.post('/v1/research/contribute', { auth: 'user' }, (c) => {
    const dto = validate(c.body, ['tickers', 'content'], (o) => [
      ...tickerChecks(o),
      v.isString(o, 'content'),
      v.maxLength(o, 'content', 100_000),
    ]);
    const content = dto.content as string;
    const title = (content.split('\n')[0] as string).substring(0, 50) || 'Community Contribution';
    return createManualNote(c.state, c.user as User, dto.tickers as string[], title, content);
  });

  // POST v1/research/ask — CreditGuard (runs before validation), then
  // AskResearchDto. 201 `{ id, status: 'pending' }`; poll GET /research/:id.
  r.post('/v1/research/ask', { auth: 'user' }, (c) => {
    const me = c.user as User;
    creditGuard(me, c.body?.provider as string | undefined, c.body?.quality as string | undefined);
    const dto = validate(c.body, ['tickers', 'question', 'provider', 'quality', 'style', 'maxTokens', 'apiKey'], (o, has) => {
      const arr = Array.isArray(o.tickers) ? (o.tickers as unknown[]) : null;
      return [
        ...(arr && arr.some((t) => typeof t !== 'string' || !SYMBOL_RE.test(t)) ? ['Each ticker must be 1-10 chars of A-Z, 0-9, dot or hyphen.'] : []),
        ...(arr && arr.some((t) => typeof t !== 'string') ? ['each value in tickers must be a string'] : []),
        ...(arr && arr.length > 10 ? ['tickers must contain no more than 10 elements'] : []),
        ...(arr && arr.length === 0 ? ['tickers should not be empty'] : []),
        v.isArray(o, 'tickers'),
        v.maxLength(o, 'question', 2000),
        v.isString(o, 'question'),
        ...(has('provider') ? [v.isEnum(o, 'provider', ['openai', 'gemini', 'ensemble'])] : []),
        ...(has('quality') ? [v.isEnum(o, 'quality', ['low', 'medium', 'high', 'deep'])] : []),
        ...(has('style') ? [v.isString(o, 'style')] : []),
        ...(has('maxTokens') ? [v.isNumber(o, 'maxTokens')] : []),
        ...(has('apiKey') ? [v.isString(o, 'apiKey')] : []),
      ];
    });
    const note = blankNote(c.state, me.id, dto.tickers as string[], dto.question as string);
    note.provider = (dto.provider as string) ?? 'gemini';
    note.quality = (dto.quality as string) ?? 'deep';
    c.state.notes.push(note);
    if (me.role !== 'admin') {
      try {
        deductCredits(c.state, me, researchCost(dto.provider as string, dto.quality as string), 'research_spend', { research_id: note.id, model: dto.provider, quality: dto.quality, ticker: (dto.tickers as string[])[0] });
      } catch (e) {
        c.state.notes = c.state.notes.filter((n) => n !== note);
        throw e;
      }
    }
    processTicket(c.state, note);
    return { id: note.id, status: note.status };
  });

  // POST v1/research/stream — @Sse(); StreamResearchDto { ticker, questions? }.
  // Each message is `event: <type>` + `data: { type, data }` where type is
  // status | thought | source | content | error; the stream then just ends.
  r.post('/v1/research/stream', { auth: 'user' }, async (c) => {
    const me = c.user as User;
    const dto = validate(c.body, ['ticker', 'questions'], (o, has) => [
      typeof o.ticker === 'string' && SYMBOL_RE.test(o.ticker) ? null : 'ticker must be 1-10 chars of A-Z, 0-9, dot or hyphen.',
      v.isString(o, 'ticker'),
      ...(has('questions') ? [v.maxLength(o, 'questions', 2000), v.isString(o, 'questions')] : []),
    ]);
    const symbol = (dto.ticker as string).toUpperCase();
    const t = tickerBySymbol(c.state, symbol);
    if (!t) throw notFound(`Ticker ${symbol} not found`);
    if (me.role !== 'admin') deductCredits(c.state, me, researchCost('gemini', 'deep'), 'research_spend', { ticker: symbol, pipeline: 'stream' });

    const client = { res: c.res, lastEventId: 0 };
    let closed = false;
    c.req.on('close', () => {
      closed = true;
    });
    const emit = (type: string, data: unknown): void => sseWrite(client, type, { type, data });
    const body = deepDiveMarkdown(seedOf(c.state, symbol), (dto.questions as string) || 'Growth, Moat, Risks, Valuation');
    const steps: Array<[number, string, unknown]> = [
      [0, 'status', 'Initializing Deep Research Agent...'],
      [350, 'status', 'Deep Research Agent Running...'],
      [500, 'thought', `Planning the research: start with the latest 10-K and 10-Q for ${symbol}, then cross-check segment revenue against the investor deck.`],
      [450, 'source', [{ title: 'sec.gov', url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-K' }, { title: `${t.name} — Investor Relations`, url: t.web_url }]],
      [500, 'thought', 'Gross margin moved more than revenue this year — checking whether that is mix or pricing.'],
      [400, 'source', [{ title: 'reuters.com', url: 'https://www.reuters.com/markets/' }, { title: 'finance.yahoo.com', url: `https://finance.yahoo.com/quote/${symbol}` }]],
      [450, 'thought', 'Building bull/base/bear scenarios and stress-testing the bear case against the balance sheet.'],
    ];
    for (const [delay, type, data] of steps) {
      await sleep(delay);
      if (closed) return HANDLED;
      emit(type, data);
    }
    // The report arrives as a stream of text deltas.
    for (let i = 0; i < body.length; i += 180) {
      await sleep(60);
      if (closed) return HANDLED;
      emit('content', body.slice(i, i + 180));
    }
    if (!c.res.writableEnded) c.res.end();
    return HANDLED;
  });

  // POST v1/research/:id/title { title } — owner or admin; anything else is
  // reported as 404. Returns the saved note (the author is not loaded).
  r.post('/v1/research/:id/title', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const id = numericId(c.params.id);
    // UpdateTitleDto: trimmed, non-empty, at most 200 characters.
    const dto = validate(c.body, ['title'], (o) => {
      if (typeof o.title === 'string') o.title = o.title.trim();
      return [v.isString(o, 'title'), v.matches(o, 'title', /\S/, 'title must not be empty'), v.maxLength(o, 'title', 200)];
    });
    const note = findNote(c.state, id);
    if (!note) throw notFound('Research note not found');
    if (me.role !== 'admin' && note.user_id !== me.id) throw notFound('Unauthorized to edit this research title');
    note.title = dto.title as string;
    note.updated_at = iso(Date.now());
    return note;
  });

  // POST v1/research/extract-financials/:ticker and /sync/:ticker — @Roles('admin').
  r.post('/v1/research/extract-financials/:ticker', { auth: 'admin' }, (c) => {
    if (!latestNoteFor(c.state, c.params.ticker as string)) throw notFound(`No research found for ${c.params.ticker}`);
    return { message: 'Extraction started' };
  });
  r.post('/v1/research/sync/:ticker', { auth: 'admin' }, (c) => {
    if (!latestNoteFor(c.state, c.params.ticker as string)) throw notFound(`No research found for ${c.params.ticker}`);
    return { message: 'Sync completed', deduped: 0 };
  });

  // GET v1/research?status=&page=&limit=&ticker=&since= — ResearchService.findAll.
  //  - no `ticker`: only MY notes;
  //  - `ticker`: EVERYONE's notes for it, minus daily digests. The SQL is
  //    `(title IS NULL OR title NOT LIKE 'Smart News Briefing%')`, so notes
  //    whose title is still NULL (pending / processing / untitled) ARE listed
  //    — that is what the feed's "processing" polling looks for.
  //  Each note carries its author's public view (`user`), or null.
  r.get(
    '/v1/research',
    { auth: 'user', empty: (c) => ({ data: [], total: 0, page: Number(c.query.get('page') ?? 1), limit: Math.min(Math.max(1, Number(c.query.get('limit')) || 10), 50) }) },
    (c) => {
      const me = c.user as User;
      const status = c.query.get('status') ?? 'all';
      const page = Number(c.query.get('page') ?? 1);
      const limit = Math.min(Math.max(1, Number(c.query.get('limit') ?? 10) || 10), 50);
      const ticker = c.query.get('ticker');
      const since = c.query.get('since') ? Number(c.query.get('since')) : undefined;
      let rows = c.state.notes.filter((n) => (ticker ? n.tickers.includes(ticker) && (n.title === null || !n.title.startsWith('Smart News Briefing')) : n.user_id === me.id));
      if (status && status !== 'all') rows = rows.filter((n) => n.status === status);
      if (since && since > 0) rows = rows.filter((n) => Date.parse(n.created_at) >= Date.now() - since * H);
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return {
        data: rows.slice((page - 1) * limit, (page - 1) * limit + limit).map((n) => noteView(c.state, n)),
        total: rows.length,
        page,
        limit,
      };
    },
  );

  // GET v1/research/news-summary/:symbol — `{ symbol, summary, sources, cachedAt }`.
  r.get('/v1/research/news-summary/:symbol', { auth: 'user' }, (c) => {
    const symbol = (c.params.symbol as string).toUpperCase();
    if (!SYMBOL_RE.test(symbol)) throw badRequest(`Invalid symbol: ${symbol}`);
    const t = tickerBySymbol(c.state, symbol);
    const items = t ? companyNewsRows(c.state, t).slice(0, 4) : [];
    return {
      symbol,
      summary: items.length
        ? items.map((n) => `- **${n.headline}**: ${n.summary || 'No further detail yet; watch for follow-up.'}`).join('\n')
        : `- **No material news for ${symbol} in the past 7 days**: positioning unchanged.`,
      sources: items.map((n) => ({ web: { uri: n.url, title: n.source } })),
      cachedAt: iso(Date.now()),
    };
  });

  // GET v1/research/:id/share-link — owner or admin → `{ signature, path }`.
  r.get('/v1/research/:id/share-link', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const note = findNote(c.state, numericId(c.params.id));
    if (!note) throw notFound('Research note not found');
    if (note.user_id !== me.id && me.role !== 'admin') {
      throw forbidden('You can only generate a share link for your own research.');
    }
    const signature = shareSignature(note.id);
    return { signature, path: `/report/${note.id}/${signature}` };
  });

  // GET v1/research/:id — any signed-in user can read any note (no owner
  // check in the controller). `user` is the author's public view.
  r.get('/v1/research/:id', { auth: 'user' }, (c) => {
    const note = findNote(c.state, numericId(c.params.id));
    if (!note) throw notFound(`Research note ${c.params.id} not found`);
    return noteView(c.state, note);
  });

  // DELETE v1/research/:id — owner or admin. A non-owner gets the same 404
  // as a missing note (like the title route, existence is not confirmed).
  r.delete('/v1/research/:id', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const note = findNote(c.state, numericId(c.params.id));
    if (!note) throw notFound('Research note not found');
    if (me.role !== 'admin' && note.user_id !== me.id) throw notFound('Research note not found');
    c.state.notes = c.state.notes.filter((n) => n !== note);
    for (const risk of c.state.risk.values()) if (risk && risk.research_note_id === note.id) risk.research_note_id = null;
    return { message: 'Deleted successfully' };
  });

  // ── v1/public ─ src/modules/research/public-view.controller.ts (@Public()) ──

  // GET v1/public/report/:researchId/:signature — HMAC-gated composite
  // payload (ResearchService.getPublicReportData).
  r.get('/v1/public/report/:researchId/:signature', { auth: 'public' }, (c) => {
    const { state } = c;
    const id = c.params.researchId as string;
    const expected = shareSignature(id);
    const given = c.params.signature as string;
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw forbidden('Access denied: Invalid signature');
    }
    const note = findNote(state, id);
    if (!note) throw notFound('Research note not found');
    // Unauthenticated: a fixed set of note fields, never the row or its author.
    const publicNote = {
      id: note.id,
      title: note.title,
      content: note.answer_markdown,
      created_at: note.created_at,
      models_used: note.models_used,
      rarity: note.rarity,
      quality_score: note.quality_score,
    };
    const main = note.tickers[0];
    if (!main) return { note: publicNote };
    const profile = tickerBySymbol(state, main);
    // A shared link never creates a ticker: when the note's main ticker is
    // not tracked the report is served alone — bare symbol as profile, no
    // market block.
    if (!profile) {
      return { note: publicNote, profile: { symbol: main, name: main }, market_context: null, risk_analysis: null, ratings: [], news: null, fundamentals: {} };
    }
    const visible = !profile.is_hidden ? profile : null;
    let snap: Record<string, unknown>;
    try {
      snap = snapshot(state, main, true);
    } catch {
      snap = { latestPrice: { close: 0, prevClose: 0, ts: iso(Date.now()) } };
    }
    const market = (snap.latestPrice as { close: number; prevClose: number | null }) ?? { close: 0, prevClose: 0 };
    const risk = visible ? (state.risk.get(visible.id) ?? null) : null;
    const history = visible ? historyBetween(state, visible, Date.now() - 5 * 365 * DAY, Date.now()) : [];
    const news = companyNewsRows(state, profile);
    const fund = (snap.fundamentals ?? {}) as Record<string, unknown>;
    return {
      note: publicNote,
      profile: visible
        ? {
            symbol: visible.symbol,
            name: visible.name,
            logo_url: visible.logo_url,
            industry: visible.finnhub_industry || visible.sector,
            description: visible.description,
            web_url: visible.web_url,
            exchange: visible.exchange,
          }
        : { symbol: main, name: main },
      market_context: {
        price: market.close,
        change_percent: market.prevClose ? ((market.close - market.prevClose) / market.prevClose) * 100 : 0,
        history: history.map((h) => ({ price: h.close, date: h.ts })),
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
            upside_percent: risk.upside_percent,
            // The server's AI rating of the ticker — same as in the app.
            rating: visible ? ratingOf(state, visible, market.close).rating : null,
            rating_score: visible ? ratingOf(state, visible, market.close).score : null,
            scenarios: risk.scenarios,
            red_flags: risk.red_flags || [],
            catalysts: risk.catalysts || [],
          }
        : null,
      ratings: visible ? (state.ratings.get(visible.id) ?? []).slice(0, 20) : [],
      // The latest company-news item plus the ticker's news `sentiment` and
      // `score` — named and valued as in the in-app composite's `news`. Null
      // only when there is neither an item nor a sentiment / score.
      news: publicReportNews(news[0] ?? null, snap.ticker as { news_sentiment?: string | null; news_impact_score?: number | null } | undefined),
      // An allow-list: exactly the inputs the UI's shared AI-rating function
      // reads from `fundamentals`, same names and values as the composite.
      fundamentals: {
        pe_ratio: fund.pe_ttm || undefined,
        consensus_rating: fund.consensus_rating,
        fifty_two_week_high: fund.fifty_two_week_high,
        fifty_two_week_low: fund.fifty_two_week_low,
        // A rating input too: without it the page applies the "no revenue"
        // penalty to every company.
        revenue_ttm: fund.revenue_ttm,
      },
    };
  });

  // ── v1/social ─ src/modules/social/social.controller.ts ────────────────

  const likeCount = (state: MockState, id: string): number => state.likes.filter((l) => l.comment_id === id).length;
  // Authors are attached as their public view (SocialService never loads a
  // `users` row): { id, nickname, avatar_url, tier } or null.
  const withUser = (state: MockState, cm: Comment): Record<string, unknown> => ({ ...cm, user: publicUser(userById(state, cm.user_id)) });

  // GET v1/social/comments/:symbol — @Public() + OptionalJwtAuthGuard;
  // `{ comments, mentionedUsers }`. Top-level comments newest first (max 50),
  // each with the author's public `user`, `replies` (oldest first, same
  // shape) and `like_count`. `mentionedUsers` resolves `<@uuid>` tokens to the
  // same public view.
  // Moderation: a comment/reply whose moderation_status is flagged/rejected
  // is served only to its author and to admins (a signed-in caller is
  // identified, never required); `moderation_reason` only to admins.
  r.get('/v1/social/comments/:symbol', { auth: 'public', empty: () => ({ comments: [], mentionedUsers: {} }) }, (c) => {
    const { state } = c;
    const symbol = c.params.symbol as string;
    let viewer: User | null = null;
    try {
      viewer = authenticate(state, c.req);
    } catch {
      viewer = null; // no / invalid session, or a revoked user: anonymous
    }
    const isAdmin = viewer?.role === 'admin';
    const canSee = (cm: Comment): boolean => !['flagged', 'rejected'].includes(cm.moderation_status) || isAdmin || cm.user_id === viewer?.id;
    const view = (cm: Comment): Record<string, unknown> => {
      const out = withUser(state, cm);
      if (!isAdmin) delete out.moderation_reason;
      return out;
    };
    const repliesOf = (top: Comment): Comment[] => state.comments.filter((x) => x.parent_id === top.id && canSee(x)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const tops = state.comments.filter((x) => x.ticker_symbol === symbol && x.parent_id === null && canSee(x)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50);
    const comments = tops.map((top) => ({
      ...view(top),
      replies: repliesOf(top).map((rep) => ({ ...view(rep), like_count: likeCount(state, rep.id) })),
      like_count: likeCount(state, top.id),
    }));
    const text = tops.flatMap((top) => [top.content, ...repliesOf(top).map((rep) => rep.content)]).join(' ');
    const mentionedUsers: Record<string, unknown> = {};
    for (const m of text.matchAll(/<@([a-f0-9-]{36})>/g)) {
      const u = publicUser(userById(state, m[1]));
      if (u) mentionedUsers[u.id] = u;
    }
    return { comments, mentionedUsers };
  });

  // GET v1/social/comments/:symbol/my-likes — `{ liked_ids }`.
  r.get('/v1/social/comments/:symbol/my-likes', { auth: 'user', empty: () => ({ liked_ids: [] }) }, (c) => ({
    liked_ids: c.state.likes
      .filter((l) => l.user_id === (c.user as User).id && c.state.comments.find((x) => x.id === l.comment_id)?.ticker_symbol === c.params.symbol)
      .map((l) => l.comment_id),
  }));

  // POST v1/social/comments/:commentId/like — toggle → `{ liked, likeCount }`.
  r.post('/v1/social/comments/:commentId/like', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const commentId = numericId(c.params.commentId);
    const cm = c.state.comments.find((x) => x.id === commentId);
    if (!cm) throw notFound('Comment not found');
    const existing = c.state.likes.find((l) => l.comment_id === cm.id && l.user_id === me.id);
    if (existing) c.state.likes = c.state.likes.filter((l) => l !== existing);
    else {
      c.state.likes.push({ id: nextId(c.state, 'comment_likes'), comment_id: cm.id, user_id: me.id, created_at: iso(Date.now()) });
      if (cm.user_id !== me.id) {
        notify(c.state, cm.user_id, 'comment_like', `${publicUser(me)?.nickname || 'Someone'} liked your comment`, `"${cm.content.slice(0, 100)}${cm.content.length > 100 ? '...' : ''}"`, { symbol: cm.ticker_symbol, commentId: cm.id });
      }
    }
    return { liked: !existing, likeCount: likeCount(c.state, cm.id) };
  });

  // POST v1/social/comments/:symbol — PostCommentDto { content, parent_id? }:
  // content is a non-blank string of at most 4000 characters, parent_id a
  // numeric comment id. A reply's parent must exist (404) and be a comment on
  // the same ticker (400). Returns the comment with its author's public
  // `user` (no moderation_reason); new comments start as moderation_status
  // 'pending'. Notification texts name the author by nickname.
  r.post('/v1/social/comments/:symbol', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const dto = validate(c.body, ['content', 'parent_id'], (o, has) => {
      if (typeof o.parent_id === 'number') o.parent_id = String(o.parent_id);
      return [
        v.isString(o, 'content'),
        v.maxLength(o, 'content', 4000),
        v.matches(o, 'content', /\S/, 'content must not be empty'),
        ...(has('parent_id') ? [v.matches(o, 'parent_id', /^\d{1,18}$/, 'parent_id must be a numeric comment id')] : []),
      ];
    });
    const text = dto.content as string;
    const symbol = c.params.symbol as string;
    const parentId = (dto.parent_id as string | undefined) || null;
    const parent = parentId ? c.state.comments.find((x) => x.id === parentId) : undefined;
    if (parentId && !parent) throw notFound('Parent comment not found');
    if (parent && parent.ticker_symbol.toUpperCase() !== symbol.toUpperCase()) {
      throw badRequest('A reply must be posted on the same ticker as its parent comment');
    }
    const now = iso(Date.now());
    const cm: Comment = { id: nextId(c.state, 'comments'), ticker_symbol: parent ? parent.ticker_symbol : symbol, content: text, user_id: me.id, parent_id: parentId, created_at: now, updated_at: now, moderation_status: 'pending', moderation_reason: null };
    c.state.comments.push(cm);
    const who = publicUser(me)?.nickname || 'Someone';
    if (parent && parent.user_id !== me.id) {
      notify(c.state, parent.user_id, 'comment_reply', `${who} replied to your comment`, `"${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`, { symbol: cm.ticker_symbol, commentId: cm.id, parentCommentId: parentId });
    }
    for (const m of text.matchAll(/<@([a-f0-9-]{36})>/g)) {
      const id = m[1] as string;
      if (id === me.id || id === parent?.user_id || !userById(c.state, id)) continue;
      notify(c.state, id, 'comment_mention', `${who} mentioned you on ${cm.ticker_symbol}`, `"${text.replace(/<@[a-f0-9-]{36}>/g, '@user').slice(0, 100)}"`, { symbol: cm.ticker_symbol, commentId: cm.id, mentionedBy: me.id });
    }
    const created = withUser(c.state, cm);
    delete created.moderation_reason;
    return created;
  });

  // GET v1/social/stats/:symbol/watchers — @Public(); `{ symbol, watchers }`.
  r.get('/v1/social/stats/:symbol/watchers', { auth: 'public' }, (c) => {
    const symbol = c.params.symbol as string;
    const t = c.state.tickers.find((x) => x.symbol === symbol);
    return { symbol, watchers: t && !c.scenario.empty ? c.state.watchlistItems.filter((i) => i.ticker_id === t.id).length : 0 };
  });

  // DELETE v1/social/comments/:id — @Roles('admin'); cascades to replies.
  r.delete('/v1/social/comments/:id', { auth: 'admin' }, (c) => {
    const id = numericId(c.params.id);
    c.state.comments = c.state.comments.filter((x) => x.id !== id && x.parent_id !== id);
    c.state.likes = c.state.likes.filter((l) => c.state.comments.some((x) => x.id === l.comment_id));
    return { success: true };
  });

  // ── v1/stocktwits ─ src/modules/stocktwits/stocktwits.controller.ts ────

  // GET :symbol/posts?page=&limit= — @Public(); `{ data, total, page, limit }`.
  r.get('/v1/stocktwits/:symbol/posts', { auth: 'public', empty: (c) => ({ data: [], total: 0, page: Number(c.query.get('page') ?? 1), limit: Number(c.query.get('limit') ?? 50) }) }, (c) => {
    const page = Number(c.query.get('page') ?? 1);
    const limit = Number(c.query.get('limit') ?? 50);
    const take = Math.min(Math.max(1, limit || 50), 100);
    const all = stPosts(c.state, c.params.symbol as string);
    return { data: all.slice((page - 1) * take, (page - 1) * take + take), total: all.length, page, limit };
  });

  // GET :symbol/watchers — @Public(); watcher-count history, oldest first.
  r.get('/v1/stocktwits/:symbol/watchers', { auth: 'public', empty: () => [] }, (c) => {
    const symbol = c.params.symbol as string;
    if (!tickerBySymbol(c.state, symbol) || symbol !== symbol.toUpperCase()) return [];
    const rr = rng('st-watchers:' + symbol);
    let count = 4000 + Math.floor(rr() * 600_000);
    return Array.from({ length: 30 }, (_, i) => {
      count = Math.max(0, Math.round(count * (1 + (rr() - 0.42) * 0.01)));
      return { id: uuid(`st-w:${symbol}:${i}`), symbol, count, timestamp: iso(c.state.now - (29 - i) * DAY) };
    });
  });

  // POST :symbol/sync — @Roles('admin').
  r.post('/v1/stocktwits/:symbol/sync', { auth: 'admin' }, () => ({ message: 'Sync triggered successfully' }));

  // POST :symbol/analyze { model?, quality? } — JwtAuthGuard + CreditGuard;
  // returns the new stocktwits_analyses row, or `{ message }` without posts.
  r.post('/v1/stocktwits/:symbol/analyze', { auth: 'user' }, (c) => {
    const me = c.user as User;
    creditGuard(me, c.body?.provider as string | undefined, c.body?.quality as string | undefined);
    const symbol = c.params.symbol as string;
    if (stPosts(c.state, symbol).length < 30) return { message: 'Not enough data to analyze' };
    if (me.role !== 'admin') deductCredits(c.state, me, modelCost(c.body?.model as string | undefined), 'social_analysis_spend', { symbol, model: c.body?.model });
    stAnalyses(c.state, symbol);
    const a = stAnalysis(c.state, symbol, 0, Date.now());
    a.id = randomUUID();
    a.created_at = iso(Date.now());
    a.analysis_end = a.created_at;
    if (c.body?.model) a.model_used = c.body.model as string;
    c.state.stocktwitsAnalyses.push(a);
    return a;
  });

  // GET :symbol/analysis — @Public(); latest analysis, or an empty body.
  r.get('/v1/stocktwits/:symbol/analysis', { auth: 'public' }, (c) => {
    const a = c.scenario.empty ? undefined : stAnalyses(c.state, c.params.symbol as string)[0];
    return a ? stAnalysisRow(a) : null;
  });

  // GET :symbol/history — @Public(); last 20 analyses, newest first.
  r.get('/v1/stocktwits/:symbol/history', { auth: 'public', empty: () => [] }, (c) =>
    stAnalyses(c.state, c.params.symbol as string).slice(0, 20).map(stAnalysisRow),
  );

  // DELETE analysis/:id — @Roles('admin').
  r.delete('/v1/stocktwits/analysis/:id', { auth: 'admin' }, (c) => {
    c.state.deletedStocktwitsAnalyses.add(c.params.id as string);
    c.state.stocktwitsAnalyses = c.state.stocktwitsAnalyses.filter((a) => a.id !== c.params.id);
    return { message: 'Deleted' };
  });

  // GET :symbol/events — @Public(); up to 10 future event_calendar rows.
  r.get('/v1/stocktwits/:symbol/events', { auth: 'public', empty: () => [] }, (c) => {
    const symbol = c.params.symbol as string;
    const t = c.state.tickers.find((x) => x.symbol === symbol);
    if (!t) return [];
    const rr = rng('events:' + symbol);
    const fund = c.state.fundamentals.get(t.id);
    const mk = (i: number, title: string, type: string, date: string | null, dateText: string | null, impact: number | null, source: string, description: string | null): Record<string, unknown> => ({
      id: uuid(`event:${symbol}:${i}`),
      ticker_id: t.id,
      symbol,
      title,
      description,
      event_date: date,
      date_text: dateText,
      // numeric column without a transformer → string.
      confidence: dec(0.6 + rr() * 0.4, 2),
      impact_score: impact,
      expected_impact: impact !== null && impact >= 7 ? 'Likely to move the stock sharply in either direction.' : 'Incremental; mostly a sentiment check.',
      event_type: type,
      source,
      source_reference: null,
      created_at: iso(c.state.now - 3 * DAY),
      updated_at: iso(c.state.now - 3 * DAY),
    });
    const events = [
      mk(0, `${symbol} quarterly earnings`, 'earnings', fund?.next_earnings_date ?? isoDate(c.state.now + 20 * DAY), null, 8, 'risk_analysis', 'Consensus expects a modest beat; guidance is the swing factor.'),
      mk(1, 'Investor day', 'conference', isoDate(c.state.now + (35 + Math.floor(rr() * 20)) * DAY), null, 5, 'ai_search', null),
      mk(2, 'Product launch event', 'product_launch', isoDate(c.state.now + (60 + Math.floor(rr() * 30)) * DAY), 'late next quarter', 6, 'stocktwits', 'Mentioned repeatedly by retail posters; not confirmed by the company.'),
    ];
    return events.sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
  });

  // GET :symbol/stats/volume — @Public(); posts per day for 30 days,
  // `{ symbol, startDate, endDate, stats: [{ date, count, topics }] }` with
  // M/D/YYYY range labels.
  r.get('/v1/stocktwits/:symbol/stats/volume', { auth: 'public' }, (c) => {
    const symbol = c.params.symbol as string;
    const posts = c.scenario.empty ? [] : stPosts(c.state, symbol);
    const byDay = new Map<string, number>();
    for (const p of posts) {
      const d = (p.created_at as string).slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    const days = [...byDay.keys()].sort();
    const analyses = c.scenario.empty ? [] : stAnalyses(c.state, symbol).slice(0, 10);
    const fmt = (s: string): string => {
      const [y, m, d] = s.split('-') as [string, string, string];
      return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`;
    };
    return {
      symbol,
      startDate: fmt(days[0] ?? isoDate(Date.now() - 30 * DAY)),
      endDate: fmt(days[days.length - 1] ?? isoDate(Date.now())),
      stats: days.map((date) => {
        const at = Date.parse(date);
        const hit = analyses.find((a) => at >= Date.parse(a.analysis_start.slice(0, 10)) && at <= Date.parse(a.analysis_end.slice(0, 10)) + DAY);
        return { date, count: byDay.get(date) ?? 0, topics: hit?.highlights.topics.slice(0, 3) ?? [] };
      }),
    };
  });
}

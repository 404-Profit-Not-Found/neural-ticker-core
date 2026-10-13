// Dev-only in-memory stand-in for the NestJS API (src/), as a Vite plugin.
//
//   import { mockApi } from './mock/plugin.ts';
//   plugins: [react(), mockApi()]            // active only when V2_MOCK=1
//
// It registers one connect middleware that answers every `/api/*` request
// from memory — before Vite's own proxy, so an existing `/api` proxy entry is
// simply never reached. Nothing here is bundled into a build (`apply: 'serve'`).
//
// Fidelity rules: every handler cites the controller/service it mirrors and
// returns that code's real shape (see routes-*.ts). Anything without a handler
// is answered 501 `{ mock: 'unhandled', method, path }` and logged, so missing
// coverage is loud.
//
// Sessions       signed out by default. POST /api/auth/dev/token { email }
//                signs in (email containing "admin" → admin). The seeded
//                accounts are dev@test.com (user, full data set) and
//                admin@test.com (admin).
// Shortcuts      any URL with ?mock_user=user|admin|none sets/clears the
//                session cookie; ?mock_scenario=empty,latency:800 sets the
//                per-browser scenario cookie (?mock_scenario=reset clears it).
// Test controls  POST /api/__mock/login { role: 'user'|'admin'|'none' }
//                POST /api/__mock/reset            rebuild the seed state
//                POST /api/__mock/scenario { latency?, empty?, error?,
//                     market?: 'auto'|'open'|'closed', notify?, cookie? }
//                GET  /api/__mock/info             ids + sample links + routes
//                POST /api/__mock/notify           push a notification (SSE)
// Scenarios      latency (ms, default 120) · empty (list endpoints return
//                their empty shape) · error (protected endpoints → 500) ·
//                market (force open/closed) · notify (seconds between ambient
//                SSE notifications, 0 = off).
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { Ctx, Scenario } from './core.ts';
import {
  HANDLED,
  HttpError,
  Router,
  appendCookie,
  forbiddenResource,
  internalError,
  parseCookies,
  readBody,
  reply,
  sendJson,
  sleep,
} from './core.ts';
import { SCENARIO_COOKIE, authenticate, clearAuthCookie, setAuthCookie } from './session.ts';
import type { MockState, User } from './state.ts';
import { DEFAULT_SCENARIO, createState, shareSignature } from './state.ts';
import { devLoginUser, registerAuth } from './routes-auth.ts';
import { registerMarket } from './routes-market.ts';
import { notify, registerUser } from './routes-user.ts';
import { registerContent } from './routes-content.ts';
import { redactUser } from './views.ts';

export interface MockApiOptions {
  /** Turn the mock on regardless of the V2_MOCK env var. */
  force?: boolean;
  /** Where the fake OAuth round trip redirects to; defaults to Vite's `base`
   *  (empty at the root, `/app` when the app is built for a sub-path). */
  frontendUrl?: string;
  /** Log every request, not just 501s and 5xx. Also V2_MOCK_LOG=1. */
  verbose?: boolean;
}

type Next = (err?: unknown) => void;

const C = { red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m', cyan: '\x1b[36m', off: '\x1b[0m' };

/** `latency:800,empty,market:closed` or `latency=800&empty=1`. */
function parseScenario(raw: string | undefined | null): Partial<Scenario> {
  const out: Partial<Scenario> = {};
  if (!raw) return out;
  for (const token of raw.split(/[&,]/)) {
    const [k, val = '1'] = token.split(/[=:]/).map((x) => x.trim());
    const on = !['0', 'false', 'off', 'no'].includes(val.toLowerCase());
    if (k === 'latency' && Number.isFinite(Number(val))) out.latency = Math.max(0, Number(val));
    else if (k === 'empty') out.empty = on;
    else if (k === 'error') out.error = on;
    else if (k === 'market' && ['auto', 'open', 'closed'].includes(val)) out.market = val as Scenario['market'];
    else if (k === 'notify' && Number.isFinite(Number(val))) out.notify = Math.max(0, Number(val));
  }
  return out;
}

const scenarioString = (s: Partial<Scenario>): string =>
  Object.entries(s)
    .map(([k, val]) => `${k}=${typeof val === 'boolean' ? (val ? 1 : 0) : val}`)
    .join('&');

export function createMockHandler(opts: { frontendUrl: string; verbose: boolean }): (
  req: IncomingMessage,
  res: ServerResponse,
  next: Next,
) => void {
  const box: { state: MockState } = { state: createState() };
  const router = new Router();

  const resetState = (): void => {
    for (const t of box.state.timers) clearTimeout(t);
    for (const client of box.state.sseClients) if (!client.res.writableEnded) client.res.end();
    box.state = createState();
  };

  // ── mock controls (not part of the real API) ───────────────────────────
  router.post('/__mock/login', { auth: 'public', status: 200, noError: true }, (c) => {
    const role = (c.body?.role as string) ?? 'user';
    if (c.body?.email) {
      const user = devLoginUser(c.state, c.body.email as string);
      setAuthCookie(c.res, user.id);
      return { ok: true, user: redactUser(user) };
    }
    if (role === 'none') {
      clearAuthCookie(c.res);
      return { ok: true, user: null };
    }
    const id = role === 'admin' ? c.state.ids.admin : c.state.ids.user;
    setAuthCookie(c.res, id);
    return { ok: true, user: redactUser(c.state.users.find((u) => u.id === id) as User) };
  });

  router.post('/__mock/reset', { auth: 'public', status: 200, noError: true }, () => {
    resetState();
    return { ok: true };
  });

  router.get('/__mock/scenario', { auth: 'public', noError: true }, (c) => ({ global: c.state.scenario, effective: c.scenario }));
  router.post('/__mock/scenario', { auth: 'public', status: 200, noError: true }, (c) => {
    const b = (c.body ?? {}) as Record<string, unknown>;
    if (b.reset) {
      c.state.scenario = { ...DEFAULT_SCENARIO };
      appendCookie(c.res, `${SCENARIO_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
      return { global: c.state.scenario, effective: c.state.scenario };
    }
    const patch = parseScenario(
      Object.entries(b)
        .filter(([k]) => k !== 'cookie')
        .map(([k, val]) => `${k}=${val === true ? 1 : val === false ? 0 : String(val)}`)
        .join('&'),
    );
    if (b.cookie) {
      // Per-browser override: merge into the scenario cookie.
      const merged = { ...parseScenario(parseCookies(c.req.headers.cookie)[SCENARIO_COOKIE]), ...patch };
      appendCookie(c.res, `${SCENARIO_COOKIE}=${encodeURIComponent(scenarioString(merged))}; Path=/; SameSite=Lax`);
      return { global: c.state.scenario, effective: { ...c.state.scenario, ...merged } };
    }
    Object.assign(c.state.scenario, patch);
    return { global: c.state.scenario, effective: { ...c.scenario, ...patch } };
  });

  router.get('/__mock/info', { auth: 'public', noError: true }, (c) => {
    const { state } = c;
    const note = state.notes.find((n) => n.user_id === state.ids.user && n.status === 'completed' && n.tickers[0] === 'NVDA');
    return {
      users: {
        user: state.users.find((u) => u.id === state.ids.user)?.email,
        admin: state.users.find((u) => u.id === state.ids.admin)?.email,
      },
      ids: state.ids,
      scenario: { global: state.scenario, effective: c.scenario },
      sample: note
        ? {
            ticker: 'NVDA',
            completedNoteId: note.id,
            researchPath: `/ticker/NVDA/research/${note.id}`,
            reportPath: `/report/${note.id}/${shareSignature(note.id)}`,
          }
        : null,
      routes: router.routes.map((r) => `${r.method} /api${r.pattern} [${r.auth}]`),
    };
  });

  // POST /api/__mock/notify { type?, title?, message?, data? } — push a
  // notification to the signed-in user (persisted + sent over the SSE stream).
  router.post('/__mock/notify', { auth: 'user', status: 200, noError: true }, (c) => {
    const b = (c.body ?? {}) as Record<string, unknown>;
    return notify(
      c.state,
      (c.user as User).id,
      (b.type as string) || 'price_alert',
      (b.title as string) || 'NVDA hit $130.00',
      (b.message as string) || 'NVDA reached $130.00, above your target of $130.00.',
      (b.data as Record<string, unknown>) || { symbol: 'NVDA' },
    );
  });

  registerAuth(router, { frontendUrl: opts.frontendUrl });
  registerMarket(router);
  registerUser(router);
  registerContent(router);

  const log = (line: string): void => {
    // eslint-disable-next-line no-console
    console.log(`${C.cyan}[mock-api]${C.off} ${line}`);
  };

  /** ?mock_user= / ?mock_scenario= on any URL (pages included). */
  const queryControls = (url: URL, res: ServerResponse): void => {
    const who = url.searchParams.get('mock_user');
    if (who === 'none') clearAuthCookie(res);
    else if (who === 'admin') setAuthCookie(res, box.state.ids.admin);
    else if (who === 'user') setAuthCookie(res, box.state.ids.user);
    const sc = url.searchParams.get('mock_scenario');
    if (sc === 'reset' || sc === '') {
      appendCookie(res, `${SCENARIO_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    } else if (sc) {
      appendCookie(res, `${SCENARIO_COOKIE}=${encodeURIComponent(scenarioString(parseScenario(sc)))}; Path=/; SameSite=Lax`);
    }
  };

  const handleApi = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
    const state = box.state;
    const method = (req.method ?? 'GET').toUpperCase();
    const path = url.pathname.slice('/api'.length) || '/';
    const started = Date.now();
    const scenario: Scenario = {
      ...state.scenario,
      ...parseScenario(parseCookies(req.headers.cookie)[SCENARIO_COOKIE]),
      // A scenario passed on this very request wins over the cookie.
      ...parseScenario(url.searchParams.get('mock_scenario')),
    };
    const done = (status: number, note = ''): void => {
      if (opts.verbose || status >= 500) {
        const colour = status >= 500 ? C.red : status >= 400 ? C.yellow : C.dim;
        log(`${colour}${status}${C.off} ${method} ${url.pathname}${url.search} ${C.dim}${Date.now() - started}ms${C.off}${note}`);
      }
    };

    try {
      if (method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
      const body = await readBody(req);
      const isControl = path.startsWith('/__mock/');
      if (scenario.latency > 0 && !isControl) await sleep(scenario.latency);

      const hit = router.match(method === 'HEAD' ? 'GET' : method, path);
      if (!hit) {
        // Loud on purpose: the UI called something the mock does not cover.
        log(`${C.red}501 UNHANDLED${C.off} ${method} ${url.pathname}${url.search} — add a handler in frontend-v2/mock/routes-*.ts`);
        sendJson(res, 501, { mock: 'unhandled', method, path: url.pathname });
        return;
      }
      const { route, params } = hit;

      // Guards run before pipes and handlers, exactly as in Nest.
      let user: User | null = null;
      if (route.auth !== 'public') {
        user = authenticate(state, req);
        if (route.auth === 'admin' && user.role !== 'admin') throw forbiddenResource();
      }
      const ctx: Ctx = { req, res, method, path, query: url.searchParams, params, body, user, state, scenario };

      if (scenario.error && route.auth !== 'public' && !route.noError) throw internalError();

      const status = route.status ?? (method === 'POST' ? 201 : 200);
      if (scenario.empty && route.empty) {
        reply(res, status, route.empty(ctx));
        done(status, ' (empty scenario)');
        return;
      }
      const result = await route.handler(ctx);
      if (result === HANDLED) {
        done(res.statusCode);
        return;
      }
      reply(res, status, result);
      done(status);
    } catch (err) {
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      if (err instanceof HttpError) {
        sendJson(res, err.status, err.payload);
        done(err.status);
        return;
      }
      log(`${C.red}handler crashed${C.off} ${method} ${url.pathname}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      sendJson(res, 500, { statusCode: 500, message: 'Internal server error' });
      done(500);
    }
  };

  return (req, res, next) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://mock.local');
    } catch {
      next();
      return;
    }
    queryControls(url, res);
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
      next();
      return;
    }
    void handleApi(req, res, url);
  };
}

export function mockApi(options: MockApiOptions = {}): Plugin {
  return {
    name: 'neural-ticker:mock-api',
    apply: 'serve',
    configureServer(server) {
      if (!options.force && process.env.V2_MOCK !== '1') return;
      const base = server.config.base.replace(/\/+$/, '');
      const handler = createMockHandler({
        frontendUrl: options.frontendUrl ?? base,
        verbose: options.verbose ?? process.env.V2_MOCK_LOG === '1',
      });
      // Registered inside the hook (not returned as a post-hook), so it runs
      // BEFORE Vite's proxy and SPA fallback.
      server.middlewares.use(handler);
      server.config.logger.info(
        `\n  ${C.cyan}[mock-api]${C.off} /api/* is served from memory (frontend-v2/mock). ` +
          `Sign in: ?mock_user=user|admin · controls: GET /api/__mock/info\n`,
      );
    },
  };
}

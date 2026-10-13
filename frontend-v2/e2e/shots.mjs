#!/usr/bin/env node
// Screenshot + health-check harness for an app running on the mock API
// (frontend-v2/mock). It starts nothing: point it at a running dev server.
//
//   node frontend-v2/e2e/shots.mjs --base http://localhost:5180/ --out /tmp/shots
//   node frontend-v2/e2e/shots.mjs --base http://localhost:5274/ --out shots --routes dashboard,portfolio --viewports mobile
//
// Options
//   --base <url>        App root URL (default http://localhost:5274/). Routes
//                       are joined onto it, so a sub-path base works.
//   --out <dir>         Output directory (required).
//   --routes a,b,c      Route names from the table below, or literal paths
//                       ("ticker/AAPL", "/alerts"). Default: all.
//   --auth user|admin|none
//                       Session for every route. Omit it to use the defaults:
//                       user everywhere, admin for /admin, signed-out for
//                       /login, /access-denied and the public report.
//   --viewports desktop,mobile
//                       desktop 1440x900 @1x · mobile 390x844 @2x (isMobile, touch).
//   --theme <name>      Theme to render in (sets localStorage `theme-preference`
//                       and, when signed in, PATCHes /api/v1/users/me).
//   --scenario <spec>   Mock scenario for this run only, e.g. "empty",
//                       "error", "latency:1500", "market:closed".
//   --click <selector>  Click the first match after the page has loaded (open a
//                       menu, a dialog, a tab) before capturing.
//   --suffix <text>     Appended to the file names and to report<suffix>.json, so a
//                       --click run can live next to the plain one.
//   --full              Full-page captures only (default: viewport + full page).
//   --viewport-only     Viewport captures only.
//   --reset             POST /api/__mock/reset before starting.
//   --timeout <ms>      Per-page budget for load + network idle (default 20000).
//   --settle <ms>       Pause before animations are frozen, so entrance
//                       animations can finish (default 1000).
//
// Output: <out>/<route>-<viewport>.png, <out>/<route>-<viewport>-full.png and
// <out>/report.json (per route/viewport: console errors, page errors, failed
// requests, HTTP >= 400, unhandled 501 mock hits, horizontal overflow). Exit code 1 when any page threw an error or hit an
// unhandled (501) mock endpoint.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Playwright (and its browsers) are already installed for v1's e2e suite.
const require = createRequire(resolve(here, '../../frontend/package.json'));
const { chromium } = require('@playwright/test');

// ── route table ──────────────────────────────────────────────────────────
// `auth` pins the session a route needs; it applies when --auth is omitted.
// `{noteId}` / `{reportPath}` are filled from GET /api/__mock/info.
const ROUTES = [
  { name: 'dashboard', path: '' },
  { name: 'watchlist', path: 'watchlist' },
  { name: 'analyzer', path: 'analyzer' },
  { name: 'portfolio', path: 'portfolio' },
  { name: 'alerts', path: 'alerts' },
  { name: 'news', path: 'news' },
  { name: 'research', path: 'research' },
  { name: 'profile', path: 'profile' },
  { name: 'admin', path: 'admin', auth: 'admin' },
  { name: 'about', path: 'about' },
  { name: 'privacy', path: 'privacy' },
  { name: 'terms', path: 'terms' },
  { name: 'login', path: 'login', auth: 'none' },
  { name: 'access-denied', path: 'access-denied?error=invite_only', auth: 'none' },
  { name: 'ticker-NVDA', path: 'ticker/NVDA' },
  { name: 'ticker-NVDA-research', path: 'ticker/NVDA/research' },
  { name: 'ticker-NVDA-financials', path: 'ticker/NVDA/financials' },
  { name: 'ticker-NVDA-news', path: 'ticker/NVDA/news' },
  { name: 'ticker-NVDA-social', path: 'ticker/NVDA/social' },
  { name: 'ticker-NVDA-research-note', path: 'ticker/NVDA/research/{noteId}' },
  { name: 'report', path: '{reportPath}', auth: 'none' },
];

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const FREEZE_CSS = '*{animation-play-state:paused!important;caret-color:transparent!important}';
// Dev-only chrome that is not part of the design: the TanStack Query devtools
// launcher floats over the bottom-right corner of every page.
const HIDE_DEV_CHROME_CSS = '.tsqd-parent-container{display:none!important}';

// ── args ─────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
    if (['full', 'viewport-only', 'reset', 'help'].includes(key)) {
      out.flags.add(key);
      continue;
    }
    out[key] = eq === -1 ? argv[++i] : a.slice(eq + 1);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.flags.has('help') || !args.out) {
  console.error(
    'usage: node shots.mjs --out <dir> [--base <url>] [--routes a,b] [--auth user|admin|none]\n' +
      '                      [--viewports desktop,mobile] [--theme <name>] [--scenario <spec>]\n' +
      '                      [--click <selector>] [--suffix <text>] [--full | --viewport-only]\n' +
      '                      [--reset] [--timeout <ms>] [--settle <ms>]\n\nroutes: ' +
      ROUTES.map((r) => r.name).join(', '),
  );
  process.exit(args.flags.has('help') ? 0 : 2);
}

const base = new URL((args.base ?? 'http://localhost:5274/').replace(/\/*$/, '/'));
const origin = base.origin;
const outDir = resolve(process.cwd(), args.out);
const timeout = Number(args.timeout ?? 20000);
const settle = Number(args.settle ?? 1000);
const suffix = (args.suffix ?? '').replace(/[^A-Za-z0-9._-]+/g, '-');
const explicitAuth = args.auth;
if (explicitAuth && !['user', 'admin', 'none'].includes(explicitAuth)) {
  console.error(`--auth must be user, admin or none (got "${explicitAuth}")`);
  process.exit(2);
}
const viewportNames = (args.viewports ?? 'desktop,mobile').split(',').map((s) => s.trim()).filter(Boolean);
for (const v of viewportNames) {
  if (!VIEWPORTS[v]) {
    console.error(`unknown viewport "${v}" (use desktop, mobile)`);
    process.exit(2);
  }
}
const wantViewport = !args.flags.has('full');
const wantFull = !args.flags.has('viewport-only');

const slug = (p) => p.replace(/^\/+|\/+$/g, '').replace(/[?#].*$/, '').replace(/[^A-Za-z0-9._-]+/g, '-') || 'dashboard';

/** Join a route onto the app root — never as an absolute path. */
const routeUrl = (path) => new URL(path.replace(/^\/+/, ''), base).href;

// ── mock helpers ─────────────────────────────────────────────────────────
async function mockInfo() {
  const res = await fetch(`${origin}/api/__mock/info`);
  if (!res.ok) throw new Error(`GET /api/__mock/info → ${res.status}. Is the mock API running at ${origin}?`);
  return res.json();
}

function resolveRoutes(info) {
  const fill = (path) => {
    const sample = info.sample ?? {};
    if (path.includes('{noteId}')) {
      if (!sample.completedNoteId) return null;
      return path.replace('{noteId}', sample.completedNoteId);
    }
    if (path.includes('{reportPath}')) {
      if (!sample.reportPath) return null;
      return path.replace('{reportPath}', sample.reportPath.replace(/^\/+/, ''));
    }
    return path;
  };
  const wanted = args.routes ? args.routes.split(',').map((s) => s.trim()).filter(Boolean) : ROUTES.map((r) => r.name);
  const out = [];
  for (const w of wanted) {
    const known = ROUTES.find((r) => r.name === w || `/${r.path}` === w || r.path === w);
    const route = known ?? { name: slug(w), path: w.replace(/^\/+/, '') };
    const path = fill(route.path);
    if (path === null) {
      console.warn(`skip ${route.name}: the mock has no sample note to build it from`);
      continue;
    }
    out.push({ ...route, path });
  }
  return out;
}

// ── page instrumentation ─────────────────────────────────────────────────
/** Resolves once no request (SSE and websockets aside) has been in flight
 *  for `quiet` ms. Playwright's own `networkidle` never fires while an
 *  EventSource is open, and the app keeps one for notifications. */
function trackNetwork(page) {
  const pending = new Set();
  let lastActivity = Date.now();
  const ignore = (req) => req.resourceType() === 'eventsource' || req.resourceType() === 'websocket' || /\/notifications\/stream/.test(req.url());
  page.on('request', (req) => {
    if (ignore(req)) return;
    pending.add(req);
    lastActivity = Date.now();
  });
  const settle = (req) => {
    if (pending.delete(req)) lastActivity = Date.now();
  };
  page.on('requestfinished', settle);
  page.on('requestfailed', settle);
  return async function idle(quiet = 600, budget = timeout) {
    const deadline = Date.now() + budget;
    for (;;) {
      if (pending.size === 0 && Date.now() - lastActivity >= quiet) return true;
      if (Date.now() > deadline) return false;
      await new Promise((r) => setTimeout(r, 100));
    }
  };
}

/** Runs in the page: does the document scroll sideways, and who causes it? */
function measureOverflow() {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const scrollsX = doc.scrollWidth > vw;
  const result = { scrollWidth: doc.scrollWidth, clientWidth: vw, horizontalScroll: scrollsX, wideElements: [] };
  if (!scrollsX) return result;
  const describe = (el) => {
    const part = (e) => {
      let s = e.tagName.toLowerCase();
      if (e.id) s += `#${e.id}`;
      const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : [];
      if (cls.length) s += '.' + cls.join('.');
      return s;
    };
    const chain = [];
    for (let e = el, i = 0; e && e !== document.body && i < 3; e = e.parentElement, i++) chain.unshift(part(e));
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return chain.join(' > ') + (text ? ` "${text}"` : '');
  };
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== doc; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox !== 'visible') return true;
    }
    return false;
  };
  const hits = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (getComputedStyle(el).position === 'fixed' && r.left >= vw) continue;
    if (clipped(el)) continue;
    hits.push({ el, width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right) });
  }
  // Keep the outermost offenders: an element is noise if its parent is listed too.
  const set = new Set(hits.map((h) => h.el));
  result.wideElements = hits
    .filter((h) => !set.has(h.el.parentElement))
    .sort((a, b) => b.right - a.right)
    .slice(0, 20)
    .map((h) => ({ selector: describe(h.el), width: h.width, left: h.left, right: h.right, overflowBy: h.right - vw }));
  return result;
}

async function shoot(context, route, vpName, authLabel) {
  const page = await context.newPage();
  const entry = {
    route: route.name,
    path: '/' + route.path,
    viewport: vpName,
    auth: authLabel,
    url: routeUrl(route.path),
    finalUrl: null,
    documentStatus: null,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    unhandled: [],
    idle: true,
    horizontalScroll: false,
    scrollWidth: null,
    clientWidth: null,
    wideElements: [],
    theme: null,
    files: [],
  };
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const where = msg.location()?.url;
    entry.consoleErrors.push(msg.text().slice(0, 500) + (where ? ` [${where}]` : ''));
  });
  page.on('pageerror', (err) => entry.pageErrors.push(String(err && err.stack ? err.stack : err).slice(0, 800)));
  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText ?? 'failed';
    // Requests cancelled by the page itself (navigation, unmount, closing the SSE stream) are not failures.
    if (failure === 'net::ERR_ABORTED') return;
    entry.failedRequests.push({ method: req.method(), url: req.url(), error: failure });
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    const item = { status, method: res.request().method(), url: res.url() };
    if (status === 501) entry.unhandled.push(item);
    else entry.httpErrors.push(item);
  });
  const idle = trackNetwork(page);

  try {
    const response = await page.goto(entry.url, { waitUntil: 'load', timeout });
    entry.documentStatus = response ? response.status() : null;
    entry.idle = await idle();
    await page.evaluate(() => document.fonts.ready);
    // Nudge lazy content (intersection observers, virtual lists), then return to the top.
    await page.evaluate(async () => {
      const step = Math.max(200, window.innerHeight * 0.8);
      const max = Math.min(document.documentElement.scrollHeight, 30000);
      for (let y = 0; y < max; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    });
    entry.idle = (await idle(600, 8000)) && entry.idle;
    if (args.click) {
      await page.locator(args.click).first().click({ timeout: 5000 });
      entry.clicked = args.click;
      entry.idle = (await idle(600, 8000)) && entry.idle;
    }
    // Let entrance animations finish, then freeze whatever still loops —
    // only now, after the page has finished loading.
    await page.waitForTimeout(settle);
    await page.addStyleTag({ content: FREEZE_CSS + HIDE_DEV_CHROME_CSS });
    await page.waitForTimeout(350);

    entry.finalUrl = page.url();
    Object.assign(entry, await page.evaluate(measureOverflow));
    entry.theme = await page.evaluate(
      () => document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-palette') || null,
    );

    const stem = `${route.name}${suffix}-${vpName}`;
    if (wantViewport) {
      await page.screenshot({ path: resolve(outDir, `${stem}.png`) });
      entry.files.push(`${stem}.png`);
    }
    if (wantFull) {
      await page.screenshot({ path: resolve(outDir, `${stem}-full.png`), fullPage: true });
      entry.files.push(`${stem}-full.png`);
    }
  } catch (err) {
    entry.pageErrors.push(`harness: ${err && err.message ? err.message : String(err)}`);
  } finally {
    await page.close().catch(() => {});
  }
  return entry;
}

// ── main ─────────────────────────────────────────────────────────────────
await mkdir(outDir, { recursive: true });
if (args.flags.has('reset')) {
  await fetch(`${origin}/api/__mock/reset`, { method: 'POST' });
}
const info = await mockInfo();
const routes = resolveRoutes(info);

const browser = await chromium.launch();
const results = [];
const started = Date.now();
try {
  for (const vpName of viewportNames) {
    // One browser context per session, so cookies never leak between roles.
    const contexts = new Map();
    const restore = [];
    const contextFor = async (auth) => {
      if (contexts.has(auth)) return contexts.get(auth);
      const context = await browser.newContext({ ...VIEWPORTS[vpName], serviceWorkers: 'block', locale: 'en-US' });
      // Mock scenario for this browser only; ambient SSE notifications are
      // switched off so the bell shows the same count on every page.
      const scenario = ['notify=0', ...(args.scenario ? args.scenario.split(',').map((s) => s.trim().replace(':', '=')) : [])].join('&');
      await context.addCookies([{ name: 'mock_scenario', value: encodeURIComponent(scenario), url: origin }]);
      if (auth !== 'none') {
        const res = await context.request.post(`${origin}/api/__mock/login`, { data: { role: auth } });
        if (!res.ok()) throw new Error(`mock login as ${auth} failed: ${res.status()}`);
      }
      if (args.theme) {
        await context.addInitScript((theme) => {
          try {
            localStorage.setItem('theme-preference', theme);
          } catch {
            /* storage unavailable */
          }
        }, args.theme);
        if (auth !== 'none') {
          const me = await (await context.request.get(`${origin}/api/auth/profile`)).json();
          await context.request.patch(`${origin}/api/v1/users/me`, { data: { theme: args.theme } });
          restore.push(() => context.request.patch(`${origin}/api/v1/users/me`, { data: { theme: me.theme || 'dark' } }));
        }
      }
      contexts.set(auth, context);
      return context;
    };

    try {
      for (const route of routes) {
        const auth = explicitAuth ?? route.auth ?? 'user';
        const context = await contextFor(auth);
        const entry = await shoot(context, route, vpName, auth);
        results.push(entry);
        const marks = [
          entry.pageErrors.length ? `${entry.pageErrors.length} page error(s)` : '',
          entry.unhandled.length ? `${entry.unhandled.length} unhandled(501)` : '',
          entry.consoleErrors.length ? `${entry.consoleErrors.length} console error(s)` : '',
          entry.failedRequests.length ? `${entry.failedRequests.length} failed request(s)` : '',
          entry.horizontalScroll ? `h-scroll +${entry.scrollWidth - entry.clientWidth}px` : '',
          entry.idle ? '' : 'never idle',
        ].filter(Boolean);
        console.log(`${marks.length ? '!' : '✓'} ${vpName.padEnd(7)} ${auth.padEnd(5)} ${('/' + route.path).padEnd(48)} ${marks.join(' · ')}`);
      }
    } finally {
      for (const undo of restore) await undo().catch(() => {});
      for (const context of contexts.values()) await context.close().catch(() => {});
    }
  }
} finally {
  await browser.close();
}

const summary = {
  pages: results.length,
  pageErrors: results.reduce((n, r) => n + r.pageErrors.length, 0),
  unhandled: results.reduce((n, r) => n + r.unhandled.length, 0),
  consoleErrors: results.reduce((n, r) => n + r.consoleErrors.length, 0),
  failedRequests: results.reduce((n, r) => n + r.failedRequests.length, 0),
  httpErrors: results.reduce((n, r) => n + r.httpErrors.length, 0),
  horizontalScroll: results.filter((r) => r.horizontalScroll).map((r) => `${r.route}-${r.viewport}`),
  notIdle: results.filter((r) => !r.idle).map((r) => `${r.route}-${r.viewport}`),
};
const report = {
  base: base.href,
  generatedAt: new Date().toISOString(),
  durationMs: Date.now() - started,
  options: {
    auth: explicitAuth ?? 'per-route defaults',
    viewports: viewportNames,
    theme: args.theme ?? null,
    scenario: args.scenario ?? null,
    captures: [wantViewport && 'viewport', wantFull && 'full'].filter(Boolean),
  },
  summary,
  results,
};
await writeFile(resolve(outDir, `report${suffix}.json`), JSON.stringify(report, null, 2));

console.log(
  `\n${results.length} page(s) → ${outDir}\n` +
    `page errors ${summary.pageErrors} · unhandled(501) ${summary.unhandled} · console errors ${summary.consoleErrors} · ` +
    `failed requests ${summary.failedRequests} · http ≥400 ${summary.httpErrors} · horizontal scroll ${summary.horizontalScroll.length}`,
);
process.exit(summary.pageErrors > 0 || summary.unhandled > 0 ? 1 : 0);

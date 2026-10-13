// HTTP plumbing for the mock API: a tiny route table plus helpers that
// reproduce how NestJS (Express adapter) serialises results and errors.
//
// Mirrors:
//  - src/main.ts                      global prefix `api`, ValidationPipe
//    ({ whitelist, transform, forbidNonWhitelisted }), cookie-parser, no ETag
//  - src/app.module.ts                APP_GUARD JwtAuthGuard (everything is
//    protected unless @Public())
//  - src/modules/auth/jwt-auth.guard.ts, guards/roles.guard.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MockState, User } from './state.ts';

export type Auth = 'public' | 'user' | 'admin';

export interface Scenario {
  /** Artificial delay per request, ms. */
  latency: number;
  /** Every list endpoint answers with its empty shape. */
  empty: boolean;
  /** Every protected endpoint answers 500. */
  error: boolean;
  /** Force the market open/closed (drives the sell/buy executed-vs-queued
   *  split and the status badges); `auto` follows the clock. */
  market: 'auto' | 'open' | 'closed';
  /** Seconds between "ambient" notifications pushed over the SSE stream
   *  (0 = never). */
  notify: number;
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  /** Path after the `/api` global prefix, e.g. `/v1/tickers/AAPL`. */
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  /** The authenticated user, or null. On @Public() routes Nest never runs
   *  passport, so `req.user` is undefined there — handlers of public routes
   *  must not rely on it (the mock passes null to stay honest). */
  user: User | null;
  state: MockState;
  scenario: Scenario;
}

/** Marker: handler already wrote the response itself (SSE, images, redirects). */
export const HANDLED = Symbol('handled');

export type Handler = (c: Ctx) => unknown | Promise<unknown>;

export interface RouteOpts {
  auth: Auth;
  /** Success status. Nest defaults: POST → 201, everything else → 200. */
  status?: number;
  /** Response used when the `empty` scenario is on (list endpoints only). */
  empty?: (c: Ctx) => unknown;
  /** Never apply the `error` scenario (auth plumbing, mock controls). */
  noError?: boolean;
}

interface Route extends RouteOpts {
  method: string;
  pattern: string;
  segments: string[];
  handler: Handler;
}

export class Router {
  readonly routes: Route[] = [];

  add(method: string, pattern: string, opts: RouteOpts, handler: Handler): void {
    this.routes.push({
      ...opts,
      method,
      pattern,
      segments: pattern.split('/').filter(Boolean),
      handler,
    });
  }
  get(p: string, o: RouteOpts, h: Handler): void {
    this.add('GET', p, o, h);
  }
  post(p: string, o: RouteOpts, h: Handler): void {
    this.add('POST', p, o, h);
  }
  patch(p: string, o: RouteOpts, h: Handler): void {
    this.add('PATCH', p, o, h);
  }
  put(p: string, o: RouteOpts, h: Handler): void {
    this.add('PUT', p, o, h);
  }
  delete(p: string, o: RouteOpts, h: Handler): void {
    this.add('DELETE', p, o, h);
  }

  /** First registered match wins — same as Express/Nest, so literal routes
   *  must be registered before the `:param` routes they overlap with. */
  match(
    method: string,
    path: string,
  ): { route: Route; params: Record<string, string> } | null {
    const parts = path.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const seg = route.segments[i] as string;
        const part = parts[i] as string;
        if (seg.startsWith(':')) {
          try {
            params[seg.slice(1)] = decodeURIComponent(part);
          } catch {
            params[seg.slice(1)] = part;
          }
        } else if (seg !== part) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return null;
  }
}

// ── Nest-shaped errors ───────────────────────────────────────────────────

const REASON: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/** Thrown by handlers; serialised exactly like a Nest HttpException:
 *  `{ message, error, statusCode }`. */
export class HttpError extends Error {
  readonly status: number;
  readonly payload: unknown;
  constructor(status: number, message: string | string[], payload?: unknown) {
    super(Array.isArray(message) ? message.join('; ') : message);
    this.status = status;
    this.payload = payload ?? {
      message,
      error: REASON[status] ?? 'Error',
      statusCode: status,
    };
  }
}

export const badRequest = (m: string | string[]): HttpError => new HttpError(400, m);
export const notFound = (m: string): HttpError => new HttpError(404, m);
export const forbidden = (m: string): HttpError => new HttpError(403, m);
export const conflict = (m: string): HttpError => new HttpError(409, m);
/** `new UnauthorizedException('msg')` — has the `error` field. */
export const unauthorizedMsg = (m: string): HttpError => new HttpError(401, m);
/** What passport's AuthGuard throws with no token: `new UnauthorizedException()`
 *  → `{ "message": "Unauthorized", "statusCode": 401 }` (no `error` key). */
export const unauthenticated = (): HttpError =>
  new HttpError(401, 'Unauthorized', { message: 'Unauthorized', statusCode: 401 });
/** RolesGuard returning false → ForbiddenException('Forbidden resource'). */
export const forbiddenResource = (): HttpError => new HttpError(403, 'Forbidden resource');
/** A non-HttpException thrown inside a handler → Nest's default filter. */
export const internalError = (): HttpError =>
  new HttpError(500, 'Internal server error', {
    statusCode: 500,
    message: 'Internal server error',
  });

// ── class-validator message helpers (ValidationPipe output) ──────────────
// Messages copied from class-validator's defaults so the 400 bodies read the
// same as the real API. Each returns a message or null.

type Check = string | null;

export const v = {
  isString: (o: Record<string, unknown>, k: string): Check =>
    typeof o[k] === 'string' ? null : `${k} must be a string`,
  isNotEmpty: (o: Record<string, unknown>, k: string): Check =>
    o[k] !== '' && o[k] !== null && o[k] !== undefined ? null : `${k} should not be empty`,
  isNumber: (o: Record<string, unknown>, k: string): Check =>
    typeof o[k] === 'number' && Number.isFinite(o[k])
      ? null
      : `${k} must be a number conforming to the specified constraints`,
  isInt: (o: Record<string, unknown>, k: string): Check =>
    typeof o[k] === 'number' && Number.isInteger(o[k]) ? null : `${k} must be an integer number`,
  min: (o: Record<string, unknown>, k: string, n: number): Check =>
    typeof o[k] === 'number' && (o[k] as number) >= n ? null : `${k} must not be less than ${n}`,
  isIn: (o: Record<string, unknown>, k: string, vals: readonly string[]): Check =>
    vals.includes(o[k] as string)
      ? null
      : `${k} must be one of the following values: ${vals.join(', ')}`,
  isEnum: (o: Record<string, unknown>, k: string, vals: readonly string[]): Check =>
    vals.includes(o[k] as string)
      ? null
      : `${k} must be one of the following values: ${vals.join(', ')}`,
  isDateString: (o: Record<string, unknown>, k: string): Check =>
    typeof o[k] === 'string' &&
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(o[k] as string) &&
    !Number.isNaN(Date.parse(o[k] as string))
      ? null
      : `${k} must be a valid ISO 8601 date string`,
  isEmail: (o: Record<string, unknown>, k: string): Check =>
    typeof o[k] === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o[k] as string)
      ? null
      : `${k} must be an email`,
  isArray: (o: Record<string, unknown>, k: string): Check =>
    Array.isArray(o[k]) ? null : `${k} must be an array`,
  maxLength: (o: Record<string, unknown>, k: string, n: number): Check =>
    typeof o[k] === 'string' && (o[k] as string).length <= n
      ? null
      : `${k} must be shorter than or equal to ${n} characters`,
  max: (o: Record<string, unknown>, k: string, n: number): Check =>
    typeof o[k] === 'number' && (o[k] as number) <= n ? null : `${k} must not be greater than ${n}`,
  isBoolean: (o: Record<string, unknown>, k: string): Check =>
    typeof o[k] === 'boolean' ? null : `${k} must be a boolean value`,
  matches: (o: Record<string, unknown>, k: string, re: RegExp, message?: string): Check =>
    typeof o[k] === 'string' && re.test(o[k] as string) ? null : (message ?? `${k} must match ${re} regular expression`),
  arrayMaxSize: (o: Record<string, unknown>, k: string, n: number): Check =>
    Array.isArray(o[k]) && (o[k] as unknown[]).length <= n ? null : `${k} must contain no more than ${n} elements`,
};

/** NumericIdPipe (src/common/pipes/numeric-id.pipe.ts): bigint ids in the
 *  path (research notes, comments) must be 1–18 digits, else 400. */
export function numericId(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{1,18}$/.test(value)) {
    throw badRequest('Invalid id: a numeric id is expected');
  }
  return value;
}

/**
 * Run a DTO through the mock ValidationPipe.
 *  - unknown keys → "property X should not exist" (forbidNonWhitelisted)
 *  - `optional` keys are skipped when undefined/null (@IsOptional)
 * Throws a 400 whose `message` is the array of failures, like Nest.
 */
export function validate(
  body: unknown,
  allowed: readonly string[],
  checks: (o: Record<string, unknown>, has: (k: string) => boolean) => Check[],
): Record<string, unknown> {
  const o: Record<string, unknown> =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const errors: string[] = [];
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) errors.push(`property ${k} should not exist`);
  }
  const has = (k: string): boolean => o[k] !== undefined && o[k] !== null;
  for (const e of checks(o, has)) if (e) errors.push(e);
  if (errors.length) throw badRequest(errors);
  return o;
}

// ── request/response helpers ─────────────────────────────────────────────

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(val);
    } catch {
      out[k] = val;
    }
  }
  return out;
}

export function appendCookie(res: ServerResponse, cookie: string): void {
  const prev = res.getHeader('Set-Cookie');
  const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

export async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    // main.ts: json({ limit: '2mb' })
    if (size > 2 * 1024 * 1024) {
      throw new HttpError(413, 'request entity too large', {
        statusCode: 413,
        message: 'request entity too large',
        error: 'Payload Too Large',
      });
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  const type = String(req.headers['content-type'] ?? '');
  if (type.includes('application/json') || /^[\s]*[{[]/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      // body-parser's SyntaxError surfaces through Nest as a 400.
      throw badRequest('Unexpected token in JSON');
    }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return {};
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  if (res.writableEnded) return;
  const body = JSON.stringify(data);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

/**
 * Send a handler's return value the way Nest's ExpressAdapter.reply does:
 *  - null/undefined → empty body (`response.send()`)
 *  - string         → sent verbatim as text/html (`response.send(str)`)
 *  - anything else  → JSON
 */
export function reply(res: ServerResponse, status: number, value: unknown): void {
  if (res.writableEnded) return;
  if (value === null || value === undefined) {
    res.statusCode = status;
    res.setHeader('Content-Length', 0);
    res.end();
    return;
  }
  if (typeof value === 'string') {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(value));
    res.end(value);
    return;
  }
  sendJson(res, status, value);
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Dates serialise to ISO strings in Nest's JSON output. */
export const iso = (ms: number): string => new Date(ms).toISOString();
export const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** A Postgres numeric/decimal column WITHOUT ColumnNumericTransformer reaches
 *  the client as a string with the column's scale (e.g. "12.00"). */
export const dec = (n: number, scale: number): string => n.toFixed(scale);

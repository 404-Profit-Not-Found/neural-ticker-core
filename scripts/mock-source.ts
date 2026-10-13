/**
 * The frontend mock (frontend-v2/mock) used as a DATA SOURCE.
 *
 * The demo data set lives there and nowhere else. Most of it is plain state
 * (`createState()`); a few fixtures exist only inside the mock's route
 * handlers (StockTwits posts / watchers / analyses / events, the generated
 * logo and news thumbnails). Instead of copying those generators, this runs
 * the mock's own routes in-process — no HTTP server, no latency — against the
 * same state, so whatever the mock serves is what gets seeded.
 */
import { Router } from '../frontend-v2/mock/core';
import type { Ctx, Scenario } from '../frontend-v2/mock/core';
import { DEFAULT_SCENARIO, createState } from '../frontend-v2/mock/state';
import type { MockState, User } from '../frontend-v2/mock/state';
import { registerAuth } from '../frontend-v2/mock/routes-auth';
import { registerMarket } from '../frontend-v2/mock/routes-market';
import { registerUser } from '../frontend-v2/mock/routes-user';
import { registerContent } from '../frontend-v2/mock/routes-content';

export interface MockResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  /** The handler's return value, or the raw text it wrote (images, 404s). */
  body: T;
}

export class MockSource {
  readonly state: MockState = createState();
  private readonly router = new Router();

  constructor() {
    registerAuth(this.router, { frontendUrl: '' });
    registerMarket(this.router);
    registerUser(this.router);
    registerContent(this.router);
  }

  /**
   * Call a mock GET route. `path` is what follows the `/api` prefix, e.g.
   * `/v1/stocktwits/NVDA/posts?page=1`. `user` stands in for the session
   * (the mock's guards live in its HTTP layer, which is not used here).
   */
  get<T = unknown>(
    path: string,
    user: User | null = null,
  ): Promise<MockResponse<T>> {
    return this.call<T>('GET', path, user);
  }

  async call<T = unknown>(
    method: string,
    path: string,
    user: User | null = null,
    body?: unknown,
  ): Promise<MockResponse<T>> {
    const url = new URL(path, 'http://mock.local');
    const hit = this.router.match(method, url.pathname);
    if (!hit) {
      throw new Error(`The mock has no route for ${method} ${url.pathname}`);
    }

    const headers: Record<string, string> = {};
    let written: unknown = null;
    const res = {
      statusCode: 200,
      headersSent: false,
      writableEnded: false,
      setHeader(name: string, value: unknown): void {
        headers[name.toLowerCase()] = String(value);
      },
      getHeader(name: string): string | undefined {
        return headers[name.toLowerCase()];
      },
      end(chunk?: unknown): void {
        written = chunk ?? '';
        this.writableEnded = true;
      },
    };
    const scenario: Scenario = { ...DEFAULT_SCENARIO, latency: 0, notify: 0 };
    const ctx = {
      req: { headers: {}, method, url: path },
      res,
      method,
      path: url.pathname,
      query: url.searchParams,
      params: hit.params,
      body,
      user,
      state: this.state,
      scenario,
    } as unknown as Ctx;

    try {
      const result = await hit.route.handler(ctx);
      if (res.writableEnded) {
        return { status: res.statusCode, headers, body: written as T };
      }
      const status = hit.route.status ?? (method === 'POST' ? 201 : 200);
      return { status, headers, body: result as T };
    } catch (err) {
      // The mock's HttpError: the Nest-shaped error body.
      const e = err as { status?: number; payload?: unknown };
      if (typeof e?.status === 'number') {
        return { status: e.status, headers, body: e.payload as T };
      }
      throw err;
    }
  }
}

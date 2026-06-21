import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';

// Force the real Postgres path: app.module.ts swaps to a sqlite test config
// when NODE_ENV === 'test' (which jest sets by default), and sqlite can't
// create the Postgres-only entity columns. Must run before AppModule init.
process.env.NODE_ENV =
  process.env.NODE_ENV === 'test'
    ? 'development'
    : process.env.NODE_ENV || 'development';

import { AppModule } from '../src/app.module';

/**
 * LIVE end-to-end test for POST /api/mcp.
 *
 * Boots the REAL AppModule — real global guards (ThrottlerGuard + JwtAuthGuard),
 * the real McpToolsModule with McpSoftAuthGuard, and a real Postgres connection
 * via DATABASE_URL (the dev Neon instance from .env). It mirrors main.ts's global
 * setup (ValidationPipe, cookieParser, global 'api' prefix) so the endpoint
 * behaves exactly as deployed.
 *
 * Verifies what the hermetic test (mcp.e2e-spec.ts) cannot: that the Public()
 * carve-out actually lets anonymous callers through the REAL global JwtAuthGuard,
 * that the global ValidationPipe doesn't reject the JSON-RPC body, and that a
 * tool returns live market data end to end.
 *
 * Requires network access to the DB + market-data providers. Skips when no DB is
 * configured or in CI.
 */
const hasDb = !!process.env.DATABASE_URL || !!process.env.DB_HOST;
const isCI = process.env.CI === 'true';
const run = hasDb && !isCI ? describe : describe.skip;

run('MCP endpoint (LIVE AppModule e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    // Mirror the global setup from main.ts that affects endpoint behavior.
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
  });

  async function rpc(body: any, headers: Record<string, string> = {}) {
    return request(app.getHttpServer())
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set(headers)
      .send(body);
  }
  function parse(res: any) {
    if (res.body && Object.keys(res.body).length > 0) return res.body;
    const line = (res.text || '')
      .split('\n')
      .find((l: string) => l.startsWith('data:'));
    return line
      ? JSON.parse(line.slice(5).trim())
      : res.text
        ? JSON.parse(res.text)
        : {};
  }

  it('lists tools anonymously through the real global guards', async () => {
    const res = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(res.status).toBe(200);
    const body = parse(res);
    const names: string[] = (body.result?.tools ?? []).map((t: any) => t.name);
    expect(names).toContain('get_ticker_snapshot');
    expect(names).toContain('get_portfolio');
    expect(names.length).toBeGreaterThanOrEqual(26);
  }, 30000);

  it('serves live market data anonymously (get_ticker_snapshot AAPL)', async () => {
    const res = await rpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'get_ticker_snapshot', arguments: { symbol: 'AAPL' } },
    });
    expect(res.status).toBe(200);
    const body = parse(res);
    expect(body.result?.isError).toBeFalsy();
    const payload = JSON.parse(body.result.content[0].text);
    expect(JSON.stringify(payload).toUpperCase()).toContain('AAPL');
  }, 60000);

  it('rejects a user-scoped tool when anonymous (get_portfolio)', async () => {
    const res = await rpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_portfolio', arguments: {} },
    });
    expect(res.status).toBe(200);
    const body = parse(res);
    expect(body.result?.isError).toBe(true);
    expect(body.result.content[0].text).toContain('Authentication required');
  }, 30000);
});

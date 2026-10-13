import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Injectable,
  Module,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { McpModule, McpTransportType, Tool } from '@rekog/mcp-nest';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request from 'supertest';
import { z } from 'zod';

import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import { Public } from '../src/modules/auth/public.decorator';

import { MarketDataTools } from '../src/modules/mcp/tools/market-data.tools';
import { RiskTools } from '../src/modules/mcp/tools/risk.tools';
import { RequestActorInterceptor } from '../src/common/request-actor/request-actor.interceptor';
import { ResearchTools } from '../src/modules/mcp/tools/research.tools';
import { PortfolioTools } from '../src/modules/mcp/tools/portfolio.tools';
import { TickerRequestsTools } from '../src/modules/mcp/tools/ticker-requests.tools';

import { MarketDataService } from '../src/modules/market-data/market-data.service';
import { MarketStatusService } from '../src/modules/market-data/market-status.service';
import { TickersService } from '../src/modules/tickers/tickers.service';
import { CurrencyService } from '../src/modules/currency/currency.service';
import { RiskRewardService } from '../src/modules/risk-reward/risk-reward.service';
import { ResearchService } from '../src/modules/research/research.service';
import { CreditService } from '../src/modules/users/credit.service';
import { PortfolioService } from '../src/modules/portfolio/portfolio.service';
import { WatchlistService } from '../src/modules/watchlist/watchlist.service';
import { PriceAlertsService } from '../src/modules/price-alerts/price-alerts.service';
import { TickerRequestsService } from '../src/modules/ticker-requests/ticker-requests.service';

/**
 * Hermetic integration test for the in-process MCP server.
 *
 * It boots a real Nest HTTP server with the actual `@Tool` provider classes
 * and the real `@rekog/mcp-nest` runtime, but mocks the DB-backed services so
 * no PostgreSQL is required. This verifies the wiring that the build cannot:
 *  - tools are discovered and listed at POST /api/mcp,
 *  - the stateless Streamable-HTTP JSON transport responds,
 *  - zod params validate/transform (symbol upper-casing),
 *  - a route guard populating `request.user` reaches the tool handlers
 *    (the same mechanism McpSoftAuthGuard relies on),
 *  - user-scoped tools reject anonymous callers via `requireUser`,
 *  - `create_research` charges credits exactly once.
 */

/** Sets `req.user` from an `x-test-user-id` header (stand-in for soft-auth). */
@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const id = req.headers['x-test-user-id'];
    const role = req.headers['x-test-user-role'];
    if (id) req.user = { id, role: role || 'user' };
    return true;
  }
}

const deductCredits = jest.fn().mockResolvedValue({});

const mockMarketData = {
  getSnapshot: jest.fn((symbol: string) =>
    Promise.resolve({ symbol, price: 123.45 }),
  ),
  getSnapshots: jest.fn((symbols: string[]) =>
    Promise.resolve(symbols.map((symbol) => ({ symbol, price: 1 }))),
  ),
  getHistory: jest.fn((symbol: string, interval: string) =>
    Promise.resolve([{ symbol, interval, close: 1 }]),
  ),
  getQuote: jest.fn((symbol: string) => Promise.resolve({ symbol, c: 99 })),
  getCompanyNews: jest.fn((symbol: string) =>
    Promise.resolve([{ symbol, headline: 'x' }]),
  ),
  getGeneralNews: jest.fn(() => Promise.resolve([{ headline: 'general' }])),
};
const mockMarketStatus = {
  getAllMarketsStatus: jest.fn(() => Promise.resolve({ US: { isOpen: true } })),
};
const mockTickers = {
  searchTickers: jest.fn((q?: string) =>
    Promise.resolve([{ symbol: 'AAPL', q }]),
  ),
};

// The REAL TickersService decides what an anonymous caller may read (its
// public-read gate), on top of a stubbed "tickers" table and stubbed
// providers — so the tests below can show that an anonymous MCP call never
// reaches a data provider, an insert or the initialisation job.
const TRACKED_SYMBOLS = ['AAPL', 'MSFT', 'RELIANCE.NS'];
const tickerRepoStub: any = {
  count: jest.fn(({ where }: any) =>
    Promise.resolve(TRACKED_SYMBOLS.includes(where.symbol) ? 1 : 0),
  ),
  find: jest.fn(({ where }: any) =>
    Promise.resolve(
      TRACKED_SYMBOLS.filter((s) => where.symbol.value.includes(s)).map(
        (symbol) => ({ symbol }),
      ),
    ),
  ),
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  create: jest.fn((dto: any) => ({ ...dto })),
  save: jest.fn(),
  // ensureTicker inserts a new ticker in manager.transaction; for a capped
  // user it first counts what they created in the last 24 hours.
  manager: {
    query: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn((ticker: any) => tickerRepoStub.save(ticker)),
    transaction: jest.fn((cb: (m: any) => Promise<unknown>) =>
      cb(tickerRepoStub.manager),
    ),
  } as any,
};
const finnhubStub = { getCompanyProfile: jest.fn() };
const yahooStub = { getSummary: jest.fn(), getQuote: jest.fn() };
const jobsStub = { initializeTicker: jest.fn(), queueRequest: jest.fn() };
const tickersService = new TickersService(
  tickerRepoStub,
  {} as any, // logoRepo
  {} as any, // ohlcvRepo
  {} as any, // requestRepo
  finnhubStub as any,
  yahooStub as any,
  jobsStub as any,
  {} as any, // httpService
  { get: () => undefined } as any, // configService (default daily cap: 10)
);
tickersService.searchTickers = mockTickers.searchTickers as any;
const mockCurrency = {
  // Returns null for the sentinel target to exercise the "unavailable" path.
  getRate: jest.fn((_from: string, to: string) =>
    Promise.resolve(to === 'XXX' ? null : 0.9),
  ),
};
const mockRisk = {
  getLatestScore: jest.fn((symbol: string) =>
    Promise.resolve({ symbol, score: 7 }),
  ),
  getScoreHistory: jest.fn((symbol: string) =>
    Promise.resolve([{ symbol, score: 7 }]),
  ),
};
const mockResearch = {
  createResearchTicket: jest.fn(() =>
    Promise.resolve({ id: '42', status: 'pending' }),
  ),
  deleteResearchNote: jest.fn(() => Promise.resolve(undefined)),
  processTicket: jest.fn(() => Promise.resolve(undefined)),
  getResearchNote: jest.fn((id: string) =>
    Promise.resolve({
      id,
      user_id: 'user-1',
      status: 'completed',
      answer_markdown: 'hi',
    }),
  ),
  findAll: jest.fn(() =>
    Promise.resolve({ data: [], total: 0, page: 1, limit: 10 }),
  ),
  getNewsSummary: jest.fn((symbol: string) =>
    Promise.resolve({ symbol, summary: 's' }),
  ),
};
const mockCredit = {
  getResearchCost: jest.fn(() => 5),
  deductCredits,
};
const mockPortfolio = {
  findAll: jest.fn((userId: string) =>
    Promise.resolve([{ userId, symbol: 'AAPL' }]),
  ),
  create: jest.fn((_userId: string, dto: any) =>
    Promise.resolve({ id: 'p1', ...dto }),
  ),
  remove: jest.fn(() => Promise.resolve(undefined)),
  analyzePortfolio: jest.fn(() => Promise.resolve('# Analysis\nLooks good.')),
  getQuickRecommendation: jest.fn(() => Promise.resolve({ action: 'hold' })),
  sell: jest.fn((_userId: string, id: string, dto: any) =>
    Promise.resolve({
      position: { id, symbol: 'AAPL', shares: 5 },
      trade: { id: 't1', side: 'sell', symbol: 'AAPL', ...dto },
      proceeds: 750,
      realized_pnl: 250,
      cash_balance: { currency: 'USD', amount: 750 },
    }),
  ),
  getCashBalances: jest.fn(() =>
    Promise.resolve([{ currency: 'USD', amount: 1000 }]),
  ),
  depositCash: jest.fn((_userId: string, dto: any) =>
    Promise.resolve({ currency: dto.currency || 'USD', amount: dto.amount }),
  ),
  withdrawCash: jest.fn((_userId: string, dto: any) =>
    Promise.resolve({ currency: dto.currency || 'USD', amount: 0 }),
  ),
  getTrades: jest.fn(() =>
    Promise.resolve([{ id: 't1', symbol: 'AAPL', side: 'buy', shares: 5 }]),
  ),
  getPortfolioSummary: jest.fn(() =>
    Promise.resolve({
      currency: 'USD',
      holdings_value: 1500,
      cash_value: 1000,
      net_worth: 2500,
      positions_count: 1,
      cash_balances: [{ currency: 'USD', amount: 1000 }],
    }),
  ),
  recordTrade: jest.fn((_userId: string, dto: any) =>
    Promise.resolve({
      trade: { id: 't2', ...dto },
      idempotent: false,
    }),
  ),
};
const mockWatchlist = {
  getUserWatchlists: jest.fn(() =>
    Promise.resolve([{ id: '1', name: 'Default', items: [] }]),
  ),
  createWatchlist: jest.fn((_userId: string, name: string) =>
    Promise.resolve({
      id: '2',
      name,
      items: [],
    }),
  ),
  addTickerToWatchlist: jest.fn(() =>
    Promise.resolve({ id: '9', ticker_id: 't1' }),
  ),
};
const mockPriceAlerts = {
  findAllForUser: jest.fn(() =>
    Promise.resolve([{ id: 'a1', symbol: 'AAPL' }]),
  ),
  create: jest.fn((_userId: string, dto: any) =>
    Promise.resolve({ id: 'a2', ...dto }),
  ),
  deleteAlert: jest.fn(() => Promise.resolve(undefined)),
};
const mockTickerRequests = {
  createRequest: jest.fn((userId: string, symbol: string) =>
    Promise.resolve({ id: 'r1', user_id: userId, symbol, status: 'PENDING' }),
  ),
  adminAddTicker: jest.fn((userId: string, symbol: string) =>
    Promise.resolve({ id: 'r2', user_id: userId, symbol, status: 'APPROVED' }),
  ),
  getRequests: jest.fn(() =>
    Promise.resolve([
      { id: 'r1', symbol: 'ELXA.F', status: 'PENDING', user_id: 'u1' },
      { id: 'r2', symbol: 'AAPL', status: 'APPROVED', user_id: 'u2' },
    ]),
  ),
  approveRequest: jest.fn((id: string) =>
    Promise.resolve({ id, symbol: 'ELXA.F', status: 'APPROVED' }),
  ),
  rejectRequest: jest.fn((id: string) =>
    Promise.resolve({ id, symbol: 'ELXA.F', status: 'REJECTED' }),
  ),
};

@Module({
  imports: [
    McpModule.forRoot({
      name: 'neural-ticker',
      version: '0.6.0',
      transport: McpTransportType.STREAMABLE_HTTP,
      mcpEndpoint: 'mcp',
      guards: [TestAuthGuard],
      streamableHttp: {
        statelessMode: true,
        enableJsonResponse: true,
        sessionIdGenerator: undefined,
      },
    }),
  ],
  providers: [
    MarketDataTools,
    RiskTools,
    ResearchTools,
    PortfolioTools,
    TickerRequestsTools,
    { provide: MarketDataService, useValue: mockMarketData },
    { provide: MarketStatusService, useValue: mockMarketStatus },
    { provide: TickersService, useValue: tickersService },
    { provide: CurrencyService, useValue: mockCurrency },
    { provide: RiskRewardService, useValue: mockRisk },
    { provide: ResearchService, useValue: mockResearch },
    { provide: CreditService, useValue: mockCredit },
    { provide: PortfolioService, useValue: mockPortfolio },
    { provide: WatchlistService, useValue: mockWatchlist },
    { provide: PriceAlertsService, useValue: mockPriceAlerts },
    { provide: TickerRequestsService, useValue: mockTickerRequests },
    // Registered globally by TickersModule in the real app: carries the
    // caller of an MCP request down to TickersService.ensureTicker.
    { provide: APP_INTERCEPTOR, useClass: RequestActorInterceptor },
  ],
})
class McpTestModule {}

const EXPECTED_TOOLS = [
  // market data
  'get_ticker_snapshot',
  'get_ticker_snapshots',
  'get_ticker_history',
  'get_quote',
  'search_tickers',
  'get_company_news',
  'get_general_news',
  'get_market_status',
  // currency
  'convert_currency',
  // risk
  'get_risk_score',
  'get_risk_score_history',
  // research
  'create_research',
  'get_research',
  'list_research',
  'get_news_summary',
  // portfolio
  'get_portfolio',
  'add_portfolio_position',
  'remove_portfolio_position',
  'analyze_portfolio',
  'get_portfolio_recommendation',
  // trading simulator (sell, cash, trade history, consolidation)
  'sell_portfolio_position',
  'get_cash_balances',
  'deposit_cash',
  'withdraw_cash',
  'get_trade_history',
  'get_portfolio_summary',
  'record_trade',
  // watchlist
  'get_watchlists',
  'create_watchlist',
  'add_to_watchlist',
  // alerts
  'get_price_alerts',
  'create_price_alert',
  'delete_price_alert',
  // ticker requests (community request + admin approve/add)
  'request_ticker',
  'add_ticker',
  'list_ticker_requests',
  'approve_ticker_request',
  'reject_ticker_request',
];

describe('MCP endpoint (e2e, mocked services)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [McpTestModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api'); // match main.ts -> POST /api/mcp
    await app.init();
    // Bind once, on loopback. Left unbound, supertest does a wildcard
    // listen(0) per request, and macOS hands out ephemeral ports that another
    // local app already holds on 127.0.0.1 — the request then reaches that app
    // instead of this server (hang / "Parse Error: Expected HTTP/").
    await app.listen(0, '127.0.0.1');
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  /** POST a JSON-RPC message and return the parsed response (JSON or SSE). */
  async function rpc(body: any, headers: Record<string, string> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set(headers)
      .send(body);
    if (res.body && Object.keys(res.body).length > 0) return res.body;
    const text: string = res.text || '';
    const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
    if (dataLine) return JSON.parse(dataLine.slice(5).trim());
    return text ? JSON.parse(text) : {};
  }

  function call(name: string, args: any, headers?: Record<string, string>) {
    return rpc(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      },
      headers,
    );
  }

  it('lists all tools anonymously', async () => {
    const res = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    const names: string[] = (res.result?.tools ?? []).map((t: any) => t.name);
    for (const expected of EXPECTED_TOOLS) {
      expect(names).toContain(expected);
    }
    expect(names).toHaveLength(EXPECTED_TOOLS.length);
  });

  it('serves a public tool anonymously and upper-cases the symbol', async () => {
    const res = await call('get_ticker_snapshot', { symbol: 'aapl' });
    expect(res.result?.isError).toBeFalsy();
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload.symbol).toBe('AAPL');
    expect(mockMarketData.getSnapshot).toHaveBeenCalledWith('AAPL');
  });

  // An untracked symbol resolved through the snapshot / history / news path
  // makes the platform ask its data providers, INSERT the ticker and start its
  // initialisation (history sync + an LLM research run). An anonymous MCP
  // caller must never trigger that. The two risk-score tools are in the same
  // position: RiskRewardService resolves their symbol through getSnapshot().
  describe('anonymous market-data and risk tools never create a ticker', () => {
    const asUser = { 'x-test-user-id': 'user-1' };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    const expectNothingCreated = () => {
      expect(finnhubStub.getCompanyProfile).not.toHaveBeenCalled();
      expect(yahooStub.getSummary).not.toHaveBeenCalled();
      expect(yahooStub.getQuote).not.toHaveBeenCalled();
      expect(tickerRepoStub.save).not.toHaveBeenCalled();
      expect(jobsStub.initializeTicker).not.toHaveBeenCalled();
      expect(jobsStub.queueRequest).not.toHaveBeenCalled();
    };

    const SINGLE_SYMBOL_TOOLS: [string, Record<string, unknown>, jest.Mock][] =
      [
        ['get_ticker_snapshot', {}, mockMarketData.getSnapshot],
        [
          'get_ticker_history',
          { from: '2026-01-01', to: '2026-02-01' },
          mockMarketData.getHistory,
        ],
        ['get_company_news', {}, mockMarketData.getCompanyNews],
        ['get_risk_score', {}, mockRisk.getLatestScore],
        ['get_risk_score_history', {}, mockRisk.getScoreHistory],
      ];

    describe.each(SINGLE_SYMBOL_TOOLS)('%s', (tool, extra, serviceCall) => {
      it('anonymous + untracked symbol → the "not found" tool error, and the creating read is never reached', async () => {
        const res = await call(tool, { symbol: 'nvda', ...extra });

        expect(res.result?.isError).toBe(true);
        expect(res.result.content[0].text).toContain('Ticker NVDA not found');
        expect(serviceCall).not.toHaveBeenCalled();
        expectNothingCreated();
      });

      it('anonymous + tracked symbol → served as before', async () => {
        const res = await call(tool, { symbol: 'aapl', ...extra });

        expect(res.result?.isError).toBeFalsy();
        expect(serviceCall).toHaveBeenCalledTimes(1);
        expect(serviceCall.mock.calls[0][0]).toBe('AAPL');
        expectNothingCreated();
      });

      it('anonymous + a tracked symbol that breaks the strict pattern (11 chars) → still served', async () => {
        const res = await call(tool, { symbol: 'RELIANCE.NS', ...extra });

        expect(res.result?.isError).toBeFalsy();
        expect(serviceCall.mock.calls[0][0]).toBe('RELIANCE.NS');
      });

      it('anonymous + untracked malformed symbol → a tool error, nothing looked up upstream', async () => {
        const res = await call(tool, { symbol: 'not a symbol!', ...extra });

        expect(res.result?.isError).toBe(true);
        expect(res.result.content[0].text).toContain(
          'Invalid ticker symbol format',
        );
        expect(serviceCall).not.toHaveBeenCalled();
        expectNothingCreated();
      });

      it('signed-in + untracked symbol → unchanged: the read (and with it creation) goes ahead, ungated', async () => {
        const res = await call(tool, { symbol: 'nvda', ...extra }, asUser);

        expect(res.result?.isError).toBeFalsy();
        expect(serviceCall).toHaveBeenCalledTimes(1);
        expect(serviceCall.mock.calls[0][0]).toBe('NVDA');
        // Not even the gate's lookup runs for a signed-in caller.
        expect(tickerRepoStub.count).not.toHaveBeenCalled();
      });
    });

    describe('get_ticker_snapshots (bulk)', () => {
      it('anonymous: tracked symbols are served, untracked ones come back as per-symbol not-found entries — and never reach the snapshot path', async () => {
        const res = await call('get_ticker_snapshots', {
          symbols: ['aapl', 'nvda', 'msft', 'zzzq', 'RELIANCE.NS'],
        });

        expect(res.result?.isError).toBeFalsy();
        const payload = JSON.parse(res.result.content[0].text);
        expect(payload).toEqual([
          { symbol: 'AAPL', price: 1 },
          { symbol: 'MSFT', price: 1 },
          { symbol: 'RELIANCE.NS', price: 1 },
          { symbol: 'NVDA', error: 'Ticker NVDA not found' },
          { symbol: 'ZZZQ', error: 'Ticker ZZZQ not found' },
        ]);
        // Only the tracked symbols were handed to the service that would
        // otherwise create the others.
        expect(mockMarketData.getSnapshots).toHaveBeenCalledTimes(1);
        expect(mockMarketData.getSnapshots).toHaveBeenCalledWith([
          'AAPL',
          'MSFT',
          'RELIANCE.NS',
        ]);
        // One lookup for the whole list.
        expect(tickerRepoStub.find).toHaveBeenCalledTimes(1);
        expectNothingCreated();
      });

      it('anonymous + only untracked symbols → all not-found, the snapshot path is not called at all', async () => {
        const res = await call('get_ticker_snapshots', {
          symbols: ['nvda', 'tsla'],
        });

        const payload = JSON.parse(res.result.content[0].text);
        expect(payload).toEqual([
          { symbol: 'NVDA', error: 'Ticker NVDA not found' },
          { symbol: 'TSLA', error: 'Ticker TSLA not found' },
        ]);
        expect(mockMarketData.getSnapshots).not.toHaveBeenCalled();
        expectNothingCreated();
      });

      it('signed-in → unchanged: every symbol goes to the snapshot path, ungated', async () => {
        const res = await call(
          'get_ticker_snapshots',
          { symbols: ['aapl', 'nvda'] },
          asUser,
        );

        const payload = JSON.parse(res.result.content[0].text);
        expect(payload).toEqual([
          { symbol: 'AAPL', price: 1 },
          { symbol: 'NVDA', price: 1 },
        ]);
        expect(mockMarketData.getSnapshots).toHaveBeenCalledWith([
          'AAPL',
          'NVDA',
        ]);
        expect(tickerRepoStub.find).not.toHaveBeenCalled();
      });
    });
  });

  // A signed-in MCP caller may create tickers by reading them, but only a
  // limited number a day. The caller reaches TickersService.ensureTicker —
  // several calls below the tool — through the global interceptor.
  describe('signed-in tools and the daily cap on NEW tickers', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      tickerRepoStub.findOne.mockResolvedValue(null); // not tracked
      finnhubStub.getCompanyProfile.mockResolvedValue({
        name: 'NVIDIA Corp',
        exchange: 'NASDAQ',
        currency: 'USD',
      });
      tickerRepoStub.save.mockImplementation((t: any) =>
        Promise.resolve({ id: '9', ...t }),
      );
      tickerRepoStub.findOneOrFail.mockResolvedValue({
        id: '9',
        symbol: 'NVDA',
      });
      // What the real MarketDataService does first: resolve the ticker.
      mockMarketData.getSnapshot.mockImplementationOnce(
        async (symbol: string) => ({
          symbol: (await tickersService.ensureTicker(symbol)).symbol,
          price: 1,
        }),
      );
    });

    it('under the limit: the ticker is created on behalf of the MCP user', async () => {
      tickerRepoStub.manager.count.mockResolvedValue(3);

      const res = await call(
        'get_ticker_snapshot',
        { symbol: 'nvda' },
        { 'x-test-user-id': 'user-1' },
      );

      expect(res.result?.isError).toBeFalsy();
      expect(tickerRepoStub.save).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'NVDA',
          created_by_user_id: 'user-1',
        }),
      );
      expect(tickerRepoStub.manager.count.mock.calls[0][1].where).toMatchObject(
        { created_by_user_id: 'user-1' },
      );
      expect(jobsStub.initializeTicker).toHaveBeenCalledWith('NVDA');
    });

    it('at the limit: a tool error that points to the request flow, and nothing is created', async () => {
      tickerRepoStub.manager.count.mockResolvedValue(10);

      const res = await call(
        'get_ticker_snapshot',
        { symbol: 'nvda' },
        { 'x-test-user-id': 'user-1' },
      );

      expect(res.result?.isError).toBe(true);
      expect(res.result.content[0].text).toContain(
        'You have reached the limit of 10 new tickers per day',
      );
      expect(res.result.content[0].text).toContain('submit a ticker request');
      expect(finnhubStub.getCompanyProfile).not.toHaveBeenCalled();
      expect(tickerRepoStub.save).not.toHaveBeenCalled();
      expect(jobsStub.initializeTicker).not.toHaveBeenCalled();
    });

    it('an admin is not capped', async () => {
      tickerRepoStub.manager.count.mockResolvedValue(999);

      const res = await call(
        'get_ticker_snapshot',
        { symbol: 'nvda' },
        { 'x-test-user-id': 'admin-1', 'x-test-user-role': 'admin' },
      );

      expect(res.result?.isError).toBeFalsy();
      expect(tickerRepoStub.manager.count).not.toHaveBeenCalled();
      expect(tickerRepoStub.save).toHaveBeenCalledWith(
        expect.objectContaining({ created_by_user_id: 'admin-1' }),
      );
    });
  });

  it('returns an error result when a currency rate is unavailable', async () => {
    const res = await call('convert_currency', {
      amount: 10,
      from: 'usd',
      to: 'xxx',
    });
    expect(res.result?.isError).toBe(true);
    expect(res.result.content[0].text.toLowerCase()).toContain('unavailable');
  });

  it('rejects a user-scoped tool when anonymous', async () => {
    const res = await call('get_portfolio', {});
    expect(res.result?.isError).toBe(true);
    expect(res.result.content[0].text).toContain('Authentication required');
  });

  it('allows a user-scoped tool when a user is present', async () => {
    const res = await call('get_portfolio', {}, { 'x-test-user-id': 'user-1' });
    expect(res.result?.isError).toBeFalsy();
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload[0].userId).toBe('user-1');
    expect(mockPortfolio.findAll).toHaveBeenCalledWith('user-1', undefined);
  });

  it('sells a position via the trading-simulator tool', async () => {
    const res = await call(
      'sell_portfolio_position',
      { id: 'p1', shares: 5, price: 150 },
      { 'x-test-user-id': 'user-1' },
    );
    expect(res.result?.isError).toBeFalsy();
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload.proceeds).toBe(750);
    expect(payload.realized_pnl).toBe(250);
    expect(mockPortfolio.sell).toHaveBeenCalledWith(
      'user-1',
      'p1',
      expect.objectContaining({ shares: 5, price: 150 }),
    );
  });

  it('records an external trade for consolidation and upper-cases the symbol', async () => {
    const res = await call(
      'record_trade',
      {
        symbol: 'aapl',
        side: 'buy',
        shares: 3,
        price: 100,
        trade_date: '2026-06-21',
        external_id: 'robinhood:abc',
      },
      { 'x-test-user-id': 'user-1' },
    );
    expect(res.result?.isError).toBeFalsy();
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload.idempotent).toBe(false);
    expect(mockPortfolio.recordTrade).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ symbol: 'AAPL', external_id: 'robinhood:abc' }),
    );
  });

  it('rejects trading-simulator tools when anonymous', async () => {
    const res = await call('get_cash_balances', {});
    expect(res.result?.isError).toBe(true);
    expect(res.result.content[0].text).toContain('Authentication required');
  });

  it('charges credits exactly once for create_research', async () => {
    deductCredits.mockClear();
    const res = await call(
      'create_research',
      { tickers: ['aapl'], question: 'outlook?' },
      { 'x-test-user-id': 'user-1', 'x-test-user-role': 'user' },
    );
    expect(res.result?.isError).toBeFalsy();
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload.ticket_id).toBe('42');
    expect(deductCredits).toHaveBeenCalledTimes(1);
    expect(deductCredits).toHaveBeenCalledWith(
      'user-1',
      5,
      'research_spend',
      expect.objectContaining({ research_id: '42', ticker: 'AAPL' }),
    );
  });

  it('does not charge credits for an admin create_research', async () => {
    deductCredits.mockClear();
    const res = await call(
      'create_research',
      { tickers: ['MSFT'], question: 'q' },
      { 'x-test-user-id': 'admin-1', 'x-test-user-role': 'admin' },
    );
    expect(res.result?.isError).toBeFalsy();
    expect(deductCredits).not.toHaveBeenCalled();
  });

  it('lets a user request a ticker, but rejects anonymous callers', async () => {
    const anon = await call('request_ticker', { symbol: 'ELXA.F' });
    expect(anon.result?.isError).toBe(true);
    expect(anon.result.content[0].text).toContain('Authentication required');

    const res = await call(
      'request_ticker',
      { symbol: 'elxa.f' },
      { 'x-test-user-id': 'user-1' },
    );
    expect(res.result?.isError).toBeFalsy();
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload.status).toBe('PENDING');
    expect(payload.symbol).toBe('ELXA.F');
    expect(mockTickerRequests.createRequest).toHaveBeenCalledWith(
      'user-1',
      'ELXA.F',
    );
  });

  it('gates admin ticker tools to admins', async () => {
    const addAsUser = await call(
      'add_ticker',
      { symbol: 'NVDA' },
      { 'x-test-user-id': 'user-1', 'x-test-user-role': 'user' },
    );
    expect(addAsUser.result?.isError).toBe(true);
    expect(addAsUser.result.content[0].text).toContain(
      'Admin privileges required',
    );

    const listAsUser = await call(
      'list_ticker_requests',
      {},
      { 'x-test-user-id': 'user-1', 'x-test-user-role': 'user' },
    );
    expect(listAsUser.result?.isError).toBe(true);
  });

  it('lets an admin add, approve and list ticker requests', async () => {
    const added = await call(
      'add_ticker',
      { symbol: 'nvda' },
      { 'x-test-user-id': 'admin-1', 'x-test-user-role': 'admin' },
    );
    expect(added.result?.isError).toBeFalsy();
    const addedPayload = JSON.parse(added.result.content[0].text);
    expect(addedPayload.status).toBe('APPROVED');
    expect(mockTickerRequests.adminAddTicker).toHaveBeenCalledWith(
      'admin-1',
      'NVDA',
    );

    const approved = await call(
      'approve_ticker_request',
      { request_id: '123e4567-e89b-12d3-a456-426614174000' },
      { 'x-test-user-id': 'admin-1', 'x-test-user-role': 'admin' },
    );
    expect(approved.result?.isError).toBeFalsy();
    expect(mockTickerRequests.approveRequest).toHaveBeenCalledWith(
      '123e4567-e89b-12d3-a456-426614174000',
    );

    const list = await call(
      'list_ticker_requests',
      { status: 'PENDING' },
      { 'x-test-user-id': 'admin-1', 'x-test-user-role': 'admin' },
    );
    expect(list.result?.isError).toBeFalsy();
    const listPayload = JSON.parse(list.result.content[0].text);
    expect(Array.isArray(listPayload)).toBe(true);
    expect(listPayload.every((r: any) => r.status === 'PENDING')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Global-guard carve-out
//
// In the real app two global APP_GUARDs (ThrottlerGuard, then JwtAuthGuard)
// fire on every route, including POST /api/mcp. The MCP module relies on
// `decorators: [Public()]` to stamp IS_PUBLIC_KEY on the mcp-nest controller
// class so the global JwtAuthGuard skips it (anonymous reach). This suite
// proves that carve-out end to end against the REAL JwtAuthGuard, with a
// normal protected route as a negative control.
// ---------------------------------------------------------------------------

/** A trivial passport 'jwt' strategy: no DB, echoes the token payload. */
@Injectable()
class TestJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: 'test-secret',
    });
  }
  validate(payload: any) {
    return { id: payload.sub, role: payload.role || 'user' };
  }
}

/** A minimal tool with no service deps. */
@Injectable()
class PingTools {
  @Tool({ name: 'ping', description: 'Health ping.', parameters: z.object({}) })
  ping() {
    return { content: [{ type: 'text' as const, text: 'pong' }] };
  }
}

/** A normal protected controller — proves the global guard is actually active. */
@Controller('secret')
class SecretController {
  @Get()
  get() {
    return { ok: true };
  }
}

@Module({
  imports: [
    PassportModule,
    McpModule.forRoot({
      name: 'neural-ticker',
      version: '0.6.0',
      transport: McpTransportType.STREAMABLE_HTTP,
      mcpEndpoint: 'mcp',
      decorators: [Public()], // the carve-out under test
      streamableHttp: {
        statelessMode: true,
        enableJsonResponse: true,
        sessionIdGenerator: undefined,
      },
    }),
  ],
  controllers: [SecretController],
  providers: [
    PingTools,
    TestJwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
class CarveOutTestModule {}

describe('MCP global-guard carve-out (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [CarveOutTestModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    // Loopback bind — see the note in the first beforeAll.
    await app.listen(0, '127.0.0.1');
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('enforces the global JwtAuthGuard on a normal route', async () => {
    await request(app.getHttpServer()).get('/api/secret').expect(401);
  });

  it('lets an anonymous caller reach the Public()-decorated MCP controller', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect(res.status).toBe(200);
    const body =
      res.body && Object.keys(res.body).length > 0
        ? res.body
        : JSON.parse(
            (
              res.text.split('\n').find((l) => l.startsWith('data:')) ||
              'data:{}'
            )
              .slice(5)
              .trim(),
          );
    const names: string[] = (body.result?.tools ?? []).map((t: any) => t.name);
    expect(names).toContain('ping');
  });
});

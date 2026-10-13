import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { TickersController } from './tickers.controller';
import { TickerDetailController } from './ticker-detail.controller';
import { TickersService } from './tickers.service';
import { TickerEntity } from './entities/ticker.entity';
import { TickerLogoEntity } from './entities/ticker-logo.entity';
import { TickerRequestEntity } from '../ticker-requests/entities/ticker-request.entity';
import { PriceOhlcv } from '../market-data/entities/price-ohlcv.entity';
import { MarketDataController } from '../market-data/market-data.controller';
import { MarketDataService } from '../market-data/market-data.service';
import { MarketStatusService } from '../market-data/market-status.service';
import { RiskRewardController } from '../risk-reward/risk-reward.controller';
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { RiskRewardScore } from '../risk-reward/entities/risk-reward-score.entity';
import { RiskAnalysis } from '../risk-reward/entities/risk-analysis.entity';
import { LlmService } from '../llm/llm.service';
import { ResearchService } from '../research/research.service';
import { FinnhubService } from '../finnhub/finnhub.service';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';
import { JobsService } from '../jobs/jobs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { UsersService } from '../users/users.service';
import { RequestActorInterceptor } from '../../common/request-actor/request-actor.interceptor';

/**
 * The public ticker read routes behind a real HTTP server with the real auth
 * stack (global JwtAuthGuard, JwtStrategy, OptionalJwtAuthGuard) and the REAL
 * TickersService — so the path "unknown symbol → ask the providers → insert
 * the ticker → start its initialisation (history + LLM research)" is the
 * production code. Only the repositories, the data providers and the jobs
 * service are mocked; the market-data reads resolve their ticker through
 * TickersService.ensureTicker exactly like the real MarketDataService does.
 * RiskRewardService is the real one too: its two reads resolve the symbol
 * through MarketDataService.getSnapshot, i.e. through the same creating path.
 */
describe('Public ticker read routes (HTTP: anonymous callers never create a ticker)', () => {
  const SECRET = 'test-only-secret';
  let app: INestApplication;
  let tickersService: TickersService;

  // The "universe": symbols we track.
  const tracked = new Map<string, any>();

  // The row as a read returns it: the creator column is `select: false`.
  const publicRow = (row: any) => {
    if (!row) return null;
    const { created_by_user_id: _creator, ...rest } = row;
    return rest;
  };
  // The insert runs in manager.transaction — for a capped user: advisory
  // lock, count of their creations in the last 24 hours, then the insert.
  const manager: any = {
    query: jest.fn().mockResolvedValue([]),
    count: jest.fn((_entity: unknown, { where }: any) =>
      Promise.resolve(
        [...tracked.values()].filter(
          (row) => row.created_by_user_id === where.created_by_user_id,
        ).length,
      ),
    ),
    save: jest.fn((ticker: any) => tickerRepo.save(ticker)),
    transaction: jest.fn((cb: (m: any) => Promise<unknown>) => cb(manager)),
  };
  const tickerRepo: any = {
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(publicRow(tracked.get(where.symbol))),
    ),
    findOneOrFail: jest.fn(({ where }: any) =>
      Promise.resolve(publicRow(tracked.get(where.symbol))),
    ),
    count: jest.fn(({ where }: any) =>
      Promise.resolve(tracked.has(where.symbol) ? 1 : 0),
    ),
    create: jest.fn((dto: any) => ({ ...dto })),
    save: jest.fn((ticker: any) => {
      const saved = { id: String(tracked.size + 1), ...ticker };
      tracked.set(saved.symbol, saved);
      return Promise.resolve(saved);
    }),
    manager,
  };
  const finnhub = { getCompanyProfile: jest.fn() };
  const yahoo = { getSummary: jest.fn(), getQuote: jest.fn() };
  const jobs = { initializeTicker: jest.fn(), queueRequest: jest.fn() };
  const users = { findById: jest.fn() };
  // No analysis on record for anyone — the routes answer with an empty body.
  const analysisRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
  };

  // What the real MarketDataService does first in each of these reads.
  const marketData = {
    assertPublicReadAllowed: (symbol: string, isSignedIn: boolean) =>
      tickersService.assertPublicReadAllowed(symbol, isSignedIn),
    getSnapshot: jest.fn(async (symbol: string) => ({
      ticker: await tickersService.awaitEnsureTicker(symbol),
      latestPrice: null,
      fundamentals: null,
    })),
    getCompanyNews: jest.fn(async (symbol: string) => {
      await tickersService.awaitEnsureTicker(symbol);
      return [];
    }),
    getHistory: jest.fn(async (symbol: string) => {
      await tickersService.getTicker(symbol);
      return [];
    }),
    getAnalystRatings: jest.fn(async (symbol: string) => {
      await tickersService.getTicker(symbol);
      return [];
    }),
  };

  const tokenFor = (userId: string) =>
    new JwtService({ secret: SECRET }).sign({ sub: userId });
  const asUser = { Authorization: `Bearer ${tokenFor('user-1')}` };

  const ROUTES = [
    ['GET /v1/tickers/:symbol', (s: string) => `/v1/tickers/${s}`],
    [
      'GET /v1/tickers/:symbol/composite',
      (s: string) => `/v1/tickers/${s}/composite`,
    ],
    [
      'GET /v1/tickers/:symbol/snapshot',
      (s: string) => `/v1/tickers/${s}/snapshot`,
    ],
    ['GET /v1/tickers/:symbol/news', (s: string) => `/v1/tickers/${s}/news`],
    [
      'GET /v1/tickers/:symbol/history',
      (s: string) => `/v1/tickers/${s}/history`,
    ],
    [
      'GET /v1/tickers/:symbol/risk-reward',
      (s: string) => `/v1/tickers/${s}/risk-reward`,
    ],
    [
      'GET /v1/tickers/:symbol/risk-reward?history=true',
      (s: string) => `/v1/tickers/${s}/risk-reward?history=true`,
    ],
  ] as const;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [
        TickersController,
        TickerDetailController,
        MarketDataController,
        RiskRewardController,
      ],
      providers: [
        TickersService,
        { provide: getRepositoryToken(TickerEntity), useValue: tickerRepo },
        { provide: getRepositoryToken(TickerLogoEntity), useValue: {} },
        { provide: getRepositoryToken(PriceOhlcv), useValue: {} },
        { provide: getRepositoryToken(TickerRequestEntity), useValue: {} },
        { provide: FinnhubService, useValue: finnhub },
        { provide: YahooFinanceService, useValue: yahoo },
        { provide: JobsService, useValue: jobs },
        { provide: HttpService, useValue: {} },
        { provide: MarketDataService, useValue: marketData },
        { provide: MarketStatusService, useValue: {} },
        RiskRewardService,
        { provide: getRepositoryToken(RiskRewardScore), useValue: {} },
        { provide: getRepositoryToken(RiskAnalysis), useValue: analysisRepo },
        { provide: LlmService, useValue: {} },
        {
          provide: ResearchService,
          useValue: {
            getLatestNoteForTicker: jest.fn().mockResolvedValue(null),
          },
        },
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'JWT_SECRET' ? SECRET : undefined),
          },
        },
        { provide: UsersService, useValue: users },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        // As registered globally by TickersModule: tells ensureTicker which
        // user a request acts for (the daily cap on new tickers).
        { provide: APP_INTERCEPTOR, useClass: RequestActorInterceptor },
      ],
    }).compile();

    tickersService = module.get(TickersService);
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    // Bind once, on loopback. Left unbound, supertest does a wildcard
    // listen(0) per request, and macOS hands out ephemeral ports that another
    // local app already holds on 127.0.0.1 — the request then reaches that app
    // instead of this server (hang / "Parse Error: Expected HTTP/").
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tracked.clear();
    tracked.set('AAPL', { id: '1', symbol: 'AAPL', name: 'Apple Inc' });
    // The providers DO know NVDA — the worst case for the gate.
    finnhub.getCompanyProfile.mockResolvedValue({
      name: 'NVIDIA Corp',
      exchange: 'NASDAQ NMS - GLOBAL MARKET',
      currency: 'USD',
    });
    users.findById.mockImplementation((id: string) =>
      Promise.resolve(
        {
          'user-1': { id: 'user-1', role: 'user' },
          'user-2': { id: 'user-2', role: 'user' },
          'admin-1': { id: 'admin-1', role: 'admin' },
          'banned-1': { id: 'banned-1', role: 'revoked' },
        }[id] ?? null,
      ),
    );
  });

  const http = () => request(app.getHttpServer());

  const expectNothingCreated = () => {
    expect(finnhub.getCompanyProfile).not.toHaveBeenCalled();
    expect(yahoo.getSummary).not.toHaveBeenCalled();
    expect(yahoo.getQuote).not.toHaveBeenCalled();
    expect(tickerRepo.save).not.toHaveBeenCalled();
    expect(jobs.initializeTicker).not.toHaveBeenCalled();
    expect(jobs.queueRequest).not.toHaveBeenCalled();
    expect(tracked.has('NVDA')).toBe(false);
  };

  describe.each(ROUTES)('%s', (_name, path) => {
    it('ANONYMOUS + a symbol we do not track → 404; no provider call, no insert, no job, no LLM', async () => {
      const res = await http().get(path('NVDA')).expect(404);

      expect(res.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'Ticker NVDA not found',
      });
      expectNothingCreated();
    });

    it('the 404 does not depend on whether a provider knows the symbol', async () => {
      const known = await http().get(path('NVDA')).expect(404);
      finnhub.getCompanyProfile.mockResolvedValue({});
      const unknown = await http().get(path('ZZZZZZ')).expect(404);

      expect({ ...known.body, message: '' }).toEqual({
        ...unknown.body,
        message: '',
      });
      expectNothingCreated();
    });

    it.each([
      ['a garbage token', 'Bearer not-a-jwt'],
      ['a banned user', `Bearer ${tokenFor('banned-1')}`],
      ['a deleted user', `Bearer ${tokenFor('ghost')}`],
    ])('%s is anonymous too: 404, nothing created', async (_l, header) => {
      await http().get(path('NVDA')).set('Authorization', header).expect(404);
      expectNothingCreated();
    });

    it('ANONYMOUS + a tracked symbol → served as before (and nothing is created)', async () => {
      await http().get(path('AAPL')).expect(200);
      await http().get(path('aapl')).expect(200);

      expectNothingCreated();
    });

    it('SIGNED-IN + a symbol we do not track → unchanged: the ticker is created and initialised', async () => {
      await http().get(path('NVDA')).set(asUser).expect(200);

      expect(finnhub.getCompanyProfile).toHaveBeenCalledWith('NVDA');
      expect(tickerRepo.save).toHaveBeenCalledTimes(1);
      expect(jobs.initializeTicker).toHaveBeenCalledWith('NVDA');
      expect(tracked.has('NVDA')).toBe(true);

      // ...after which an anonymous caller can read it like any other.
      await http().get(path('NVDA')).expect(200);
      expect(tickerRepo.save).toHaveBeenCalledTimes(1);
    });

    it('signs a caller in from the session cookie as well', async () => {
      await http()
        .get(path('NVDA'))
        .set('Cookie', `authentication=${tokenFor('user-1')}`)
        .expect(200);
      expect(tracked.has('NVDA')).toBe(true);
    });

    it.each([
      ['longer than 10 characters', 'ABCDEFGHIJK'],
      ['a space', 'AA%20PL'],
      ['a caret', '%5EGSPC'],
      ['a quote', "AAPL'--"],
      ['an ampersand', 'M%26M.NS'],
    ])(
      'an UNTRACKED malformed symbol (%s) is a 400 for anonymous AND signed-in callers; no provider call, nothing created',
      async (_l, symbol) => {
        const anonymous = await http().get(path(symbol)).expect(400);
        await http().get(path(symbol)).set(asUser).expect(400);

        expect(anonymous.body.message).toBe('Invalid ticker symbol format');
        expectNothingCreated();
      },
    );

    it('a string that cannot be a symbol (33+ characters) is a 400 without any lookup', async () => {
      const symbol = 'A'.repeat(33);

      await http().get(path(symbol)).expect(400);
      await http().get(path(symbol)).set(asUser).expect(400);

      expect(tickerRepo.count).not.toHaveBeenCalled();
      expect(tickerRepo.findOne).not.toHaveBeenCalled();
      expectNothingCreated();
    });

    // A NUL byte cannot be sent to PostgreSQL as text: the gate's own lookup
    // failed and the route answered 500 (found by test/db/public-gate.db-spec).
    it('a symbol with a NUL byte is a 400 without any lookup, not a 500', async () => {
      await http().get(path('AA%00PL')).expect(400);
      await http().get(path('AA%00PL')).set(asUser).expect(400);

      expect(tickerRepo.count).not.toHaveBeenCalled();
      expect(tickerRepo.findOne).not.toHaveBeenCalled();
      expectNothingCreated();
    });

    // The format rule guards creation — it must never lock out a listing we
    // already track.
    it.each([
      ['an 11-character symbol', 'RELIANCE.NS', 'RELIANCE.NS'],
      ['a symbol containing ^', '^GSPC', '%5EGSPC'],
    ])(
      'a TRACKED ticker with %s is served to an anonymous and to a signed-in caller',
      async (_l, symbol, urlSymbol) => {
        tracked.set(symbol, { id: '9', symbol, name: symbol });

        await http().get(path(urlSymbol)).expect(200);
        await http().get(path(urlSymbol)).set(asUser).expect(200);

        expectNothingCreated();
      },
    );
  });

  // A signed-in user may still create tickers by reading them — but only a
  // limited number per day. The whole chain is real here: JWT → global
  // interceptor → AsyncLocalStorage → TickersService.ensureTicker.
  describe('per-user daily cap on NEW tickers (signed-in, non-admin)', () => {
    const asUser2 = { Authorization: `Bearer ${tokenFor('user-2')}` };
    const asAdmin = { Authorization: `Bearer ${tokenFor('admin-1')}` };
    const symbols = (n: number, prefix = 'T') =>
      Array.from({ length: n }, (_, i) => `${prefix}${i}`);

    it('records the signed-in user as the creator — and never returns it', async () => {
      const res = await http().get('/v1/tickers/NVDA').set(asUser).expect(200);

      expect(tracked.get('NVDA').created_by_user_id).toBe('user-1');
      expect(res.body).not.toHaveProperty('created_by_user_id');
      expect(res.body.symbol).toBe('NVDA');
    });

    describe.each(ROUTES)('%s', (_name, path) => {
      it('the 11th new ticker of the day is a 429 that points to the request flow; nothing is created', async () => {
        for (const symbol of symbols(10)) {
          await http().get(path(symbol)).set(asUser).expect(200);
        }
        jest.clearAllMocks();

        const res = await http().get(path('NVDA')).set(asUser).expect(429);

        expect(res.body).toEqual({
          statusCode: 429,
          error: 'Too Many Requests',
          message:
            'You have reached the limit of 10 new tickers per day. Tickers ' +
            'already on the platform are not affected. To get another one ' +
            'added, submit a ticker request instead.',
        });
        expectNothingCreated();
      });
    });

    it('at the cap the user still reads every tracked ticker, including the ones they added', async () => {
      for (const symbol of symbols(10)) {
        await http().get(`/v1/tickers/${symbol}`).set(asUser).expect(200);
      }

      await http().get('/v1/tickers/AAPL').set(asUser).expect(200);
      await http().get('/v1/tickers/T3/composite').set(asUser).expect(200);
      await http().get('/v1/tickers/NVDA').set(asUser).expect(429);
    });

    it('the cap is per user', async () => {
      for (const symbol of symbols(10)) {
        await http().get(`/v1/tickers/${symbol}`).set(asUser).expect(200);
      }

      await http().get('/v1/tickers/NVDA').set(asUser2).expect(200);
      expect(tracked.get('NVDA').created_by_user_id).toBe('user-2');
    });

    it('admins are not capped', async () => {
      for (const symbol of symbols(12, 'A')) {
        await http().get(`/v1/tickers/${symbol}`).set(asAdmin).expect(200);
      }
      expect(tracked.get('A11').created_by_user_id).toBe('admin-1');
    });
  });

  // No first-party client calls these as a regular user: they are admin-only.
  describe.each([
    ['POST /v1/tickers/:symbol', () => http().post('/v1/tickers/NVDA')],
    [
      'POST /v1/tickers (body)',
      () => http().post('/v1/tickers').send({ symbol: 'NVDA' }),
    ],
  ])('%s is admin-only', (_name, post) => {
    it('anonymous → 401, nothing created', async () => {
      await post().expect(401);
      expectNothingCreated();
    });

    it('a signed-in non-admin → 403, nothing created', async () => {
      await post().set(asUser).expect(403);
      expectNothingCreated();
    });

    it('an admin → 201 and the ticker is created', async () => {
      const res = await post()
        .set({ Authorization: `Bearer ${tokenFor('admin-1')}` })
        .expect(201);

      expect(res.body.symbol).toBe('NVDA');
      expect(tracked.get('NVDA').created_by_user_id).toBe('admin-1');
      expect(jobs.initializeTicker).toHaveBeenCalledWith('NVDA');
    });
  });

  it('GET /v1/tickers/:symbol/news does not turn the 404 / 400 into an empty list', async () => {
    const notFound = await http().get('/v1/tickers/NVDA/news').expect(404);
    expect(notFound.body).not.toEqual([]);
    await http().get('/v1/tickers/ABCDEFGHIJK/news').expect(400);
  });

  it('routes that share the prefix are untouched (count, sectors, logo)', async () => {
    (tickersService as any).getCount = jest.fn().mockResolvedValue(42);
    await http().get('/v1/tickers/count').expect(200);
    expect(tickerRepo.count).not.toHaveBeenCalledWith({
      where: { symbol: 'COUNT' },
    });
  });
});

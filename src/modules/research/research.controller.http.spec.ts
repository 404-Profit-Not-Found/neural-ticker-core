import { LlmUnavailableException } from '../llm/llm-unavailable.exception';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { MarketDataService } from '../market-data/market-data.service';
import { CreditService } from '../users/credit.service';
import { TickersService } from '../tickers/tickers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreditGuard } from './guards/credit.guard';

/**
 * The controller behind a real HTTP server with the SAME global
 * ValidationPipe as main.ts, so route params and bodies go through the pipes
 * and DTOs exactly as in production. Services are mocked (no database).
 */
describe('ResearchController (HTTP: param + body validation)', () => {
  let app: INestApplication;

  const research = {
    getResearchNote: jest.fn(),
    deleteResearchNote: jest.fn(),
    updateTitle: jest.fn(),
    generatePublicSignature: jest.fn().mockReturnValue('sig'),
    createManualNote: jest.fn(),
    contribute: jest.fn(),
    getNewsSummary: jest.fn(),
  };

  const asUser = {
    canActivate: (context: any) => {
      context.switchToHttp().getRequest().user = { id: 'user-1', role: 'user' };
      return true;
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ResearchController],
      providers: [
        { provide: ResearchService, useValue: research },
        { provide: MarketDataService, useValue: {} },
        { provide: CreditService, useValue: {} },
        { provide: TickersService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(asUser)
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    // Mirrors src/main.ts.
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
    research.getResearchNote.mockResolvedValue({
      id: '12',
      user_id: 'user-1',
      title: 'T',
    });
    research.updateTitle.mockImplementation((id, _u, title) => ({ id, title }));
    research.createManualNote.mockImplementation((_u, tickers, title) => ({
      id: '1',
      tickers,
      title,
    }));
    research.contribute.mockImplementation((_u, tickers) => ({
      id: '1',
      tickers,
    }));
  });

  const http = () => request(app.getHttpServer());

  describe('a non-numeric :id is a 400, and never reaches the service (was a Postgres error → 500)', () => {
    const BAD_IDS = ['abc', '1.5', '-1', '12abc', '9999999999999999999'];

    it.each(BAD_IDS)('GET /v1/research/%s', async (id) => {
      await http().get(`/v1/research/${id}`).expect(400);
      expect(research.getResearchNote).not.toHaveBeenCalled();
    });

    it.each(BAD_IDS)('DELETE /v1/research/%s', async (id) => {
      await http().delete(`/v1/research/${id}`).expect(400);
      expect(research.deleteResearchNote).not.toHaveBeenCalled();
    });

    it.each(BAD_IDS)('POST /v1/research/%s/title', async (id) => {
      await http()
        .post(`/v1/research/${id}/title`)
        .send({ title: 'ok' })
        .expect(400);
      expect(research.updateTitle).not.toHaveBeenCalled();
    });

    it.each(BAD_IDS)('GET /v1/research/%s/share-link', async (id) => {
      await http().get(`/v1/research/${id}/share-link`).expect(400);
      expect(research.getResearchNote).not.toHaveBeenCalled();
    });

    it('still serves a numeric id, passed on as a string', async () => {
      await http().get('/v1/research/12').expect(200);
      expect(research.getResearchNote).toHaveBeenCalledWith('12');

      await http().delete('/v1/research/12').expect(200);
      expect(research.deleteResearchNote).toHaveBeenCalledWith('12', 'user-1');

      await http().get('/v1/research/12/share-link').expect(200);
    });

    it('does not swallow the literal routes that share the prefix', async () => {
      // "news-summary" is not numeric, but it is its own route — not `:id`.
      const res = await http().get('/v1/research/news-summary/AAPL');
      expect(res.status).not.toBe(400);
    });
  });

  // An action that needs an LLM answer when none can be had: what the client
  // receives, over real HTTP. (Was a bare 500 "Internal server error".)
  describe('GET /v1/research/news-summary/:symbol when the LLM is unavailable', () => {
    it.each(['not_configured', 'quota_exhausted', 'provider_error'] as const)(
      '%s → 503 with the stable message and code, and nothing else',
      async (reason) => {
        research.getNewsSummary.mockRejectedValue(
          new LlmUnavailableException(reason),
        );

        const res = await http()
          .get('/v1/research/news-summary/AAPL')
          .expect(503);

        expect(res.body).toEqual({
          statusCode: 503,
          error: 'Service Unavailable',
          message:
            'AI analysis is temporarily unavailable. Please try again later.',
          code: 'LLM_UNAVAILABLE',
        });
      },
    );

    it('a genuine bug is still a 500', async () => {
      research.getNewsSummary.mockRejectedValue(new TypeError('boom'));

      const res = await http()
        .get('/v1/research/news-summary/AAPL')
        .expect(500);

      expect(res.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
    });
  });

  describe('POST /v1/research/:id/title', () => {
    it('trims and passes the title on', async () => {
      await http()
        .post('/v1/research/5/title')
        .send({ title: '  NVDA: still accelerating  ' })
        .expect(201);

      expect(research.updateTitle).toHaveBeenCalledWith(
        '5',
        'user-1',
        'NVDA: still accelerating',
      );
    });

    it.each([
      ['missing', {}],
      ['null', { title: null }],
      ['not a string', { title: 42 }],
      ['an object', { title: { $ne: '' } }],
      ['empty', { title: '' }],
      ['only whitespace', { title: '   ' }],
      ['longer than 200 characters', { title: 'x'.repeat(201) }],
      ['sent with an unknown property', { title: 'ok', status: 'failed' }],
    ])('rejects a title that is %s', async (_l, body) => {
      await http().post('/v1/research/5/title').send(body).expect(400);
      expect(research.updateTitle).not.toHaveBeenCalled();
    });

    it('accepts exactly 200 characters', async () => {
      await http()
        .post('/v1/research/5/title')
        .send({ title: 'x'.repeat(200) })
        .expect(201);
    });
  });

  describe.each([
    [
      'upload',
      { title: 'My thesis', content: '# Bull case' },
      'createManualNote',
    ],
    ['contribute', { content: '# Bull case' }, 'contribute'],
  ] as const)('POST /v1/research/%s', (route, base, method) => {
    const post = (body: Record<string, unknown>) =>
      http()
        .post(`/v1/research/${route}`)
        .send({ ...base, ...body });

    it('accepts valid tickers, normalizing case and whitespace as the service always did', async () => {
      await post({ tickers: [' aapl ', 'BRK.B', 'volv-b.st'] }).expect(201);

      expect(research[method].mock.calls[0][1]).toEqual([
        'AAPL',
        'BRK.B',
        'VOLV-B.ST',
      ]);
    });

    it.each([
      ['more than 10 tickers', { tickers: Array(11).fill('AAPL') }],
      ['a ticker that is not a symbol', { tickers: ['NOT A TICKER!'] }],
      ['a ticker longer than 10 characters', { tickers: ['ABCDEFGHIJK'] }],
      ['a non-string ticker', { tickers: [{ $gt: '' }] }],
      ['tickers that are not an array', { tickers: 'AAPL' }],
      [
        'content over the cap',
        { tickers: ['AAPL'], content: 'x'.repeat(100001) },
      ],
    ])('rejects %s with 400', async (_l, body) => {
      await post(body).expect(400);
      expect(research[method]).not.toHaveBeenCalled();
    });

    it('accepts content right at the cap', async () => {
      await post({ tickers: ['AAPL'], content: 'x'.repeat(100000) }).expect(
        201,
      );
    });
  });

  it('POST /v1/research/upload rejects an over-long title or model', async () => {
    const base = { tickers: ['AAPL'], title: 'ok', content: 'body' };

    await http()
      .post('/v1/research/upload')
      .send({ ...base, title: 'x'.repeat(201) })
      .expect(400);
    await http()
      .post('/v1/research/upload')
      .send({ ...base, model: 'x'.repeat(101) })
      .expect(400);
    expect(research.createManualNote).not.toHaveBeenCalled();
  });
});

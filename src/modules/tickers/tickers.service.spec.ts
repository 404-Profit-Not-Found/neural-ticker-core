import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { TickerCreationCapException, TickersService } from './tickers.service';
import { runWithActor } from '../../common/request-actor/request-actor';
import { TickerEntity } from './entities/ticker.entity';
import { TickerLogoEntity } from './entities/ticker-logo.entity';
import { TickerRequestEntity } from '../ticker-requests/entities/ticker-request.entity';
import { FinnhubService } from '../finnhub/finnhub.service';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { JobsService } from '../jobs/jobs.service';

import { PriceOhlcv } from '../market-data/entities/price-ohlcv.entity';

describe('TickersService', () => {
  let service: TickersService;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
  };

  // The insert of a new ticker runs in manager.transaction (count + insert
  // under an advisory lock for a capped user); run the callback inline.
  const mockManager: any = {
    query: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn((ticker: any) => mockTickerRepo.save(ticker)),
    transaction: jest.fn((cb: (manager: any) => Promise<unknown>) =>
      cb(mockManager),
    ),
  };
  const mockTickerRepo: any = {
    findOne: jest.fn(),
    // The row as it is read back after the insert (no creator column).
    findOneOrFail: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    find: jest.fn(),
    count: jest.fn(),
    manager: mockManager,
  };
  const mockConfig: Record<string, unknown> = {};

  const mockLogoRepo = {
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
  };

  const mockOhlcvRepo = {
    find: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockFinnhubService = {
    getCompanyProfile: jest.fn(),
    searchSymbols: jest.fn(),
  };
  const mockYahooService = {
    getSummary: jest.fn(),
    search: jest.fn(),
  };

  const mockHttpService = {
    get: jest.fn().mockReturnValue(of({ data: Buffer.from('') })),
  };

  const mockJobsService = {
    queueRequest: jest.fn(),
    initializeTicker: jest.fn(),
  };

  const mockRequestRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TickersService,
        {
          provide: getRepositoryToken(TickerEntity),
          useValue: mockTickerRepo,
        },
        {
          provide: getRepositoryToken(TickerLogoEntity),
          useValue: mockLogoRepo,
        },
        {
          provide: getRepositoryToken(PriceOhlcv),
          useValue: mockOhlcvRepo,
        },
        {
          provide: FinnhubService,
          useValue: mockFinnhubService,
        },
        {
          provide: YahooFinanceService,
          useValue: mockYahooService,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: JobsService,
          useValue: mockJobsService,
        },
        {
          provide: getRepositoryToken(TickerRequestEntity),
          useValue: mockRequestRepo,
        },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => mockConfig[key] },
        },
      ],
    }).compile();

    service = module.get<TickersService>(TickersService);
    jest.clearAllMocks();
    for (const key of Object.keys(mockConfig)) delete mockConfig[key];
    mockManager.count.mockResolvedValue(0);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTicker', () => {
    it('should return ticker if found', async () => {
      const mockTicker = { symbol: 'AAPL' };
      mockTickerRepo.findOne.mockResolvedValue(mockTicker);
      expect(await service.getTicker('AAPL')).toEqual(mockTicker);
    });

    it('should throw NotFoundException if not found and finnhub fails', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);
      mockFinnhubService.getCompanyProfile.mockRejectedValue(
        new Error('API error'),
      );
      await expect(service.getTicker('UNKNOWN')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getCount', () => {
    it('counts only the tickers a user can see (hidden ones are left out)', async () => {
      mockTickerRepo.count.mockResolvedValue(43);

      await expect(service.getCount()).resolves.toBe(43);
      expect(mockTickerRepo.count).toHaveBeenCalledWith({
        where: { is_hidden: false },
      });
    });
  });

  describe('awaitEnsureTicker', () => {
    it('should be an alias for ensureTicker', async () => {
      const mockTicker = { symbol: 'AAPL' };
      mockTickerRepo.findOne.mockResolvedValue(mockTicker);
      expect(await service.awaitEnsureTicker('AAPL')).toEqual(mockTicker);
    });
  });

  describe('assertPublicReadAllowed (gate for the public reads)', () => {
    const noSideEffects = () => {
      expect(mockFinnhubService.getCompanyProfile).not.toHaveBeenCalled();
      expect(mockYahooService.getSummary).not.toHaveBeenCalled();
      expect(mockTickerRepo.save).not.toHaveBeenCalled();
      expect(mockJobsService.initializeTicker).not.toHaveBeenCalled();
      expect(mockJobsService.queueRequest).not.toHaveBeenCalled();
    };

    // The universe: what `count({ where: { symbol } })` finds.
    const track = (...symbols: string[]) =>
      mockTickerRepo.count.mockImplementation(({ where }: any) =>
        Promise.resolve(symbols.includes(where.symbol) ? 1 : 0),
      );

    it.each([
      ['empty', ''],
      ['whitespace', '   '],
      ['33 characters', 'A'.repeat(33)],
      ['a 5000-character string', 'A'.repeat(5000)],
      ['a non-string', undefined as any],
    ])(
      'answers something that cannot be a symbol (%s) with 400 for everyone, WITHOUT a lookup',
      async (_label, symbol) => {
        for (const isSignedIn of [false, true]) {
          await expect(
            service.assertPublicReadAllowed(symbol, isSignedIn),
          ).rejects.toThrow(BadRequestException);
        }
        expect(mockTickerRepo.count).not.toHaveBeenCalled();
        expect(mockTickerRepo.findOne).not.toHaveBeenCalled();
        noSideEffects();
      },
    );

    // The strict pattern must never lock an existing listing out.
    it.each([
      ['an 11-character symbol', 'RELIANCE.NS'],
      ['a symbol containing ^', '^GSPC'],
      ['a symbol containing =', 'EURUSD=X'],
      ['a symbol containing &', 'M&M.NS'],
      ['a 32-character symbol', 'A'.repeat(32)],
    ])(
      'serves a TRACKED ticker with %s to an anonymous and to a signed-in caller',
      async (_label, symbol) => {
        track(symbol);

        await expect(
          service.assertPublicReadAllowed(symbol, false),
        ).resolves.toBeUndefined();
        await expect(
          service.assertPublicReadAllowed(symbol.toLowerCase(), true),
        ).resolves.toBeUndefined();

        expect(mockTickerRepo.count).toHaveBeenCalledWith({
          where: { symbol },
        });
        noSideEffects();
      },
    );

    it.each([
      ['longer than 10 characters', 'RELIANCE.NS'],
      ['a space inside', 'AA PL'],
      ['a slash', 'AAPL/../x'],
      ['an index caret', '^GSPC'],
      ['SQL', "AAPL'--"],
    ])(
      'answers an UNTRACKED malformed symbol (%s) with 400 for everyone — the pattern guards creation and provider calls',
      async (_label, symbol) => {
        track('AAPL');

        for (const isSignedIn of [false, true]) {
          await expect(
            service.assertPublicReadAllowed(symbol, isSignedIn),
          ).rejects.toThrow(BadRequestException);
        }
        // Looked up (as a bound parameter), found nothing, then refused.
        expect(mockTickerRepo.count).toHaveBeenCalledTimes(2);
        noSideEffects();
      },
    );

    it('answers an ANONYMOUS caller with 404 for a well-formed symbol we do not track — without asking any provider', async () => {
      track('AAPL');

      const error = await service
        .assertPublicReadAllowed('NVDA', false)
        .catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      // The same body a hidden ticker gets from getTicker() — nothing about
      // whether a data provider knows the symbol.
      expect(error.message).toBe('Ticker NVDA not found');
      expect(mockTickerRepo.count).toHaveBeenCalledWith({
        where: { symbol: 'NVDA' },
      });
      noSideEffects();
    });

    it('gives the identical 404 whether or not the symbol exists upstream', async () => {
      track();
      // Provider mocks are irrelevant: they are never consulted.
      mockFinnhubService.getCompanyProfile.mockResolvedValue({ name: 'Real' });

      const real = await service
        .assertPublicReadAllowed('NVDA', false)
        .catch((e) => e);
      const bogus = await service
        .assertPublicReadAllowed('ZZZZZZ', false)
        .catch((e) => e);

      expect(real.getStatus()).toBe(bogus.getStatus());
      expect(real.getResponse()).toEqual({
        ...bogus.getResponse(),
        message: 'Ticker NVDA not found',
      });
      noSideEffects();
    });

    it('lets an anonymous caller read a ticker we already track (case and whitespace insensitive)', async () => {
      track('AAPL');

      await expect(
        service.assertPublicReadAllowed(' aapl ', false),
      ).resolves.toBeUndefined();

      expect(mockTickerRepo.count).toHaveBeenCalledWith({
        where: { symbol: 'AAPL' },
      });
      noSideEffects();
    });

    it.each(['NVDA', 'BRK.B', 'VOLV-B.ST', '7203.T', 'brk.b'])(
      'lets a SIGNED-IN caller through for the untracked, well-formed %s (creation keeps working downstream)',
      async (symbol) => {
        track('AAPL');

        await expect(
          service.assertPublicReadAllowed(symbol, true),
        ).resolves.toBeUndefined();
        noSideEffects();
      },
    );
  });

  // Found on a real PostgreSQL (test/db/public-gate.db-spec.ts): a NUL byte
  // cannot be sent as text, so the lookup itself failed and the route said 500.
  describe('the public-read gate and control characters', () => {
    it.each([
      ['a NUL byte', 'NUL\u0000X'],
      ['only a NUL byte', '\u0000'],
      ['a tab inside', 'AA\tPL'],
      ['a newline inside', 'AA\nPL'],
      ['DEL', 'AAPL\u007f'],
    ])(
      '%s is a 400 without any lookup, for anonymous and signed-in callers',
      async (_label, symbol) => {
        mockTickerRepo.count.mockClear();
        for (const signedIn of [false, true]) {
          await expect(
            service.assertPublicReadAllowed(symbol, signedIn),
          ).rejects.toThrow(BadRequestException);
        }
        expect(mockTickerRepo.count).not.toHaveBeenCalled();
      },
    );

    it('in a list it is refused per symbol and never reaches the query', async () => {
      mockTickerRepo.find.mockResolvedValue([{ symbol: 'AAPL' }]);

      const result = await service.partitionPublicRead(
        ['AAPL', 'BAD\u0000'],
        false,
      );

      expect(result.readable).toEqual(['AAPL']);
      expect(result.refused).toEqual([
        { symbol: 'BAD\u0000', error: 'Invalid ticker symbol format' },
      ]);
      const [options] = mockTickerRepo.find.mock.calls[0];
      expect(options.where.symbol.value).toEqual(['AAPL']);
    });
  });

  describe('partitionPublicRead (the gate for a list of symbols)', () => {
    const trackRows = (...symbols: string[]) =>
      mockTickerRepo.find.mockImplementation(({ where }: any) =>
        Promise.resolve(
          symbols
            .filter((s) => where.symbol.value.includes(s))
            .map((symbol) => ({ symbol })),
        ),
      );

    it('splits an anonymous request with ONE lookup: tracked symbols are readable, the rest get a per-symbol reason', async () => {
      trackRows('AAPL', 'RELIANCE.NS', '^GSPC');

      const result = await service.partitionPublicRead(
        [
          'aapl',
          'NVDA', // well-formed, untracked
          'RELIANCE.NS', // tracked although it breaks the pattern
          '^GSPC',
          'AA PL', // untracked + malformed
          'A'.repeat(40), // never looked up
          'AAPL', // duplicate
          '',
        ],
        false,
      );

      expect(result.readable).toEqual(['AAPL', 'RELIANCE.NS', '^GSPC']);
      expect(result.refused).toEqual([
        { symbol: 'NVDA', error: 'Ticker NVDA not found' },
        { symbol: 'AA PL', error: 'Invalid ticker symbol format' },
        { symbol: 'A'.repeat(40), error: 'Invalid ticker symbol format' },
      ]);
      expect(mockTickerRepo.find).toHaveBeenCalledTimes(1);
      const { where, select } = mockTickerRepo.find.mock.calls[0][0];
      expect(select).toEqual(['symbol']);
      // The over-long string is not part of the query.
      expect(where.symbol.value).toEqual([
        'AAPL',
        'NVDA',
        'RELIANCE.NS',
        '^GSPC',
        'AA PL',
      ]);
      expect(mockFinnhubService.getCompanyProfile).not.toHaveBeenCalled();
      expect(mockTickerRepo.save).not.toHaveBeenCalled();
      expect(mockJobsService.initializeTicker).not.toHaveBeenCalled();
    });

    it('lets a signed-in caller keep untracked well-formed symbols', async () => {
      trackRows('AAPL');

      const result = await service.partitionPublicRead(
        ['AAPL', 'NVDA', 'AA PL'],
        true,
      );

      expect(result.readable).toEqual(['AAPL', 'NVDA']);
      expect(result.refused).toEqual([
        { symbol: 'AA PL', error: 'Invalid ticker symbol format' },
      ]);
    });

    it('does not query for an empty list', async () => {
      mockTickerRepo.find.mockClear();

      expect(await service.partitionPublicRead([], false)).toEqual({
        readable: [],
        refused: [],
      });
      expect(mockTickerRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('ensureTicker', () => {
    it('should return existing ticker if found', async () => {
      const mockTicker = { symbol: 'AAPL' };
      mockTickerRepo.findOne.mockResolvedValue(mockTicker);
      expect(await service.ensureTicker('AAPL')).toEqual(mockTicker);
      expect(mockFinnhubService.getCompanyProfile).not.toHaveBeenCalled();
    });

    it('should trigger logo download for existing ticker with logo_url', async () => {
      const mockTicker = {
        id: '1',
        symbol: 'AAPL',
        logo_url: 'https://logo.com/aapl.png',
      };
      mockTickerRepo.findOne.mockResolvedValue(mockTicker);
      mockLogoRepo.findOne.mockResolvedValue(null);

      await service.ensureTicker('AAPL');
      expect(mockLogoRepo.findOne).toHaveBeenCalled();
    });

    it('should fetch and create ticker if not found', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);
      const mockProfile = {
        name: 'Apple Inc',
        currency: 'USD',
        exchange: 'NASDAQ',
      };
      mockFinnhubService.getCompanyProfile.mockResolvedValue(mockProfile);
      const newTicker = { id: '1', symbol: 'AAPL', ...mockProfile };
      mockTickerRepo.create.mockReturnValue(newTicker);
      mockTickerRepo.save.mockResolvedValue(newTicker);
      mockTickerRepo.findOneOrFail.mockResolvedValue(newTicker);

      const result = await service.ensureTicker('AAPL');
      expect(result).toEqual(newTicker);
      expect(mockFinnhubService.getCompanyProfile).toHaveBeenCalledWith('AAPL');
      expect(mockTickerRepo.save).toHaveBeenCalled();
    });

    it('should convert symbol to uppercase', async () => {
      const mockTicker = { symbol: 'AAPL' };
      mockTickerRepo.findOne.mockResolvedValue(mockTicker);
      await service.ensureTicker('aapl');
      expect(mockTickerRepo.findOne).toHaveBeenCalledWith({
        where: { symbol: 'AAPL' },
      });
    });

    it('should throw NotFoundException if Finnhub returns empty', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);
      mockFinnhubService.getCompanyProfile.mockResolvedValue({});
      await expect(service.ensureTicker('BAD')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with rate limit message', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);
      const rateLimitError = { response: { status: 429 } };
      mockFinnhubService.getCompanyProfile.mockRejectedValue(rateLimitError);
      await expect(service.ensureTicker('TEST')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException on generic API error', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);
      mockFinnhubService.getCompanyProfile.mockRejectedValue(
        new Error('Network error'),
      );
      await expect(service.ensureTicker('TEST')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // A new ticker costs provider calls and a research run. A non-admin user
  // may cause only a limited number per day; the limit lives in ensureTicker,
  // the one place every creation path ends in. Against a real database (the
  // lock, the count, parallel requests): test/db/ticker-creation.db-spec.ts.
  describe('ensureTicker — per-user daily cap on NEW tickers', () => {
    const user = { userId: 'user-1', role: 'user' };
    const admin = { userId: 'admin-1', role: 'admin' };
    const asActor = <T>(actor: any, fn: () => Promise<T>) =>
      runWithActor(actor, fn);

    const untrackedButKnownToProviders = (symbol = 'NVDA') => {
      const row = { id: '7', symbol, name: 'NVIDIA Corp' };
      mockTickerRepo.findOne.mockResolvedValue(null);
      mockFinnhubService.getCompanyProfile.mockResolvedValue({
        name: 'NVIDIA Corp',
        exchange: 'NASDAQ',
        currency: 'USD',
      });
      mockTickerRepo.create.mockImplementation((dto: any) => ({ ...dto }));
      mockTickerRepo.save.mockImplementation((t: any) =>
        Promise.resolve({ id: '7', ...t }),
      );
      mockTickerRepo.findOneOrFail.mockResolvedValue(row);
      return row;
    };

    const expectNothingCreated = () => {
      expect(mockFinnhubService.getCompanyProfile).not.toHaveBeenCalled();
      expect(mockYahooService.getSummary).not.toHaveBeenCalled();
      expect(mockTickerRepo.save).not.toHaveBeenCalled();
      expect(mockJobsService.initializeTicker).not.toHaveBeenCalled();
      expect(mockJobsService.queueRequest).not.toHaveBeenCalled();
    };

    it('under the limit: creates the ticker, records the creator, and returns the row WITHOUT the creator', async () => {
      const row = untrackedButKnownToProviders();
      mockManager.count.mockResolvedValue(9);

      const result = await asActor(user, () => service.ensureTicker('nvda'));

      expect(mockTickerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'NVDA',
          created_by_user_id: 'user-1',
        }),
      );
      expect(result).toBe(row);
      expect(result).not.toHaveProperty('created_by_user_id');
      expect(mockJobsService.initializeTicker).toHaveBeenCalledTimes(1);
      expect(mockJobsService.initializeTicker).toHaveBeenCalledWith('NVDA');
    });

    it('counts what THIS user created in the last 24 hours', async () => {
      untrackedButKnownToProviders();
      const before = Date.now();

      await asActor(user, () => service.ensureTicker('NVDA'));

      const [entity, options] = mockManager.count.mock.calls[0];
      expect(entity).toBe(TickerEntity);
      expect(options.where.created_by_user_id).toBe('user-1');
      const since: Date = options.where.created_at.value;
      expect(before - since.getTime()).toBeGreaterThanOrEqual(
        24 * 60 * 60 * 1000 - 5,
      );
      expect(before - since.getTime()).toBeLessThan(24 * 60 * 60 * 1000 + 5000);
    });

    it('at the limit: 429 before a single provider call, with a message that points to the request flow', async () => {
      untrackedButKnownToProviders();
      mockManager.count.mockResolvedValue(10);

      const error = await asActor(user, () =>
        service.ensureTicker('NVDA'),
      ).catch((e) => e);

      expect(error).toBeInstanceOf(TickerCreationCapException);
      expect(error.getStatus()).toBe(429);
      expect(error.getResponse()).toEqual({
        statusCode: 429,
        error: 'Too Many Requests',
        message:
          'You have reached the limit of 10 new tickers per day. Tickers ' +
          'already on the platform are not affected. To get another one ' +
          'added, submit a ticker request instead.',
      });
      expectNothingCreated();
    });

    it('checks again under a per-user advisory lock at the insert, so parallel requests cannot overshoot', async () => {
      untrackedButKnownToProviders();
      // The cheap pre-check still sees 9; by the time this request holds the
      // lock, a parallel one has created the 10th.
      mockManager.count.mockResolvedValueOnce(9).mockResolvedValueOnce(10);

      await expect(
        asActor(user, () => service.ensureTicker('NVDA')),
      ).rejects.toBeInstanceOf(TickerCreationCapException);

      expect(mockManager.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['ticker-create:user-1'],
      );
      // lock first, then the count, inside the same transaction
      expect(mockManager.query.mock.invocationCallOrder[0]).toBeLessThan(
        mockManager.count.mock.invocationCallOrder[1],
      );
      expect(mockTickerRepo.save).not.toHaveBeenCalled();
      expect(mockJobsService.initializeTicker).not.toHaveBeenCalled();
    });

    it('a ticker that is already tracked is never affected, however many the user has created', async () => {
      const tracked = { id: '1', symbol: 'AAPL' };
      mockTickerRepo.findOne.mockResolvedValue(tracked);
      mockManager.count.mockResolvedValue(999);

      await expect(
        asActor(user, () => service.ensureTicker('AAPL')),
      ).resolves.toBe(tracked);

      expect(mockManager.count).not.toHaveBeenCalled();
      expect(mockManager.transaction).not.toHaveBeenCalled();
    });

    it('admins are exempt (and still recorded as the creator)', async () => {
      untrackedButKnownToProviders();
      mockManager.count.mockResolvedValue(999);

      await asActor(admin, () => service.ensureTicker('NVDA'));

      expect(mockManager.count).not.toHaveBeenCalled();
      expect(mockManager.query).not.toHaveBeenCalled();
      expect(mockTickerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ created_by_user_id: 'admin-1' }),
      );
    });

    it('system work (no user: crons, approvals queue) is not capped and records no creator', async () => {
      untrackedButKnownToProviders();
      mockManager.count.mockResolvedValue(999);

      await service.ensureTicker('NVDA');

      expect(mockManager.count).not.toHaveBeenCalled();
      expect(mockTickerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ created_by_user_id: null }),
      );
    });

    it.each([
      ['TICKER_CREATE_DAILY_LIMIT=2', 2, 2, true],
      ['TICKER_CREATE_DAILY_LIMIT=2, one used', 2, 1, false],
      ['TICKER_CREATE_DAILY_LIMIT=0 (requests only)', 0, 0, true],
      ['unset → default 10', undefined, 9, false],
      ['not a number → default 10', NaN, 10, true],
      ['negative → default 10', -3, 9, false],
    ])('%s', async (_l, configured, used, refused) => {
      untrackedButKnownToProviders();
      mockConfig['tickers.createDailyLimit'] = configured;
      mockManager.count.mockResolvedValue(used);

      const outcome = asActor(user, () => service.ensureTicker('NVDA'));

      if (refused) {
        await expect(outcome).rejects.toBeInstanceOf(
          TickerCreationCapException,
        );
      } else {
        await expect(outcome).resolves.toBeDefined();
      }
    });

    it('two requests for the same new symbol: the one that loses the insert returns the row and does NOT initialise it again', async () => {
      const row = untrackedButKnownToProviders();
      // unique_violation on tickers.symbol, as TypeORM surfaces it
      mockTickerRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key value'), {
          driverError: { code: '23505' },
        }),
      );

      const result = await asActor(user, () => service.ensureTicker('NVDA'));

      expect(result).toBe(row);
      expect(mockJobsService.initializeTicker).not.toHaveBeenCalled();
    });

    it('any other insert failure still surfaces', async () => {
      untrackedButKnownToProviders();
      mockTickerRepo.save.mockRejectedValue(new Error('connection lost'));

      await expect(
        asActor(user, () => service.ensureTicker('NVDA')),
      ).rejects.toThrow('connection lost');
      expect(mockJobsService.initializeTicker).not.toHaveBeenCalled();
    });

    describe('when the providers are rate limited and the add is queued', () => {
      const rateLimited = () => {
        mockTickerRepo.findOne.mockResolvedValue(null);
        mockFinnhubService.getCompanyProfile.mockRejectedValue(
          new Error('boom'),
        );
        mockYahooService.getSummary.mockRejectedValue(
          new Error('Too Many Requests'),
        );
      };

      it('the queued request carries the capped user, so the retry still counts against them', async () => {
        rateLimited();

        await expect(
          asActor(user, () => service.ensureTicker('NVDA')),
        ).rejects.toMatchObject({ status: 202 });

        expect(mockJobsService.queueRequest).toHaveBeenCalledWith(
          'ADD_TICKER',
          { symbol: 'NVDA', requested_by: 'user-1' },
        );
      });

      it.each([
        ['an admin', admin],
        ['a system job', null],
      ])('for %s it carries no user', async (_l, actor) => {
        rateLimited();

        await expect(
          asActor(actor, () => service.ensureTicker('NVDA')),
        ).rejects.toMatchObject({ status: 202 });

        expect(mockJobsService.queueRequest).toHaveBeenCalledWith(
          'ADD_TICKER',
          { symbol: 'NVDA' },
        );
      });
    });
  });

  describe('downloadAndSaveLogo', () => {
    it('should download and save logo', async () => {
      const mockResponse = {
        data: Buffer.from('imagedata'),
        headers: { 'content-type': 'image/png' },
      };
      mockHttpService.get.mockReturnValue(of(mockResponse));
      mockLogoRepo.save.mockResolvedValue({});

      await service.downloadAndSaveLogo(
        'ticker-1',
        'https://logo.com/test.png',
      );

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://logo.com/test.png',
        {
          responseType: 'arraybuffer',
          maxRedirects: 0,
          headers: {
            'User-Agent':
              'neural-ticker-logo-fetcher/1.0 (+https://neuralticker.com)',
          },
          timeout: 10000,
          maxContentLength: 2 * 1024 * 1024,
        },
      );
      expect(mockLogoRepo.create).toHaveBeenCalled();
      expect(mockLogoRepo.save).toHaveBeenCalled();
    });

    it('does not store a page that is not an image', async () => {
      mockLogoRepo.save.mockClear();
      mockHttpService.get.mockReturnValue(
        of({
          data: Buffer.from('<html>sign in</html>'),
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      );

      await service.downloadAndSaveLogo('ticker-1', 'https://logo.com/login');

      expect(mockLogoRepo.save).not.toHaveBeenCalled();
    });

    it('should handle download failure gracefully', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      // Should not throw, just log error
      await expect(
        service.downloadAndSaveLogo('ticker-1', 'https://bad.com'),
      ).resolves.toBeUndefined();
    });

    it('refuses an unsafe (SSRF) URL without fetching', async () => {
      mockHttpService.get.mockClear();

      await service.downloadAndSaveLogo(
        'ticker-1',
        'http://169.254.169.254/latest/meta-data/',
      );

      expect(mockHttpService.get).not.toHaveBeenCalled();
      expect(mockLogoRepo.save).not.toHaveBeenCalled();
    });

    it('should return early if no URL provided', async () => {
      await service.downloadAndSaveLogo('ticker-1', '');
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });
  });

  describe('updateLogo (admin)', () => {
    const ticker = { id: 'ticker-1', symbol: 'AAPL', logo_url: null };

    beforeEach(() => {
      mockHttpService.get.mockReset();
      mockLogoRepo.save.mockReset();
      mockLogoRepo.save.mockResolvedValue({});
      mockTickerRepo.findOne.mockResolvedValue({ ...ticker });
      mockTickerRepo.save.mockImplementation((t: any) => Promise.resolve(t));
    });

    it('stores the image first and only then reports success', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: Buffer.from('png-bytes'),
          headers: { 'content-type': 'image/png' },
        }),
      );

      const saved = await service.updateLogo(
        'aapl',
        ' https://logo.com/a.png ',
      );

      expect(mockLogoRepo.save).toHaveBeenCalledTimes(1);
      expect(saved.logo_url).toBe('https://logo.com/a.png');
    });

    it.each([
      ['not a url'],
      ['http://logo.com/a.png'],
      ['https://localhost/a.png'],
      ['https://169.254.169.254/latest/meta-data/'],
    ])('rejects %s without fetching or saving anything', async (url) => {
      await expect(service.updateLogo('AAPL', url)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockHttpService.get).not.toHaveBeenCalled();
      expect(mockLogoRepo.save).not.toHaveBeenCalled();
      expect(mockTickerRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a link that cannot be downloaded, and saves nothing', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Request failed with status code 404')),
      );

      await expect(
        service.updateLogo('AAPL', 'https://logo.com/missing.png'),
      ).rejects.toThrow(/Could not use that link as a logo/);
      expect(mockLogoRepo.save).not.toHaveBeenCalled();
      expect(mockTickerRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a link that returns a web page instead of an image', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: Buffer.from('<html></html>'),
          headers: { 'content-type': 'text/html' },
        }),
      );

      await expect(
        service.updateLogo('AAPL', 'https://logo.com/page'),
      ).rejects.toThrow(/not an image/);
      expect(mockTickerRepo.save).not.toHaveBeenCalled();
    });

    it('clears the URL when given an empty value', async () => {
      const saved = await service.updateLogo('AAPL', '');
      expect(mockHttpService.get).not.toHaveBeenCalled();
      expect(saved.logo_url).toBe('');
    });
  });

  describe('getLogo', () => {
    it('should return logo if found', async () => {
      const ticker = { id: 'ticker-1', symbol: 'AAPL' };
      const logo = { symbol_id: 'ticker-1', image_data: Buffer.from('data') };
      mockTickerRepo.findOne.mockResolvedValue(ticker);
      mockLogoRepo.findOne.mockResolvedValue(logo);

      const result = await service.getLogo('AAPL');
      expect(result).toEqual(logo);
    });

    it('should return null if ticker not found', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);

      const result = await service.getLogo('UNKNOWN');
      expect(result).toBeNull();
    });

    it('should return null if logo not found for ticker', async () => {
      const ticker = { id: 'ticker-1', symbol: 'AAPL' };
      mockTickerRepo.findOne.mockResolvedValue(ticker);
      mockLogoRepo.findOne.mockResolvedValue(null);

      const result = await service.getLogo('AAPL');
      expect(result).toBeNull();
    });
  });

  describe('getAllTickers', () => {
    it('should return all tickers', async () => {
      const tickers = [{ symbol: 'AAPL' }, { symbol: 'GOOGL' }];
      mockTickerRepo.find.mockResolvedValue(tickers);

      const result = await service.getAllTickers();
      expect(result).toEqual(tickers);
      expect(mockTickerRepo.find).toHaveBeenCalledWith({
        select: ['id', 'symbol', 'name', 'exchange', 'currency'],
        where: { is_hidden: false },
        order: { symbol: 'ASC' },
      });
    });
  });

  describe('searchTickers', () => {
    let mockOhlcvQueryBuilder: any;

    beforeEach(() => {
      // Setup ohlcv query builder mock for sparkline batch query
      mockOhlcvQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockOhlcvRepo.createQueryBuilder = jest.fn(() => mockOhlcvQueryBuilder);
    });

    it('should return all tickers when no search query', async () => {
      const tickers = [{ symbol: 'AAPL' }];
      mockTickerRepo.find.mockResolvedValue(tickers);

      const result = await service.searchTickers();
      expect(result).toEqual([{ symbol: 'AAPL', is_locally_tracked: true }]);
    });

    it('should return all tickers for empty search', async () => {
      const tickers = [{ symbol: 'AAPL' }];
      mockTickerRepo.find.mockResolvedValue(tickers);

      const result = await service.searchTickers('   ');
      expect(result).toEqual([{ symbol: 'AAPL', is_locally_tracked: true }]);
    });

    it('should search with query pattern', async () => {
      await service.searchTickers('AAP');
      expect(mockTickerRepo.createQueryBuilder).toHaveBeenCalledWith('ticker');
    });

    it('should batch fetch sparklines for all results in a single query', async () => {
      const dbResults = [
        { id: '1', symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ' },
        { id: '2', symbol: 'GOOGL', name: 'Google', exchange: 'NASDAQ' },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(dbResults);
      mockRequestRepo.find.mockResolvedValue([]);

      const priceData = [
        { symbol_id: '1', close: 150, ts: new Date('2026-01-14') },
        { symbol_id: '1', close: 149, ts: new Date('2026-01-13') },
        { symbol_id: '2', close: 200, ts: new Date('2026-01-14') },
        { symbol_id: '2', close: 199, ts: new Date('2026-01-13') },
      ];
      mockOhlcvQueryBuilder.getMany.mockResolvedValue(priceData);

      const result = await service.searchTickers('A');

      // Verify batch query was used
      expect(mockOhlcvRepo.createQueryBuilder).toHaveBeenCalledWith('ohlcv');
      expect(mockOhlcvQueryBuilder.where).toHaveBeenCalledWith(
        'ohlcv.symbol_id IN (:...symbolIds)',
        { symbolIds: ['1', '2'] },
      );

      // Verify sparklines are attached correctly
      expect(result[0].sparkline).toEqual([149, 150]); // reversed for chronological order
      expect(result[1].sparkline).toEqual([199, 200]);
    });

    it('should handle sparkline fetch failure gracefully', async () => {
      const dbResults = [
        { id: '1', symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ' },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(dbResults);
      mockRequestRepo.find.mockResolvedValue([]);

      // Simulate database error (like 42P01 - table not found)
      mockOhlcvQueryBuilder.getMany.mockRejectedValue(
        new Error('relation "price_ohlcv" does not exist'),
      );

      // Should NOT throw - graceful degradation
      const result = await service.searchTickers('A');

      // Should still return results, just without sparklines
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('AAPL');
      expect(result[0].sparkline).toEqual([]); // Empty array, not undefined
    });

    it('should handle local database failure gracefully by returning external results', async () => {
      // Force local DB to fail ONCE to avoid bleeding into other tests
      mockTickerRepo.createQueryBuilder.mockImplementationOnce(() => {
        throw new Error('Relation "tickers" does not exist');
      });

      // Mock external results to ensure we still get something
      mockFinnhubService.searchSymbols.mockResolvedValue({
        result: [{ symbol: 'EXT', description: 'External Co', type: 'Common' }],
      });
      mockYahooService.search.mockResolvedValue({ quotes: [] });

      const result = await service.searchTickers('EXT', true);

      // Should not throw, and should contain external result
      expect(result).toContainEqual(
        expect.objectContaining({ symbol: 'EXT', is_locally_tracked: false }),
      );
    });

    it('should return empty sparklines for tickers with no price data', async () => {
      const dbResults = [
        { id: '1', symbol: 'NEW', name: 'New Stock', exchange: 'NYSE' },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(dbResults);
      mockRequestRepo.find.mockResolvedValue([]);
      mockOhlcvQueryBuilder.getMany.mockResolvedValue([]); // No price data

      const result = await service.searchTickers('NEW');

      expect(result[0].sparkline).toEqual([]);
    });

    it('should include pending requests in search results', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockRequestRepo.find.mockResolvedValue([
        { symbol: 'PENDING', status: 'PENDING' },
      ]);

      const result = await service.searchTickers('PEN');

      const pendingResult = result.find((r) => r.symbol === 'PENDING');
      expect(pendingResult).toBeDefined();
      expect(pendingResult?.is_locally_tracked).toBe(false);
      expect(pendingResult?.is_queued).toBe(true);
    });

    it('should deduplicate pending requests that match existing tickers', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([
        { id: '1', symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ' },
      ]);
      mockRequestRepo.find.mockResolvedValue([
        { symbol: 'AAPL', status: 'PENDING' },
      ]);

      const result = await service.searchTickers('AAP');

      // Should only have one AAPL entry
      const aaplResults = result.filter(
        (r) => r.symbol?.toUpperCase() === 'AAPL',
      );
      expect(aaplResults).toHaveLength(1);
      expect(aaplResults[0].is_locally_tracked).toBe(true);
    });

    it('should include external results when includeExternal is true', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockRequestRepo.find.mockResolvedValue([]);

      mockFinnhubService.searchSymbols.mockResolvedValue({
        result: [{ symbol: 'EXTFIN', description: 'External from Finnhub' }],
      });
      mockYahooService.search.mockResolvedValue({
        quotes: [{ symbol: 'EXTYAH', shortname: 'External from Yahoo' }],
      });

      const result = await service.searchTickers('EXT', true);

      expect(mockFinnhubService.searchSymbols).toHaveBeenCalledWith('EXT');
      expect(mockYahooService.search).toHaveBeenCalledWith('EXT');

      const finnhubResult = result.find((r) => r.symbol === 'EXTFIN');
      const yahooResult = result.find((r) => r.symbol === 'EXTYAH');
      expect(finnhubResult).toBeDefined();
      expect(yahooResult).toBeDefined();
      expect(finnhubResult?.is_locally_tracked).toBe(false);
    });

    it('keeps US share classes (BRK.B) from Finnhub and still leaves exchange-suffixed symbols to Yahoo', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockRequestRepo.find.mockResolvedValue([]);

      mockFinnhubService.searchSymbols.mockResolvedValue({
        result: [
          { symbol: 'BRK.B', description: 'BERKSHIRE HATHAWAY INC-CL B' },
          { symbol: 'BRK.A', description: 'BERKSHIRE HATHAWAY INC-CL A' },
          { symbol: 'BRK.DE', description: 'Berkshire (Xetra listing)' },
          { symbol: 'BRKB.JK', description: 'Unknown venue' },
        ],
      });
      mockYahooService.search.mockResolvedValue({ quotes: [] });

      const result = await service.searchTickers('BRK', true);
      const symbols = result.map((r) => r.symbol);

      expect(symbols).toEqual(expect.arrayContaining(['BRK.B', 'BRK.A']));
      expect(symbols).not.toContain('BRK.DE');
      expect(symbols).not.toContain('BRKB.JK');
    });

    it('should handle external API failures gracefully', async () => {
      const dbResults = [
        { id: '1', symbol: 'LOCAL', name: 'Local Stock', exchange: 'NYSE' },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(dbResults);
      mockRequestRepo.find.mockResolvedValue([]);

      mockFinnhubService.searchSymbols.mockRejectedValue(
        new Error('API rate limit'),
      );
      mockYahooService.search.mockRejectedValue(new Error('API error'));

      // Should NOT throw - should return local results
      const result = await service.searchTickers('LOC', true);

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('LOCAL');
    });
  });
  describe('getUniqueSectors', () => {
    it('should return sectors from finnhub_industry if sector column is empty', async () => {
      const mockRawResults = [
        { sector: 'Technology' },
        { sector: 'Healthcare' },
      ];
      const qb = mockTickerRepo.createQueryBuilder();
      qb.getRawMany.mockResolvedValue(mockRawResults);

      const result = await service.getUniqueSectors();

      expect(result).toEqual(['Technology', 'Healthcare']);
      expect(qb.select).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE'),
        'sector',
      );
    });

    it('should filter out empty sectors', async () => {
      const mockRawResults = [
        { sector: 'Technology' },
        { sector: '' },
        { sector: null },
      ];
      const qb = mockTickerRepo.createQueryBuilder();
      qb.getRawMany.mockResolvedValue(mockRawResults);

      const result = await service.getUniqueSectors();
      expect(result).toEqual(['Technology']);
    });
  });
});

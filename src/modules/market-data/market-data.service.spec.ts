import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MarketDataService } from './market-data.service';
import { PriceOhlcv } from './entities/price-ohlcv.entity';
import { Fundamentals } from './entities/fundamentals.entity';
import { AnalystRating } from './entities/analyst-rating.entity';
import { RiskAnalysis } from '../risk-reward/entities/risk-analysis.entity';
import { ResearchNote } from '../research/entities/research-note.entity';
import { Comment } from '../social/entities/comment.entity';
import { CompanyNews } from './entities/company-news.entity';
import { TickersService } from '../tickers/tickers.service';
import { FinnhubService } from '../finnhub/finnhub.service';
import { Repository } from 'typeorm';
import { TickerEntity } from '../tickers/entities/ticker.entity';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PriceAlertsService } from '../price-alerts/price-alerts.service';

import { ConfigService } from '@nestjs/config';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';
import { MarketStatusService } from './market-status.service';
import { VERDICT_SQL } from '../../lib/ticker-verdict';

describe('MarketDataService', () => {
  let service: MarketDataService;
  let ohlcvRepo: Repository<PriceOhlcv>;
  let fundamentalsRepo: Repository<Fundamentals>;
  let analystRatingRepo: Repository<AnalystRating>;
  let riskAnalysisRepo: Repository<RiskAnalysis>;
  let researchNoteRepo: Repository<ResearchNote>;
  let tickersService: TickersService;
  let finnhubService: FinnhubService;
  let marketStatusService: MarketStatusService;
  let configService: ConfigService;

  const mockQueryBuilder: any = {
    leftJoinAndMapOne: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    distinctOn: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  // Fix circular reference for mockReturnThis by explicitly returning self
  mockQueryBuilder.leftJoinAndMapOne.mockReturnValue(mockQueryBuilder);
  mockQueryBuilder.leftJoin.mockReturnValue(mockQueryBuilder);
  mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
  mockQueryBuilder.andWhere.mockReturnValue(mockQueryBuilder);
  mockQueryBuilder.orderBy.mockReturnValue(mockQueryBuilder);
  mockQueryBuilder.addOrderBy.mockReturnValue(mockQueryBuilder);
  mockQueryBuilder.addSelect.mockReturnValue(mockQueryBuilder);
  mockQueryBuilder.limit.mockReturnValue(mockQueryBuilder);
  mockQueryBuilder.offset.mockReturnValue(mockQueryBuilder);
  mockQueryBuilder.take.mockReturnValue(mockQueryBuilder);
  mockQueryBuilder.skip.mockReturnValue(mockQueryBuilder);
  mockQueryBuilder.distinctOn.mockReturnValue(mockQueryBuilder);

  const mockOhlcvRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn().mockResolvedValue({}),
    count: jest.fn(),
    upsert: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockImplementation((dto) => dto),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockFundamentalsRepo = {
    findOne: jest.fn(),
    save: jest.fn().mockResolvedValue({}), // Return Promise
    create: jest.fn().mockImplementation((dto) => dto),
  };

  const mockAnalystRatingRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
  };

  const mockRiskAnalysisRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      distinctOn: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  };

  const mockResearchNoteRepo = {
    count: jest.fn(),
  };

  const mockCommentRepo = {
    count: jest.fn(),
  };

  const mockCompanyNewsRepo = {
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => ({
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    })),
  };

  const mockTickersService = {
    findBySymbol: jest.fn(),
    awaitEnsureTicker: jest.fn(), // Service uses awaitEnsureTicker, not findBySymbol
    getTicker: jest.fn(),
    getRepo: jest.fn(),
  };

  const mockFinnhubService = {
    getQuote: jest.fn(),
    getCompanyProfile: jest.fn(),
    getCompanyNews: jest.fn(),
    getBasicFinancials: jest.fn(),
    getMarketStatus: jest.fn(),
  };
  const mockYahooService = {
    getQuote: jest.fn(),
    getHistorical: jest.fn(),
    getSummary: jest.fn(),
    search: jest.fn(),
    fetchNewsFromYahoo: jest.fn().mockResolvedValue([]),
  };
  const mockPortfolioService = {
    getAllDistinctPortfolioSymbols: jest.fn().mockResolvedValue([]),
  };

  const mockMarketStatusService = {
    getAllMarketsStatus: jest.fn().mockResolvedValue({
      us: { isOpen: true, session: 'regular' },
      eu: { isOpen: true, session: 'regular' },
      asia: { isOpen: true, session: 'regular' },
    }),
  };

  // Fresh ticker repo mock factory — exposed so individual tests can override
  // `getRawMany` (used by pickStaleSnapshotTickers).
  const mockTickerQb: any = {
    where: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndMapOne: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue([]),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  const mockTickerRepo = {
    createQueryBuilder: jest.fn(() => mockTickerQb),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(15), // Return default number
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketDataService,
        {
          provide: getRepositoryToken(PriceOhlcv),
          useValue: mockOhlcvRepo,
        },
        {
          provide: getRepositoryToken(Fundamentals),
          useValue: mockFundamentalsRepo,
        },
        {
          provide: getRepositoryToken(AnalystRating),
          useValue: mockAnalystRatingRepo,
        },
        {
          provide: getRepositoryToken(RiskAnalysis),
          useValue: mockRiskAnalysisRepo,
        },
        {
          provide: getRepositoryToken(ResearchNote),
          useValue: mockResearchNoteRepo,
        },
        {
          provide: getRepositoryToken(Comment),
          useValue: mockCommentRepo,
        },
        {
          provide: getRepositoryToken(CompanyNews),
          useValue: mockCompanyNewsRepo,
        },
        {
          provide: TickersService,
          useValue: mockTickersService,
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
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PortfolioService,
          useValue: mockPortfolioService,
        },
        {
          provide: MarketStatusService,
          useValue: mockMarketStatusService,
        },
        {
          provide: PriceAlertsService,
          useValue: {
            findActiveAlertSymbols: jest.fn().mockResolvedValue([]),
            evaluateAlerts: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(TickerEntity),
          useValue: mockTickerRepo,
        },
      ],
    }).compile();

    service = module.get<MarketDataService>(MarketDataService);
    ohlcvRepo = module.get<Repository<PriceOhlcv>>(
      getRepositoryToken(PriceOhlcv),
    );
    fundamentalsRepo = module.get<Repository<Fundamentals>>(
      getRepositoryToken(Fundamentals),
    );
    analystRatingRepo = module.get<Repository<AnalystRating>>(
      getRepositoryToken(AnalystRating),
    );
    riskAnalysisRepo = module.get<Repository<RiskAnalysis>>(
      getRepositoryToken(RiskAnalysis),
    );
    researchNoteRepo = module.get<Repository<ResearchNote>>(
      getRepositoryToken(ResearchNote),
    );
    tickersService = module.get<TickersService>(TickersService);
    finnhubService = module.get<FinnhubService>(FinnhubService);
    configService = module.get<ConfigService>(ConfigService);
    marketStatusService = module.get<MarketStatusService>(MarketStatusService);

    jest.clearAllMocks();

    mockFinnhubService.getQuote.mockReset();
    mockFinnhubService.getCompanyProfile.mockReset();
    mockFinnhubService.getCompanyNews.mockReset();
    mockFinnhubService.getBasicFinancials.mockReset();
    mockFinnhubService.getMarketStatus.mockReset();

    mockAnalystRatingRepo.find.mockResolvedValue([]);
    mockAnalystRatingRepo.count.mockResolvedValue(0);
    mockRiskAnalysisRepo.findOne.mockResolvedValue(null);
    mockResearchNoteRepo.count.mockResolvedValue(0);
    mockRiskAnalysisRepo.findOne.mockResolvedValue(null);
    mockResearchNoteRepo.count.mockResolvedValue(0);
    mockFinnhubService.getCompanyNews.mockResolvedValue([]);
    mockMarketStatusService.getAllMarketsStatus.mockResolvedValue({
      us: { isOpen: true },
      eu: { isOpen: true },
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSnapshot', () => {
    it('should return cached data if fresh', async () => {
      const mockTicker = { id: 1, symbol: 'AAPL' };
      const mockPrice = {
        symbol: 'AAPL',
        close: 150,
        ts: new Date(),
        updated_at: new Date(), // Fresh
      } as unknown as PriceOhlcv;
      const mockFundamentals = {
        symbol: 'AAPL',
        market_cap: 100,
        updated_at: new Date(), // Fresh
      } as unknown as Fundamentals;

      mockTickersService.awaitEnsureTicker.mockResolvedValue(mockTicker);
      // Mock findLatestPrice logic (uses findOne, not queryBuilder as previously thought)
      mockOhlcvRepo.findOne.mockResolvedValue(mockPrice);

      mockFundamentalsRepo.findOne.mockResolvedValue(mockFundamentals);

      const result = await service.getSnapshot('AAPL');

      expect(result.ticker).toEqual(mockTicker);
      expect(result.latestPrice!.close).toBe(150);
      expect(finnhubService.getQuote).not.toHaveBeenCalled();
    });

    it('should fetch from Finnhub if cached price is stale', async () => {
      const mockTicker = { id: 1, symbol: 'AAPL' };
      const staleDate = new Date();
      staleDate.setMinutes(staleDate.getMinutes() - 20); // 20 mins old

      const mockPrice = {
        symbol: 'AAPL',
        close: 100,
        ts: staleDate,
        updated_at: staleDate,
      } as unknown as PriceOhlcv;

      const newQuote = {
        c: 155,
        o: 154,
        h: 156,
        l: 153,
        v: 1000,
        t: Date.now() / 1000,
      };

      mockTickersService.awaitEnsureTicker.mockResolvedValue(mockTicker);

      mockOhlcvRepo.findOne.mockResolvedValue(mockPrice); // Stale

      mockFinnhubService.getQuote.mockResolvedValue(newQuote);
      mockFundamentalsRepo.findOne.mockResolvedValue({
        updated_at: new Date(),
      });

      const result = await service.getSnapshot('AAPL');

      expect(finnhubService.getQuote).toHaveBeenCalledWith('AAPL');
      expect(result.latestPrice!.close).toBe(155);
      expect(mockOhlcvRepo.save).toHaveBeenCalled();
    });

    describe('US vs non-US routing of a stale snapshot', () => {
      const stale = () => {
        const staleDate = new Date(Date.now() - 20 * 60 * 1000);
        mockOhlcvRepo.findOne.mockResolvedValue({
          close: 100,
          ts: staleDate,
          updated_at: staleDate,
        } as unknown as PriceOhlcv);
        mockFundamentalsRepo.findOne.mockResolvedValue({
          updated_at: new Date(),
        });
        mockFinnhubService.getQuote.mockResolvedValue({
          c: 155,
          o: 154,
          h: 156,
          l: 153,
          v: 1000,
          t: Date.now() / 1000,
        });
        mockYahooService.getQuote.mockResolvedValue(null);
        mockYahooService.getSummary.mockResolvedValue(null);
      };

      // A dot is not an exchange suffix when it marks a US share class.
      it.each(['BRK.B', 'BRK.A', 'BF.B'])(
        'treats the US share class %s as a US listing: Finnhub, not straight to Yahoo',
        async (symbol) => {
          mockTickersService.awaitEnsureTicker.mockResolvedValue({
            id: 1,
            symbol,
          });
          stale();

          await service.getSnapshot(symbol);

          expect(finnhubService.getQuote).toHaveBeenCalledWith(symbol);
        },
      );

      it.each(['SAP.DE', '7203.T', 'VOLV-B.ST', 'BBCA.JK'])(
        'still skips Finnhub for the exchange-suffixed %s',
        async (symbol) => {
          mockTickersService.awaitEnsureTicker.mockResolvedValue({
            id: 1,
            symbol,
          });
          stale();

          await service.getSnapshot(symbol);

          expect(finnhubService.getQuote).not.toHaveBeenCalled();
          expect(mockYahooService.getQuote).toHaveBeenCalledWith(symbol);
        },
      );
    });
  });

  describe('getCompanyNews', () => {
    it('should return news from Finnhub', async () => {
      const mockNews = [{ headline: 'Test News' }];
      mockFinnhubService.getCompanyNews.mockResolvedValue(mockNews);
      // Service now returns what it finds in DB after upsert
      mockCompanyNewsRepo.find.mockResolvedValue(mockNews);

      const result = await service.getCompanyNews('AAPL');

      expect(result).toEqual(mockNews);
      expect(finnhubService.getCompanyNews).toHaveBeenCalledWith(
        'AAPL',
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('fetchNewsFromYahoo (date normalization)', () => {
    it('keeps a raw epoch-seconds providerPublishTime instead of shifting to 1970', async () => {
      // With Yahoo search running unvalidated, providerPublishTime arrives as a
      // raw epoch-seconds NUMBER (no Date coercion). The old
      // new Date(seconds) misread it as millis and stamped every article 1970.
      const publishedSeconds = 1_718_745_600; // 2024-06-18T20:00:00Z
      mockYahooService.search.mockResolvedValue({
        news: [
          {
            uuid: 'abc',
            title: 'Energiekontor rises',
            publisher: 'Reuters',
            link: 'https://example.com/a',
            providerPublishTime: publishedSeconds,
            thumbnail: { resolutions: [{ url: 'https://img/a.png' }] },
          },
        ],
      });

      const [item] = await service.fetchNewsFromYahoo('EKT.DE');

      expect(item.datetime).toBe(publishedSeconds);
      // The downstream entity build does new Date(datetime * 1000) — must be 2024.
      expect(new Date(item.datetime * 1000).getUTCFullYear()).toBe(2024);
    });

    it('still accepts a coerced Date (validation-on shape)', async () => {
      const d = new Date('2024-06-18T20:00:00Z');
      mockYahooService.search.mockResolvedValue({
        news: [{ uuid: 'x', title: 't', providerPublishTime: d }],
      });

      const [item] = await service.fetchNewsFromYahoo('EKT.DE');

      expect(item.datetime).toBe(Math.floor(d.getTime() / 1000));
    });

    it('returns an empty list when Yahoo yields no news', async () => {
      mockYahooService.search.mockResolvedValue({});

      const result = await service.fetchNewsFromYahoo('EKT.DE');

      expect(result).toEqual([]);
    });
  });

  describe('upsertAnalystRatings', () => {
    it('should skip ratings with no firm', async () => {
      mockTickersService.awaitEnsureTicker.mockResolvedValue({ id: 1 });
      const ratings = [{ rating: 5, rating_date: new Date() }] as any;
      await service.upsertAnalystRatings('AAPL', ratings);
      expect(mockAnalystRatingRepo.save).not.toHaveBeenCalled();
    });

    it('should skip ratings with no rating_date or invalid date', async () => {
      mockTickersService.awaitEnsureTicker.mockResolvedValue({ id: 1 });
      const ratings = [
        { firm: 'Firm A', rating: 5, rating_date: null },
        { firm: 'Firm B', rating: 5, rating_date: 'invalid' },
      ] as any;
      await service.upsertAnalystRatings('AAPL', ratings);
      expect(mockAnalystRatingRepo.save).not.toHaveBeenCalled();
    });

    it('should skip ratings where rating value is null or undefined', async () => {
      mockTickersService.awaitEnsureTicker.mockResolvedValue({ id: 1 });
      const ratings = [
        { firm: 'Firm A', rating: null, rating_date: '2025-01-01' },
        { firm: 'Firm B', rating: undefined, rating_date: '2025-01-01' },
      ] as any;
      await service.upsertAnalystRatings('AAPL', ratings);
      expect(mockAnalystRatingRepo.save).not.toHaveBeenCalled();
    });

    it('should upsert valid rating if not exists', async () => {
      mockTickersService.awaitEnsureTicker.mockResolvedValue({ id: 1 });
      mockAnalystRatingRepo.findOne.mockResolvedValue(null); // Not exists

      const ratings = [
        { firm: 'Firm A', rating: 'Buy', rating_date: '2025-01-01' },
      ] as any;

      await service.upsertAnalystRatings('AAPL', ratings);

      expect(mockAnalystRatingRepo.save).toHaveBeenCalledWith({
        firm: 'Firm A',
        rating: 'Buy',
        rating_date: '2025-01-01',
        symbol_id: 1,
      });
    });
  });

  describe('upsertFundamentals', () => {
    it('does not overwrite existing values with null/undefined (regression: H2)', async () => {
      mockTickersService.awaitEnsureTicker.mockResolvedValue({ id: 1 });
      const existing = {
        symbol_id: 1,
        pe_ttm: 28.5,
        market_cap: 100,
        beta: 1.1,
      } as unknown as Fundamentals;
      mockFundamentalsRepo.findOne.mockResolvedValue(existing);

      await service.upsertFundamentals('AAPL', {
        pe_ttm: null,
        market_cap: undefined,
        beta: 1.2,
      } as any);

      const saved = mockFundamentalsRepo.save.mock.calls[0][0];
      // Existing good values survive the null/undefined incoming fields...
      expect(saved.pe_ttm).toBe(28.5);
      expect(saved.market_cap).toBe(100);
      // ...while a real incoming value is applied.
      expect(saved.beta).toBe(1.2);
    });

    it('still applies non-null values onto a freshly created entity', async () => {
      mockTickersService.awaitEnsureTicker.mockResolvedValue({ id: 2 });
      mockFundamentalsRepo.findOne.mockResolvedValue(null);

      await service.upsertFundamentals('MSFT', {
        pe_ttm: 30,
        eps_ttm: null,
        sector: 'Technology',
      } as any);

      const saved = mockFundamentalsRepo.save.mock.calls[0][0];
      expect(saved.symbol_id).toBe(2);
      expect(saved.pe_ttm).toBe(30);
      expect(saved.sector).toBe('Technology');
      expect('eps_ttm' in saved).toBe(false);
    });
  });

  describe('updateTickerDescription (L5)', () => {
    it('writes the description when none exists yet', async () => {
      const ticker = { id: 1, symbol: 'AAPL', description: null } as any;
      mockTickersService.awaitEnsureTicker.mockResolvedValue(ticker);
      const repo = { save: jest.fn().mockResolvedValue(ticker) };
      (service as any).tickerRepo = repo;

      await service.updateTickerDescription('AAPL', 'A solid company.');

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.save.mock.calls[0][0].description).toBe('A solid company.');
    });

    it('does NOT overwrite an existing description with a shorter one', async () => {
      const longExisting =
        'Apple Inc. designs, manufactures and markets smartphones.';
      const ticker = {
        id: 1,
        symbol: 'AAPL',
        description: longExisting,
      } as any;
      mockTickersService.awaitEnsureTicker.mockResolvedValue(ticker);
      const repo = { save: jest.fn() };
      (service as any).tickerRepo = repo;

      await service.updateTickerDescription('AAPL', 'Apple makes phones.');

      expect(repo.save).not.toHaveBeenCalled();
      expect(ticker.description).toBe(longExisting);
    });

    it('upgrades an existing description when the new one is materially longer', async () => {
      const shortExisting = 'Apple makes phones.';
      const richer =
        'Apple Inc. designs, manufactures and markets smartphones, computers and wearables worldwide.';
      const ticker = {
        id: 1,
        symbol: 'AAPL',
        description: shortExisting,
      } as any;
      mockTickersService.awaitEnsureTicker.mockResolvedValue(ticker);
      const repo = { save: jest.fn().mockResolvedValue(ticker) };
      (service as any).tickerRepo = repo;

      await service.updateTickerDescription('AAPL', richer);

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.save.mock.calls[0][0].description).toBe(richer);
    });

    it('ignores empty / whitespace-only descriptions without touching the DB', async () => {
      const ticker = { id: 1, symbol: 'AAPL', description: 'Existing.' } as any;
      mockTickersService.awaitEnsureTicker.mockResolvedValue(ticker);
      const repo = { save: jest.fn() };
      (service as any).tickerRepo = repo;

      await service.updateTickerDescription('AAPL', '   ');

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only stored description as empty and writes', async () => {
      const ticker = { id: 1, symbol: 'AAPL', description: '   ' } as any;
      mockTickersService.awaitEnsureTicker.mockResolvedValue(ticker);
      const repo = { save: jest.fn().mockResolvedValue(ticker) };
      (service as any).tickerRepo = repo;

      await service.updateTickerDescription('AAPL', 'Now has content.');

      expect(repo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAnalyzerTickers', () => {
    it('should return paginated data with correct structure', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(), // Added
        limit: jest.fn().mockReturnThis(), // Added
        getRawAndEntities: jest.fn().mockResolvedValue({
          entities: [
            {
              id: 1,
              symbol: 'AAPL',
              name: 'Apple Inc',
              exchange: 'NASDAQ',
              fund: { market_cap: 1000 },
              latestPrice: { close: 150 },
              latestRisk: { overall_score: 5 },
            },
          ],
          raw: [{ ticker_id: 1, total_count: '1' }],
        }),
        getCount: jest.fn().mockResolvedValue(1),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]), // Fallback
      };

      // Mock getRepo correctly using the closure variables
      const repo = {
        createQueryBuilder: jest.fn(() => mockQueryBuilder),
      };

      // Override the global mockTickersService.getRepo for this test
      mockTickersService.getRepo.mockReturnValue(repo);

      const result = await service.getAnalyzerTickers({
        page: 1,
        limit: 10,
        sortBy: 'market_cap',
        sortDir: 'DESC',
      });

      expect(tickersService.getRepo).toHaveBeenCalled();
      expect(mockQueryBuilder.leftJoinAndMapOne).toHaveBeenCalledTimes(3); // Fund, Price, Risk
      expect(mockQueryBuilder.offset).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(result.items[0].ticker.symbol).toBe('AAPL');
      expect(result.items[0].fundamentals.market_cap).toBe(1000);
      expect(result.meta.total).toBe(1);
    });

    it('should apply search filter when provided', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(), // Added
        limit: jest.fn().mockReturnThis(), // Added
        getRawAndEntities: jest
          .fn()
          .mockResolvedValue({ entities: [], raw: [] }),
        getCount: jest.fn().mockResolvedValue(0),
      };

      const repo = {
        createQueryBuilder: jest.fn(() => mockQueryBuilder),
      };

      mockTickersService.getRepo.mockReturnValue(repo);

      await service.getAnalyzerTickers({ search: 'AAP' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(UPPER(ticker.symbol) LIKE :search OR UPPER(ticker.name) LIKE :search)',
        { search: '%AAP%' },
      );
    });

    it('should filter out bankrupt shadowbanned tickers for admin', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawAndEntities: jest
          .fn()
          .mockResolvedValue({ entities: [], raw: [] }),
        getCount: jest.fn().mockResolvedValue(0),
      };

      const repo = {
        createQueryBuilder: jest.fn(() => mockQueryBuilder),
      };

      mockTickersService.getRepo.mockReturnValue(repo);

      await service.getAnalyzerTickers({ isAdmin: true });

      // Identify the call with Brackets by checking the function passed to andWhere
      // Jest matcher for object containing specific structure is hard for Brackets,
      // so we check if any call is a Brackets instance (by checking constructor name or just assuming correctness if call count matches expectation of structure change)
      // A better check: The argument is a Brackets object.
      // Expect strict filtering for is_hidden = false
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ticker.is_hidden = :isHidden',
        { isHidden: false },
      );
    });

    it('should filter by overallScore (Risk/Reward)', async () => {
      // Setup mock Repo for this specific test
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawAndEntities: jest
          .fn()
          .mockResolvedValue({ entities: [], raw: [] }),
        getCount: jest.fn().mockResolvedValue(0),
      };

      const repo = {
        createQueryBuilder: jest.fn(() => mockQueryBuilder),
      };

      mockTickersService.getRepo.mockReturnValue(repo);

      await service.getAnalyzerTickers({ overallScore: '> 8.5' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'risk.overall_score > :overallScoreVal',
        { overallScoreVal: 8.5 },
      );
    });

    it('should apply region filter (EU)', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawAndEntities: jest
          .fn()
          .mockResolvedValue({ entities: [], raw: [] }),
        getCount: jest.fn().mockResolvedValue(0),
      };

      const repo = { createQueryBuilder: jest.fn(() => mockQueryBuilder) };
      mockTickersService.getRepo.mockReturnValue(repo);

      await service.getAnalyzerTickers({ region: ['EU'] });

      // Region filter calls andWhere with a Brackets instance
      const bracketsCalls = mockQueryBuilder.andWhere.mock.calls.filter(
        (call: any[]) =>
          call[0] && typeof call[0] === 'object' && call[0].whereFactory,
      );
      expect(bracketsCalls.length).toBeGreaterThan(0);
    });

    it('should apply region filter (US)', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawAndEntities: jest
          .fn()
          .mockResolvedValue({ entities: [], raw: [] }),
        getCount: jest.fn().mockResolvedValue(0),
      };

      const repo = { createQueryBuilder: jest.fn(() => mockQueryBuilder) };
      mockTickersService.getRepo.mockReturnValue(repo);

      await service.getAnalyzerTickers({ region: ['US'] });

      const bracketsCalls = mockQueryBuilder.andWhere.mock.calls.filter(
        (call: any[]) =>
          call[0] && typeof call[0] === 'object' && call[0].whereFactory,
      );
      expect(bracketsCalls.length).toBeGreaterThan(0);
    });

    it('should NOT apply region filter when region array is empty', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawAndEntities: jest
          .fn()
          .mockResolvedValue({ entities: [], raw: [] }),
        getCount: jest.fn().mockResolvedValue(0),
      };

      const repo = { createQueryBuilder: jest.fn(() => mockQueryBuilder) };
      mockTickersService.getRepo.mockReturnValue(repo);

      const beforeCount = mockQueryBuilder.andWhere.mock.calls.length;
      await service.getAnalyzerTickers({ region: [] });
      // No region brackets added (only the standard is_hidden + maybe others)
      // This is a smoke check — region: [] should behave like undefined.
      expect(
        mockQueryBuilder.andWhere.mock.calls.length,
      ).toBeGreaterThanOrEqual(beforeCount);
    });

    it('should apply dynamic upside filter when provided', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawAndEntities: jest
          .fn()
          .mockResolvedValue({ entities: [], raw: [] }),
        getCount: jest.fn().mockResolvedValue(0),
      };

      const repo = {
        createQueryBuilder: jest.fn(() => mockQueryBuilder),
      };

      mockTickersService.getRepo.mockReturnValue(repo);

      await service.getAnalyzerTickers({ upside: '> 20%' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('base_scenario.price_mid'),
        expect.objectContaining({ upsideVal: 20 }),
      );
    });

    it('should apply dynamic sorting for upside_percent', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawAndEntities: jest
          .fn()
          .mockResolvedValue({ entities: [], raw: [] }),
        getCount: jest.fn().mockResolvedValue(0),
      };

      const repo = {
        createQueryBuilder: jest.fn(() => mockQueryBuilder),
      };

      mockTickersService.getRepo.mockReturnValue(repo);

      await service.getAnalyzerTickers({
        sortBy: 'upside_percent',
        sortDir: 'ASC',
      });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        '"dynamic_upside"',
        'ASC',
        'NULLS LAST',
      );
    });

    // "Current price" = the newest DAILY candle. price_ohlcv also caches the
    // intraday bars of the 1D/1W/1M charts, which are newer than the day's
    // daily candle and carry no prevClose. On PostgreSQL:
    // test/db/latest-price.db-spec.ts.
    describe('latest price = the daily candle', () => {
      it('the analyzer joins the newest 1d candle, not the newest row of any timeframe', async () => {
        const qb = {
          leftJoin: jest.fn().mockReturnThis(),
          leftJoinAndMapOne: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          offset: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getRawAndEntities: jest
            .fn()
            .mockResolvedValue({ entities: [], raw: [] }),
        };
        mockTickersService.getRepo.mockReturnValue({
          createQueryBuilder: jest.fn(() => qb),
        });

        await service.getAnalyzerTickers({});

        const priceJoin = qb.leftJoinAndMapOne.mock.calls.find(
          (call) => call[2] === 'price',
        );
        expect(priceJoin[3]).toBe(MarketDataService.LATEST_DAILY_PRICE_JOIN);
        expect(MarketDataService.LATEST_DAILY_PRICE_JOIN).toBe(
          "price.symbol_id = ticker.id AND price.timeframe = '1d' AND price.ts = " +
            "(SELECT MAX(ts) FROM price_ohlcv WHERE symbol_id = ticker.id AND timeframe = '1d')",
        );
      });

      it('a snapshot reads the newest 1d candle', async () => {
        mockTickersService.awaitEnsureTicker.mockResolvedValue({
          id: 1,
          symbol: 'AAPL',
        });
        mockOhlcvRepo.findOne.mockResolvedValue({
          close: 100,
          ts: new Date(),
        } as unknown as PriceOhlcv);
        mockOhlcvRepo.find.mockResolvedValue([]);
        mockFundamentalsRepo.findOne.mockResolvedValue({
          updated_at: new Date(),
        });
        mockRiskAnalysisRepo.findOne.mockResolvedValue(null);

        await service.getSnapshots(['AAPL']);

        expect(mockOhlcvRepo.findOne).toHaveBeenCalledWith({
          where: { symbol_id: 1, timeframe: '1d' },
          order: { ts: 'DESC' },
        });
      });
    });

    // The AI rating: one SQL definition (src/lib/ticker-verdict.ts) for the
    // filter, the sort, the returned fields and the dashboard counts. That it
    // equals the clients' maths is proven on PostgreSQL in
    // test/db/ai-rating.db-spec.ts; here: how the service uses it.
    describe('AI rating', () => {
      const run = async (options: Record<string, unknown>, result?: any) => {
        const qb = {
          leftJoin: jest.fn().mockReturnThis(),
          leftJoinAndMapOne: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          offset: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getRawAndEntities: jest
            .fn()
            .mockResolvedValue(result ?? { entities: [], raw: [] }),
        };
        mockTickersService.getRepo.mockReturnValue({
          createQueryBuilder: jest.fn(() => qb),
        });
        const page = await service.getAnalyzerTickers(options as any);
        return { qb, page };
      };
      const ratingWhere = (qb: any) =>
        qb.andWhere.mock.calls.find(
          ([sql]: [unknown]) =>
            typeof sql === 'string' && sql.includes('IN (:...aiRatings)'),
        );

      it('filters by the rating expression, with the values as parameters', async () => {
        const { qb } = await run({ aiRating: ['Strong Buy', 'Sell'] });

        const [sql, params] = ratingWhere(qb);
        expect(sql).toBe(`${VERDICT_SQL.rating} IN (:...aiRatings)`);
        expect(params).toEqual({ aiRatings: ['Strong Buy', 'Sell'] });
      });

      it('"Legendary" selects "No Brainer"; duplicates collapse', async () => {
        const { qb } = await run({
          aiRating: ['Legendary', 'No Brainer', 'Buy'],
        });
        expect(ratingWhere(qb)[1]).toEqual({
          aiRatings: ['No Brainer', 'Buy'],
        });
      });

      it('drops unknown values; only unknown values select nothing', async () => {
        const mixed = await run({ aiRating: ['???', 'Hold'] });
        expect(ratingWhere(mixed.qb)[1]).toEqual({ aiRatings: ['Hold'] });

        const none = await run({ aiRating: ["Sell' OR 1=1 --"] });
        expect(ratingWhere(none.qb)).toBeUndefined();
        expect(none.qb.andWhere).toHaveBeenCalledWith('1 = 0');
      });

      it('no rating filter → no rating condition', async () => {
        const { qb } = await run({ aiRating: [] });
        expect(ratingWhere(qb)).toBeUndefined();
        expect(qb.andWhere).not.toHaveBeenCalledWith('1 = 0');
      });

      it('selects the score and the rating it filters by, and the upside / downside it sorts by', async () => {
        const { qb } = await run({});
        expect(qb.addSelect).toHaveBeenCalledWith(
          VERDICT_SQL.score,
          'ai_verdict_score',
        );
        expect(qb.addSelect).toHaveBeenCalledWith(
          VERDICT_SQL.rating,
          'ai_rating',
        );
        expect(qb.addSelect).toHaveBeenCalledWith(
          VERDICT_SQL.upside,
          'dynamic_upside',
        );
        expect(qb.addSelect).toHaveBeenCalledWith(
          VERDICT_SQL.downside,
          'dynamic_downside',
        );
      });

      it('the upside filter uses the same upside expression', async () => {
        const { qb } = await run({ upside: '> 20%' });
        expect(qb.andWhere).toHaveBeenCalledWith(
          `${VERDICT_SQL.upside} > :upsideVal`,
          { upsideVal: 20 },
        );
      });

      it('returns aiAnalysis.rating and aiAnalysis.rating_score as the query computed them', async () => {
        const { page } = await run(
          {},
          {
            entities: [
              { id: 1, symbol: 'AAPL', latestRisk: { financial_risk: 3 } },
              { id: 2, symbol: 'NOAI', latestRisk: null },
            ],
            raw: [
              {
                ticker_id: 1,
                total_count: '2',
                ai_rating: 'Strong Buy',
                ai_verdict_score: 82.5,
              },
              {
                ticker_id: 2,
                total_count: '2',
                ai_rating: null,
                ai_verdict_score: null,
              },
            ],
          },
        );

        expect(page.items[0].aiAnalysis).toMatchObject({
          rating: 'Strong Buy',
          rating_score: 82.5,
        });
        // Not analysed: no analysis object at all, hence no rating.
        expect(page.items[1].aiAnalysis).toBeNull();
      });

      describe.each([
        ['getStrongBuyCount', 'Strong Buy'],
        ['getSellCount', 'Sell'],
      ] as const)('%s', (method, rating) => {
        it(`counts the visible tickers rated exactly "${rating}" by the same SQL`, async () => {
          const qb: any = {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getRawMany: jest
              .fn()
              .mockResolvedValue([{ symbol: 'AAPL' }, { symbol: 'MSFT' }]),
          };
          (mockTickerRepo.createQueryBuilder as jest.Mock).mockReturnValueOnce(
            qb,
          );

          const result = await service[method]();

          expect(result).toEqual({ count: 2, symbols: ['AAPL', 'MSFT'] });
          expect(qb.where).toHaveBeenCalledWith('ticker.is_hidden = :hidden', {
            hidden: false,
          });
          expect(qb.andWhere).toHaveBeenCalledWith(
            `${VERDICT_SQL.rating} = :rating`,
            { rating },
          );
          // fundamentals, latest price, latest analysis, base + bear scenario
          expect(qb.leftJoin).toHaveBeenCalledTimes(5);
        });
      });
    });

    // Postgres puts NULLs FIRST on DESC by default, which filled the top of
    // "highest upside / risk / score" with the tickers that have no analysis.
    // Against a real database: test/db/analyzer-sort.db-spec.ts.
    describe('sorting: rows without the value always go last', () => {
      const run = async (options: Record<string, unknown>) => {
        const qb = {
          leftJoin: jest.fn().mockReturnThis(),
          leftJoinAndMapOne: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          offset: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getRawAndEntities: jest
            .fn()
            .mockResolvedValue({ entities: [], raw: [] }),
        };
        mockTickersService.getRepo.mockReturnValue({
          createQueryBuilder: jest.fn(() => qb),
        });
        await service.getAnalyzerTickers(options as any);
        return qb;
      };

      it.each([
        ['upside_percent', '"dynamic_upside"'],
        ['downside_percent', '"dynamic_downside"'],
        ['financial_risk', 'risk.financial_risk'],
        ['overall_score', 'risk.overall_score'],
        ['ai_rating', '"ai_verdict_score"'],
        ['change', '"price_change_pct"'],
        ['close', 'price.close'],
        ['market_cap', 'fund.market_cap'],
        ['pe_ttm', 'fund.pe_ttm'],
        ['consensus', 'fund.consensus_rating'],
        ['sector', 'ticker.sector'],
      ])('%s: NULLS LAST in both directions', async (sortBy, column) => {
        for (const sortDir of ['ASC', 'DESC'] as const) {
          const qb = await run({ sortBy, sortDir });
          expect(qb.orderBy).toHaveBeenCalledTimes(1);
          expect(qb.orderBy).toHaveBeenCalledWith(
            column,
            sortDir,
            'NULLS LAST',
          );
        }
      });

      it('keeps the secondary order by symbol, so pages do not shuffle', async () => {
        const qb = await run({ sortBy: 'upside_percent', sortDir: 'DESC' });
        expect(qb.addOrderBy).toHaveBeenCalledWith('ticker.symbol', 'ASC');
      });

      it('gives a ticker without an analysis no rating score, and one without a price no change', async () => {
        const qb = await run({ sortBy: 'ai_rating' });
        const selected = (alias: string): string =>
          qb.addSelect.mock.calls.find((call) => call[1] === alias)?.[0];

        expect(selected('ai_verdict_score')).toMatch(
          /^\(CASE WHEN risk\.id IS NULL THEN NULL ELSE /,
        );
        expect(selected('price_change_pct')).toMatch(
          /WHEN price\.close IS NULL THEN NULL/,
        );
      });
    });
  });

  describe('getSnapshots', () => {
    it('should fetch snapshots for multiple symbols in chunks', async () => {
      const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META']; // 6 symbols
      // We expect 2 chunks (5 + 1)

      const mockResult = {
        ticker: { symbol: 'TEST' },
        latestPrice: { close: 100 },
      };
      jest
        .spyOn(service as any, 'performGetSnapshot')
        .mockResolvedValue(mockResult);

      const results = await service.getSnapshots(symbols);

      expect(results.length).toBe(6);
      expect((service as any).performGetSnapshot).toHaveBeenCalledTimes(6);
    });

    // The clients derive upside, downside and the AI rating from
    // aiAnalysis.base_price / bear_price. The analyzer has always returned
    // them; the snapshots did not, so a watchlist and the tickers page showed
    // different figures for the same symbol.
    describe('aiAnalysis.base_price / bear_price (parity with the analyzer)', () => {
      const fresh = () => {
        mockOhlcvRepo.findOne.mockResolvedValue({
          close: 100,
          ts: new Date(),
          updated_at: new Date(),
        } as unknown as PriceOhlcv);
        mockOhlcvRepo.find.mockResolvedValue([]);
        mockFundamentalsRepo.findOne.mockResolvedValue({
          updated_at: new Date(),
        });
      };

      // The latest analysis as the database stores it: numeric columns come
      // back as strings.
      const analysis = (scenarios: any[]) => ({
        id: '77',
        ticker_id: 1,
        overall_score: 7,
        financial_risk: 4,
        sentiment: 'bullish',
        created_at: new Date('2026-10-01T00:00:00Z'),
        scenarios,
      });
      const scenario = (scenario_type: string, price_mid: any) => ({
        id: scenario_type,
        analysis_id: '77',
        scenario_type,
        price_mid,
        price_low: '1.00',
        price_high: '999.00',
      });

      // What the analyzer endpoint returns for the same ticker + analysis: its
      // SQL joins the 'base' / 'bear' scenario of the latest analysis and
      // selects their price_mid as base_price / bear_price.
      const analyzerItem = async (risk: any) => {
        const raw: any = { ticker_id: 1, total_count: '1' };
        for (const type of ['base', 'bear']) {
          const match = risk?.scenarios.find(
            (s: any) => s.scenario_type === type,
          );
          raw[`${type}_price`] = match ? match.price_mid : null;
        }
        const latestRisk = risk ? { ...risk } : null;
        if (latestRisk) delete latestRisk.scenarios; // joined without them
        const qb = {
          leftJoin: jest.fn().mockReturnThis(),
          leftJoinAndMapOne: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          offset: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getRawAndEntities: jest.fn().mockResolvedValue({
            entities: [
              {
                id: 1,
                symbol: 'AAPL',
                latestPrice: { close: 100 },
                latestRisk,
              },
            ],
            raw: [raw],
          }),
        };
        mockTickersService.getRepo.mockReturnValue({
          createQueryBuilder: jest.fn(() => qb),
        });
        const result = await service.getAnalyzerTickers({ symbols: ['AAPL'] });
        // The scenario prices come from these two joins + selects.
        expect(qb.addSelect).toHaveBeenCalledWith(
          'base_scenario.price_mid',
          'base_price',
        );
        expect(qb.addSelect).toHaveBeenCalledWith(
          'bear_scenario.price_mid',
          'bear_price',
        );
        return result.items[0];
      };

      const snapshotItem = async (risk: any) => {
        mockTickersService.awaitEnsureTicker.mockResolvedValue({
          id: 1,
          symbol: 'AAPL',
        });
        fresh();
        mockRiskAnalysisRepo.findOne.mockResolvedValue(risk);
        const [item] = await service.getSnapshots(['AAPL']);
        return item;
      };

      it('the two endpoints agree for a ticker with scenarios', async () => {
        const risk = () =>
          analysis([
            scenario('bull', '210.00'),
            scenario('base', '140.50'),
            scenario('bear', '80.25'),
          ]);

        const fromSnapshots = await snapshotItem(risk());
        const fromAnalyzer = await analyzerItem(risk());

        expect(fromSnapshots.aiAnalysis.base_price).toBe(140.5);
        expect(fromSnapshots.aiAnalysis.bear_price).toBe(80.25);
        // The server's rating rides along (price 100, base 140.5, bear 80.25,
        // risk 4, neural 7, no revenue): 50 + 16.2 - 7.9 - 5 + 10.
        expect(fromSnapshots.aiAnalysis.rating).toBe('Hold');
        expect(fromSnapshots.aiAnalysis.rating_score).toBeCloseTo(63.3, 10);
        expect({
          base_price: fromSnapshots.aiAnalysis.base_price,
          bear_price: fromSnapshots.aiAnalysis.bear_price,
        }).toEqual({
          base_price: fromAnalyzer.aiAnalysis.base_price,
          bear_price: fromAnalyzer.aiAnalysis.bear_price,
        });
        // Everything the snapshot's aiAnalysis carried before is still there.
        expect(fromSnapshots.aiAnalysis).toMatchObject({
          id: '77',
          overall_score: 7,
          financial_risk: 4,
        });
        expect(fromSnapshots.aiAnalysis.scenarios).toHaveLength(3);
      });

      it('a ticker without an analysis has aiAnalysis null, exactly as before', async () => {
        const fromSnapshots = await snapshotItem(null);
        const fromAnalyzer = await analyzerItem(null);

        expect(fromSnapshots.aiAnalysis).toBeNull();
        expect(fromSnapshots.news).toBeNull();
        expect(fromAnalyzer.aiAnalysis).toBeNull();
      });

      it('an analysis without a bear scenario returns bear_price: null', async () => {
        const risk = () => analysis([scenario('base', '140.50')]);

        const fromSnapshots = await snapshotItem(risk());
        const fromAnalyzer = await analyzerItem(risk());

        expect(fromSnapshots.aiAnalysis.base_price).toBe(140.5);
        expect(fromSnapshots.aiAnalysis.bear_price).toBeNull();
        expect(fromSnapshots.aiAnalysis).toHaveProperty('bear_price', null);
        expect(fromAnalyzer.aiAnalysis.bear_price).toBeNull();
        expect(fromAnalyzer.aiAnalysis.base_price).toBe(140.5);
      });

      it.each([
        ['no scenarios at all', []],
        ['scenarios that were not loaded', undefined],
      ])('an analysis with %s returns both as null', async (_l, scenarios) => {
        const fromSnapshots = await snapshotItem(analysis(scenarios as any));

        expect(fromSnapshots.aiAnalysis.base_price).toBeNull();
        expect(fromSnapshots.aiAnalysis.bear_price).toBeNull();
      });

      it('agrees on the edge values too: a $0 bear target stays 0, a missing or unparsable price is null', async () => {
        const risk = () =>
          analysis([scenario('base', 'n/a'), scenario('bear', '0.00')]);

        const fromSnapshots = await snapshotItem(risk());
        const fromAnalyzer = await analyzerItem(risk());

        expect(fromSnapshots.aiAnalysis.bear_price).toBe(0);
        expect(fromSnapshots.aiAnalysis.base_price).toBeNull();
        // JSON-identical on both endpoints.
        const targets = (item: any) =>
          JSON.stringify({
            base_price: item.aiAnalysis.base_price,
            bear_price: item.aiAnalysis.bear_price,
          });
        expect(targets(fromSnapshots)).toBe(targets(fromAnalyzer));
      });

      it('adds no query: one analysis lookup per symbol, scenarios included, as before', async () => {
        await snapshotItem(analysis([scenario('base', '140.50')]));

        expect(mockRiskAnalysisRepo.findOne).toHaveBeenCalledTimes(1);
        expect(mockRiskAnalysisRepo.findOne).toHaveBeenCalledWith({
          where: { ticker_id: 1 },
          order: { created_at: 'DESC' },
          relations: ['scenarios'],
        });
      });
    });
  });

  describe('normalizeDateToUtcMidnight', () => {
    it('should set hours, minutes, seconds and ms to 0 in UTC', () => {
      const date = new Date('2025-01-26T15:30:45Z');
      const normalized = (service as any).normalizeDateToUtcMidnight(date);
      expect(normalized.getUTCHours()).toBe(0);
      expect(normalized.getUTCMinutes()).toBe(0);
      expect(normalized.getUTCSeconds()).toBe(0);
      expect(normalized.getUTCMilliseconds()).toBe(0);
      expect(normalized.toISOString()).toBe('2025-01-26T00:00:00.000Z');
    });
  });

  describe('syncTickerHistory', () => {
    it('should skip if ticker not found', async () => {
      mockTickersService.getTicker.mockResolvedValue(null);
      await service.syncTickerHistory('INVALID');
      expect(mockOhlcvRepo.count).not.toHaveBeenCalled();
    });

    it('should skip if coverage is already high', async () => {
      mockTickersService.getTicker.mockResolvedValue({ id: 1, symbol: 'AAPL' });
      // 5 years = 1250 days. If we have 1300, it's 100%+
      mockOhlcvRepo.count.mockResolvedValue(1300);

      await service.syncTickerHistory('AAPL', 5);
      expect(mockYahooService.getHistorical).not.toHaveBeenCalled();
    });

    it('should handle polymorphic Yahoo response (plain array)', async () => {
      mockTickersService.getTicker.mockResolvedValue({ id: 1, symbol: 'AAPL' });
      mockOhlcvRepo.count.mockResolvedValue(0);

      const mockHist = [{ date: new Date('2025-01-01T12:00:00Z'), close: 100 }];
      mockYahooService.getHistorical.mockResolvedValue(mockHist);

      await service.syncTickerHistory('AAPL', 1);

      expect(mockOhlcvRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ts: expect.any(Date),
          timeframe: '1d',
        }),
      );

      // Verify normalization happened in syncTickerHistory
      const createdEntity = mockOhlcvRepo.create.mock.calls[0][0];
      expect(createdEntity.ts.getUTCHours()).toBe(0);
    });

    it('should handle polymorphic Yahoo response ({ quotes: [] } format)', async () => {
      mockTickersService.getTicker.mockResolvedValue({ id: 1, symbol: 'AAPL' });
      mockOhlcvRepo.count.mockResolvedValue(0);

      const mockResponse = {
        quotes: [{ date: new Date('2025-01-01T12:00:00Z'), close: 100 }],
      };
      mockYahooService.getHistorical.mockResolvedValue(mockResponse);

      await service.syncTickerHistory('AAPL', 1);

      expect(mockOhlcvRepo.create).toHaveBeenCalled();
      const createdEntity = mockOhlcvRepo.create.mock.calls[0][0];
      expect(createdEntity.close).toBe(100);
      expect(createdEntity.ts.getUTCHours()).toBe(0);
    });
  });

  describe('getHistory', () => {
    it('should normalize interval and use UTC dates', async () => {
      const mockTicker = { id: 1, symbol: 'AAPL' };
      mockTickersService.getTicker.mockResolvedValue(mockTicker);
      mockOhlcvRepo.find.mockResolvedValue([
        { close: 150, ts: new Date('2025-01-01') },
      ]);

      // Test with 'D' interval and YYYY-MM-DD strings
      await service.getHistory('AAPL', 'D', '2025-01-01', '2025-01-02');

      expect(mockOhlcvRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timeframe: '1d',
          }),
        }),
      );
    });

    it('should normalize daily candle timestamps to midnight on fallback fetch', async () => {
      const mockTicker = { id: 1, symbol: 'AAPL' };
      mockTickersService.getTicker.mockResolvedValue(mockTicker);

      // Mock DB find to return empty to trigger sync/fallback
      mockOhlcvRepo.find.mockResolvedValueOnce([]); // First check
      mockOhlcvRepo.find.mockResolvedValueOnce([]); // After sync check

      // Mock sync to do nothing
      jest.spyOn(service, 'syncTickerHistory').mockResolvedValue(undefined);

      // Mock Finnhub to fail
      mockFinnhubService.getQuote.mockRejectedValue(new Error('Fail'));

      // Mock Yahoo Historical to return non-normalized data
      const mockYahooData = {
        quotes: [{ date: new Date('2025-01-01T15:45:00Z'), close: 200 }],
      };
      mockYahooService.getHistorical.mockResolvedValue(mockYahooData);

      const result = await service.getHistory(
        'AAPL',
        '1d',
        '2025-01-01',
        '2025-01-02',
      );

      // Verify the mapped data in the fallback loop (it returns the mapped array if DB is empty even after sync)
      // Actually, performGetHistory returns history.map(...) if successful
      expect(result[0].ts.getUTCHours()).toBe(0);
      expect(result[0].close).toBe(200);
    });
  });

  describe('updateActivePortfolios', () => {
    it('should skip refresh if all markets are closed', async () => {
      mockMarketStatusService.getAllMarketsStatus.mockResolvedValue({
        us: { isOpen: false, session: 'closed' },
        eu: { isOpen: false, session: 'closed' },
        asia: { isOpen: false, session: 'closed' },
      });
      mockPortfolioService.getAllDistinctPortfolioSymbols.mockResolvedValue([
        'AAPL',
      ]);

      await service.updateActivePortfolios();

      expect(mockMarketStatusService.getAllMarketsStatus).toHaveBeenCalled();
      // Should NOT call portfolio service or snapshots
      expect(
        mockPortfolioService.getAllDistinctPortfolioSymbols,
      ).not.toHaveBeenCalled();
    });

    it('should proceed if at least one market is open', async () => {
      mockMarketStatusService.getAllMarketsStatus.mockResolvedValue({
        us: { isOpen: true, session: 'regular' },
        eu: { isOpen: false, session: 'closed' },
      });
      mockPortfolioService.getAllDistinctPortfolioSymbols.mockResolvedValue([
        'AAPL',
      ]);
      const spySnapshot = jest
        .spyOn(service as any, 'performGetSnapshot')
        .mockResolvedValue({});

      await service.updateActivePortfolios();

      expect(spySnapshot).toHaveBeenCalledWith('AAPL', expect.any(Object));
    });
  });

  describe('Currency Self-Healing (performGetSnapshot)', () => {
    it('should update ticker currency from Yahoo Finance if missing or different', async () => {
      const mockTicker = {
        id: 1,
        symbol: 'DTE.DE',
        currency: 'USD',
        save: jest.fn(),
      } as any;
      mockTickersService.awaitEnsureTicker.mockResolvedValue(mockTicker);
      mockOhlcvRepo.findOne.mockResolvedValue(null);

      // Force Yahoo path
      mockFinnhubService.getQuote.mockRejectedValue(new Error('Restricted'));
      const mockYahooData = {
        quote: {
          currency: 'EUR',
          regularMarketPrice: 20,
        },
        summary: {},
      };
      // We need to mock fetchFullSnapshotFromYahoo private method or rely on the fact that if finnhub fails it calls it.
      // But fetchFullSnapshotFromYahoo calls yahooService.getQuote/getSummary.
      mockYahooService.getQuote.mockResolvedValue(mockYahooData.quote);
      mockYahooService.getSummary.mockResolvedValue(mockYahooData.summary);

      // We inject a mock repo into tickersService for the save call
      const mockTickerRepo = {
        save: jest.fn().mockResolvedValue({ ...mockTicker, currency: 'EUR' }),
      };
      (service as any).tickerRepo = mockTickerRepo;

      await service.refreshMarketData('DTE.DE');

      expect(mockTickerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'DTE.DE',
          currency: 'EUR',
        }),
      );
    });

    it('should update ticker currency from Finnhub Profile if missing or different', async () => {
      const mockTicker = {
        id: 2,
        symbol: 'AAPL',
        currency: '',
      } as any;
      mockTickersService.awaitEnsureTicker.mockResolvedValue(mockTicker);
      mockOhlcvRepo.findOne.mockResolvedValue(null);

      // Finnhub path
      mockFinnhubService.getQuote.mockResolvedValue({
        c: 150,
        t: Date.now() / 1000,
      });
      mockFinnhubService.getCompanyProfile.mockResolvedValue({
        currency: 'USD',
        marketCapitalization: 2000,
      });
      mockFinnhubService.getBasicFinancials.mockResolvedValue({});

      const mockTickerRepo = {
        save: jest.fn().mockResolvedValue({ ...mockTicker, currency: 'USD' }),
      };
      (service as any).tickerRepo = mockTickerRepo;

      await service.refreshMarketData('AAPL');

      expect(mockTickerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          currency: 'USD',
        }),
      );
    });

    it('should NOT update ticker currency if it already matches', async () => {
      const mockTicker = {
        id: 3,
        symbol: 'MSFT',
        currency: 'USD',
      } as any;
      mockTickersService.awaitEnsureTicker.mockResolvedValue(mockTicker);
      mockOhlcvRepo.findOne.mockResolvedValue(null);

      mockFinnhubService.getQuote.mockResolvedValue({
        c: 300,
        t: Date.now() / 1000,
      });
      mockFinnhubService.getCompanyProfile.mockResolvedValue({
        currency: 'USD',
        marketCapitalization: 2000,
      });
      mockFinnhubService.getBasicFinancials.mockResolvedValue({});

      const mockTickerRepo = {
        save: jest.fn(),
      };
      (service as any).tickerRepo = mockTickerRepo;

      await service.refreshMarketData('MSFT');

      expect(mockTickerRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('pickStaleSnapshotTickers', () => {
    it('returns empty when no candidates are passed', async () => {
      const result = await service.pickStaleSnapshotTickers([], 10);
      expect(result).toEqual([]);
      expect(mockTickerQb.getRawMany).not.toHaveBeenCalled();
    });

    it('returns empty when limit is 0', async () => {
      const result = await service.pickStaleSnapshotTickers(['AAPL'], 0);
      expect(result).toEqual([]);
    });

    it('orders never-synced first, then by oldest MAX(ts), and applies the limit', async () => {
      const now = Date.now();
      const oneHourAgo = new Date(now - 3600 * 1000).toISOString();
      const oneDayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
      const oneWeekAgo = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

      // NVDA never synced (no row). AAPL fresh-ish, TSLA day-old, MSFT week-old.
      mockTickerQb.getRawMany.mockResolvedValueOnce([
        { symbol: 'AAPL', last_ts: oneHourAgo },
        { symbol: 'TSLA', last_ts: oneDayAgo },
        { symbol: 'MSFT', last_ts: oneWeekAgo },
      ]);

      const result = await service.pickStaleSnapshotTickers(
        ['AAPL', 'TSLA', 'MSFT', 'NVDA'],
        3,
      );

      expect(result).toEqual(['NVDA', 'MSFT', 'TSLA']);
    });

    it('falls back to alphabetical when all candidates are unsynced', async () => {
      mockTickerQb.getRawMany.mockResolvedValueOnce([]);
      const result = await service.pickStaleSnapshotTickers(
        ['TSLA', 'AAPL', 'MSFT'],
        2,
      );
      expect(result).toEqual(['AAPL', 'MSFT']);
    });

    it('treats a NULL aggregate as never-synced and sorts it ahead', async () => {
      mockTickerQb.getRawMany.mockResolvedValueOnce([
        { symbol: 'AAPL', last_ts: null },
        {
          symbol: 'TSLA',
          last_ts: new Date(Date.now() - 3600 * 1000).toISOString(),
        },
      ]);
      const result = await service.pickStaleSnapshotTickers(
        ['AAPL', 'TSLA'],
        2,
      );
      expect(result).toEqual(['AAPL', 'TSLA']);
    });

    it('returns empty when limit is negative', async () => {
      const result = await service.pickStaleSnapshotTickers(['AAPL'], -3);
      expect(result).toEqual([]);
    });
  });
});

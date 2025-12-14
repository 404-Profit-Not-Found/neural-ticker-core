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

import { ConfigService } from '@nestjs/config';

describe('MarketDataService', () => {
  let service: MarketDataService;
  let ohlcvRepo: Repository<PriceOhlcv>;
  let fundamentalsRepo: Repository<Fundamentals>;
  let analystRatingRepo: Repository<AnalystRating>;
  let riskAnalysisRepo: Repository<RiskAnalysis>;
  let researchNoteRepo: Repository<ResearchNote>;
  let tickersService: TickersService;
  let finnhubService: FinnhubService;
  let configService: ConfigService;

  const mockOhlcvRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn().mockResolvedValue({}), // Return Promise
    create: jest.fn().mockImplementation((dto) => dto),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(), // Added
      take: jest.fn().mockReturnThis(), // Added for completeness
      skip: jest.fn().mockReturnThis(), // Added for completeness
      distinctOn: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
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
    getProfile2: jest.fn(), // Service uses getCompanyProfile? No, code says getCompanyProfile.
    getCompanyProfile: jest.fn(),
    getCompanyNews: jest.fn(),
    getBasicFinancials: jest.fn(),
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
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(TickerEntity),
          useValue: {
            createQueryBuilder: jest.fn(() => ({
               where: jest.fn().mockReturnThis(),
               leftJoinAndMapOne: jest.fn().mockReturnThis(),
               leftJoinAndSelect: jest.fn().mockReturnThis(),
               orderBy: jest.fn().mockReturnThis(),
               addOrderBy: jest.fn().mockReturnThis(),
               addSelect: jest.fn().mockReturnThis(),
               skip: jest.fn().mockReturnThis(),
               take: jest.fn().mockReturnThis(),
               offset: jest.fn().mockReturnThis(),
               limit: jest.fn().mockReturnThis(),
               getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
               getCount: jest.fn().mockResolvedValue(0),
               getMany: jest.fn().mockResolvedValue([]),
            })),
          },
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

    jest.clearAllMocks();

    mockAnalystRatingRepo.find.mockResolvedValue([]);
    mockAnalystRatingRepo.count.mockResolvedValue(0);
    mockRiskAnalysisRepo.findOne.mockResolvedValue(null);
    mockResearchNoteRepo.count.mockResolvedValue(0);
    mockFinnhubService.getCompanyNews.mockResolvedValue([]);
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

  describe('getAnalyzerTickers', () => {
    it('should return paginated data with correct structure', async () => {
      const mockQueryBuilder = {
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
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
          raw: [],
        }),
        getCount: jest.fn().mockResolvedValue(1),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]), // Fallback
      };

      // Mock getRepo correctly using the closure variables
      const repo = {
        createQueryBuilder: jest.fn(() => mockQueryBuilder),
      };
      // We need to spy on the tickersService instance we have in closure
      jest.spyOn(tickersService, 'getRepo').mockReturnValue(repo as any);

      const result = await service.getAnalyzerTickers({
        page: 1,
        limit: 10,
        sortBy: 'market_cap',
        sortDir: 'DESC',
      });

      expect(tickersService.getRepo).toHaveBeenCalled();
      expect(mockQueryBuilder.leftJoinAndMapOne).toHaveBeenCalledTimes(3); // Fund, Price, Risk
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result.items[0].ticker.symbol).toBe('AAPL');
      expect(result.items[0].fundamentals.market_cap).toBe(1000);
      expect(result.meta.total).toBe(1);
    });

    it('should apply search filter when provided', async () => {
      const mockQueryBuilder = {
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawAndEntities: jest
          .fn()
          .mockResolvedValue({ entities: [], raw: [] }),
        getCount: jest.fn().mockResolvedValue(0),
      };

      const repo = {
        createQueryBuilder: jest.fn(() => mockQueryBuilder),
      };

      jest.spyOn(tickersService, 'getRepo').mockReturnValue(repo as any);

      await service.getAnalyzerTickers({
        search: 'AAPL',
      });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        expect.stringContaining('LIKE :search'),
        { search: '%AAPL%' },
      );
    });
  });
});

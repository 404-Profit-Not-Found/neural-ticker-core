import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MarketDataService } from './market-data.service';
import { PriceOhlcv } from './entities/price-ohlcv.entity';
import { Fundamentals } from './entities/fundamentals.entity';
import { AnalystRating } from './entities/analyst-rating.entity';
import { RiskAnalysis } from '../risk-reward/entities/risk-analysis.entity';
import { ResearchNote } from '../research/entities/research-note.entity';
import { TickersService } from '../tickers/tickers.service';
import { FinnhubService } from '../finnhub/finnhub.service';
import { Repository } from 'typeorm';

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
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
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
  };

  const mockResearchNoteRepo = {
    count: jest.fn(),
  };

  const mockTickersService = {
    findBySymbol: jest.fn(),
    awaitEnsureTicker: jest.fn(), // Service uses awaitEnsureTicker, not findBySymbol
    getTicker: jest.fn(),
  };

  const mockFinnhubService = {
    getQuote: jest.fn(),
    getProfile2: jest.fn(), // Service uses getCompanyProfile? No, code says getCompanyProfile.
    getCompanyProfile: jest.fn(),
    getCompanyNews: jest.fn(),
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
      expect(result.latestPrice.close).toBe(150);
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
      expect(result.latestPrice.close).toBe(155);
      expect(mockOhlcvRepo.save).toHaveBeenCalled();
    });
  });

  describe('getCompanyNews', () => {
    it('should return news from Finnhub', async () => {
      const mockNews = [{ headline: 'Test News' }];
      mockFinnhubService.getCompanyNews.mockResolvedValue(mockNews);

      const result = await service.getCompanyNews('AAPL');

      expect(result).toEqual(mockNews);
      expect(finnhubService.getCompanyNews).toHaveBeenCalledWith(
        'AAPL',
        expect.any(String),
        expect.any(String),
      );
    });
  });
});

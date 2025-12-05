import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MarketDataService } from './market-data.service';
import { PriceOhlcv } from './entities/price-ohlcv.entity';
import { Fundamentals } from './entities/fundamentals.entity';
import { TickersService } from '../tickers/tickers.service';
import { FinnhubService } from '../finnhub/finnhub.service';

describe('MarketDataService', () => {
  let service: MarketDataService;
  // let ohlcvRepo: any;
  let tickersService: any;
  let finnhubService: any;

  const mockOhlcvRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockFundamentalsRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockTickersService = {
    getTicker: jest.fn(),
    awaitEnsureTicker: jest.fn().mockResolvedValue({ id: '1', symbol: 'AAPL' }),
  };

  const mockFinnhubService = {
    getQuote: jest.fn(),
    getCompanyProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketDataService,
        { provide: getRepositoryToken(PriceOhlcv), useValue: mockOhlcvRepo },
        {
          provide: getRepositoryToken(Fundamentals),
          useValue: mockFundamentalsRepo,
        },
        { provide: TickersService, useValue: mockTickersService },
        { provide: FinnhubService, useValue: mockFinnhubService },
      ],
    }).compile();

    service = module.get<MarketDataService>(MarketDataService);
    // ohlcvRepo = module.get(getRepositoryToken(PriceOhlcv));
    // fundamentalsRepo = module.get(getRepositoryToken(Fundamentals));
    tickersService = module.get(TickersService);
    finnhubService = module.get(FinnhubService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSnapshot', () => {
    const mockSymbol = { id: '1', symbol: 'AAPL' };

    it('should return database data if fresh', async () => {
      const mockCandle = { close: 150, ts: new Date() }; // Fresh
      const mockFund = { pe_ttm: 25, updated_at: new Date() }; // Fresh

      mockOhlcvRepo.findOne.mockResolvedValue(mockCandle);
      mockFundamentalsRepo.findOne.mockResolvedValue(mockFund);

      const result = await service.getSnapshot('AAPL');

      expect(result).toEqual({
        ticker: mockSymbol,
        latestPrice: mockCandle,
        fundamentals: mockFund,
        source: 'database',
      });
      expect(finnhubService.getQuote).not.toHaveBeenCalled();
    });

    it('should fetch from Finnhub if price is stale', async () => {
      const staleDate = new Date();
      staleDate.setMinutes(staleDate.getMinutes() - 20); // 20 mins old > 15 mins default
      const staleCandle = { close: 140, ts: staleDate };
      const mockFund = { pe_ttm: 25, updated_at: new Date() }; // Fresh

      const newQuote = {
        c: 155,
        h: 160,
        l: 150,
        o: 152,
        t: Math.floor(Date.now() / 1000),
      };
      const newProfile = { marketCapitalization: 2000 };

      mockOhlcvRepo.findOne.mockResolvedValue(staleCandle);
      mockFundamentalsRepo.findOne.mockResolvedValue(mockFund);
      mockFinnhubService.getQuote.mockResolvedValue(newQuote);
      mockFinnhubService.getCompanyProfile.mockResolvedValue(newProfile);

      const newCandle = { ...newQuote, ts: new Date(newQuote.t * 1000) };
      mockOhlcvRepo.create.mockReturnValue(newCandle);
      mockOhlcvRepo.save.mockResolvedValue(newCandle);

      // fundamentals creation mock
      mockFundamentalsRepo.create.mockReturnValue({ market_cap: 2000 });
      mockFundamentalsRepo.save.mockResolvedValue({});

      const result = await service.getSnapshot('AAPL');

      expect(result.source).toBe('finnhub');
      expect(finnhubService.getQuote).toHaveBeenCalledWith('AAPL');
      expect(mockOhlcvRepo.save).toHaveBeenCalled();
    });

    it('should use fallback data if Finnhub fails', async () => {
      const staleDate = new Date();
      staleDate.setMinutes(staleDate.getMinutes() - 20);
      const staleCandle = { close: 140, ts: staleDate };

      mockOhlcvRepo.findOne.mockResolvedValue(staleCandle);
      mockFundamentalsRepo.findOne.mockResolvedValue(null);

      mockFinnhubService.getQuote.mockRejectedValue(new Error('API Error'));

      const result = await service.getSnapshot('AAPL');

      expect(result.source).toBe('database'); // Fallback to DB
      expect(result.latestPrice).toEqual(staleCandle);
    });
  });

  describe('getHistory', () => {
    it('should return history data', async () => {
      const mockSymbol = { id: '1', symbol: 'AAPL' };
      tickersService.getTicker.mockResolvedValue(mockSymbol);
      mockOhlcvRepo.find.mockResolvedValue([]);

      const result = await service.getHistory(
        'AAPL',
        '1d',
        '2023-01-01',
        '2023-01-10',
      );
      expect(result).toEqual([]);
      expect(mockOhlcvRepo.find).toHaveBeenCalled();
    });
  });
});

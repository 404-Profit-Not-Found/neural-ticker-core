import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MarketDataService } from './market-data.service';
import { PriceOhlcv } from './entities/price-ohlcv.entity';
import { Fundamentals } from './entities/fundamentals.entity';
import { SymbolsService } from '../symbols/symbols.service';
import { FinnhubService } from '../finnhub/finnhub.service';

describe('MarketDataService', () => {
  let service: MarketDataService;
  let ohlcvRepo: any;
  let fundamentalsRepo: any;
  let symbolsService: any;
  let finnhubService: any;

  const mockOhlcvRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockFundamentalsRepo = {
    findOne: jest.fn(),
  };

  const mockSymbolsService = {
    getSymbol: jest.fn(),
  };

  const mockFinnhubService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketDataService,
        { provide: getRepositoryToken(PriceOhlcv), useValue: mockOhlcvRepo },
        { provide: getRepositoryToken(Fundamentals), useValue: mockFundamentalsRepo },
        { provide: SymbolsService, useValue: mockSymbolsService },
        { provide: FinnhubService, useValue: mockFinnhubService },
      ],
    }).compile();

    service = module.get<MarketDataService>(MarketDataService);
    ohlcvRepo = module.get(getRepositoryToken(PriceOhlcv));
    fundamentalsRepo = module.get(getRepositoryToken(Fundamentals));
    symbolsService = module.get(SymbolsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSnapshot', () => {
    it('should return snapshot data', async () => {
      const mockSymbol = { id: '1', symbol: 'AAPL' };
      const mockCandle = { close: 150 };
      const mockFund = { pe_ttm: 25 };

      symbolsService.getSymbol.mockResolvedValue(mockSymbol);
      ohlcvRepo.findOne.mockResolvedValue(mockCandle);
      fundamentalsRepo.findOne.mockResolvedValue(mockFund);

      const result = await service.getSnapshot('AAPL');
      expect(result).toEqual({
        symbol: mockSymbol,
        latestPrice: mockCandle,
        fundamentals: mockFund,
      });
    });
  });

  describe('getHistory', () => {
    it('should return history data', async () => {
        const mockSymbol = { id: '1', symbol: 'AAPL' };
        symbolsService.getSymbol.mockResolvedValue(mockSymbol);
        ohlcvRepo.find.mockResolvedValue([]);
        
        const result = await service.getHistory('AAPL', '1d', '2023-01-01', '2023-01-10');
        expect(result).toEqual([]);
        expect(ohlcvRepo.find).toHaveBeenCalled();
    });
  });
});

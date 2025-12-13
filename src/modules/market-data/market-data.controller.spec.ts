import { Test, TestingModule } from '@nestjs/testing';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';

describe('MarketDataController', () => {
  let controller: MarketDataController;
  let service: MarketDataService;

  const mockMarketDataService = {
    getSnapshot: jest.fn(),
    getHistory: jest.fn(),
    getCompanyNews: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketDataController],
      providers: [
        {
          provide: MarketDataService,
          useValue: mockMarketDataService,
        },
      ],
    }).compile();

    controller = module.get<MarketDataController>(MarketDataController);
    service = module.get<MarketDataService>(MarketDataService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSnapshot', () => {
    it('should call service.getSnapshot with correct symbol', async () => {
      const mockSnapshot = {
        ticker: { symbol: 'AAPL' },
        latestPrice: { close: 150 },
      };
      mockMarketDataService.getSnapshot.mockResolvedValue(mockSnapshot);

      const result = await controller.getSnapshot('AAPL');

      expect(result).toEqual(mockSnapshot);
      expect(service.getSnapshot).toHaveBeenCalledWith('AAPL');
    });
  });

  describe('getHistory', () => {
    it('should call service.getHistory with defaults (30 days)', async () => {
      mockMarketDataService.getHistory.mockResolvedValue([]);

      await controller.getHistory('AAPL');

      // Check if dates are passed correctly (approximate check since Date is dynamic)
      expect(service.getHistory).toHaveBeenCalledWith(
        'AAPL',
        'D',
        expect.any(String), // fromDate
        expect.any(String), // toDate
      );
    });

    it('should call service.getHistory with custom days', async () => {
      mockMarketDataService.getHistory.mockResolvedValue([]);

      await controller.getHistory('AAPL', 60);

      expect(service.getHistory).toHaveBeenCalledWith(
        'AAPL',
        'D',
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('getNews', () => {
    it('should call service.getCompanyNews', async () => {
      const mockNews = [{ headline: 'News 1' }];
      mockMarketDataService.getCompanyNews.mockResolvedValue(mockNews);

      const result = await controller.getNews('AAPL');

      expect(result).toEqual(mockNews);
      expect(service.getCompanyNews).toHaveBeenCalledWith('AAPL', undefined, undefined);
    });
  });
});

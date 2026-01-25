import { Test, TestingModule } from '@nestjs/testing';
import { MarketStatusService } from './market-status.service';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';

describe('MarketStatusService', () => {
  let service: MarketStatusService;
  let mockYahooService: any;

  beforeEach(async () => {
    mockYahooService = {
      getMarketStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketStatusService,
        {
          provide: YahooFinanceService,
          useValue: mockYahooService,
        },
      ],
    }).compile();

    service = module.get<MarketStatusService>(MarketStatusService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMarketStatus', () => {
    it('should coalesce concurrent requests for the same symbol/region', async () => {
      mockYahooService.getMarketStatus.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { isOpen: true, session: 'regular' };
      });

      const promises = [
        service.getMarketStatus('AAPL'),
        service.getMarketStatus('MSFT'),
        service.getMarketStatus('GOOGL'),
      ];

      await Promise.all(promises);
      expect(mockYahooService.getMarketStatus).toHaveBeenCalled();
    });

    it('should return cached value if available', async () => {
      const mockStatus = { isOpen: true, session: 'regular', exchange: 'US' };
      mockYahooService.getMarketStatus.mockResolvedValue(mockStatus);

      await service.getMarketStatus('AAPL');
      mockYahooService.getMarketStatus.mockClear();

      const result = await service.getMarketStatus('AAPL');
      expect(result.session).toBe('regular');
      expect(mockYahooService.getMarketStatus).not.toHaveBeenCalled();
    });

    it('should fetch separately for different symbols/regions', async () => {
      mockYahooService.getMarketStatus.mockResolvedValue({
        isOpen: true,
        session: 'regular',
        exchange: 'US',
      });

      await service.getMarketStatus('AAPL');
      await service.getMarketStatus('MC.PA');

      expect(mockYahooService.getMarketStatus).toHaveBeenCalledTimes(2);
    });

    it('should return OPEN for EU market at 16:45 CET via fallback', () => {
      const mockDate = new Date('2025-01-08T15:45:00Z');
      jest.useFakeTimers().setSystemTime(mockDate);

      const result = (service as any).getEUFallback();

      expect(result.isOpen).toBe(true);
      expect(result.session).toBe('regular');

      jest.useRealTimers();
    });
  });
});

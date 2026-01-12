import { Test, TestingModule } from '@nestjs/testing';
import { MarketStatusService } from './market-status.service';
import { FinnhubService } from '../finnhub/finnhub.service';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';

describe('MarketStatusService', () => {
  let service: MarketStatusService;
  let finnhubService: FinnhubService;
  let yahooService: YahooFinanceService;

  const mockFinnhubService = {
    getMarketStatus: jest.fn(),
  };

  const mockYahooService = {
    getMarketStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketStatusService,
        {
          provide: FinnhubService,
          useValue: mockFinnhubService,
        },
        {
          provide: YahooFinanceService,
          useValue: mockYahooService,
        },
      ],
    }).compile();

    service = module.get<MarketStatusService>(MarketStatusService);
    finnhubService = module.get<FinnhubService>(FinnhubService);
    yahooService = module.get<YahooFinanceService>(YahooFinanceService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMarketStatus', () => {
    it('should coalesce concurrent requests for the same symbol/region', async () => {
      mockFinnhubService.getMarketStatus.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50)); // Delay to allow concurrency
        return { isOpen: true, session: 'regular' };
      });

      // Launch 5 concurrent requests for US market (AAPL)
      const promises = [
        service.getMarketStatus('AAPL'),
        service.getMarketStatus('MSFT'), // Should map to same 'US' region logic if optimized
        service.getMarketStatus('GOOGL'),
        service.getMarketStatus('TSLA'),
        service.getMarketStatus('NVDA'),
      ];

      await Promise.all(promises);

      // Verify that Finnhub was called ONLY ONCE for the 'US' region
      // Note: The service maps symbols to regions. 'AAPL' -> 'US'.
      // If the service coalesces based on REGION, it should be 1 call.
      // If it coalesces based on SYMBOL, it would be 5 calls.
      // My implementation coalesces based on REGION for Finnhub status calls.

      expect(finnhubService.getMarketStatus).toHaveBeenCalledTimes(1);
    });

    it('should return cached value if available', async () => {
      const mockStatus = { isOpen: true, session: 'regular', exchange: 'US' };
      // First call (cache miss)
      mockFinnhubService.getMarketStatus.mockResolvedValue(mockStatus);

      // We need to spy on the private cache or just verify the service call
      // effectively, the service uses a local method cache or property.
      // MarketStatusService uses `this.statusCache` Map, not the injected CacheModule.

      // Call 1
      const result1 = await service.getMarketStatus('AAPL');
      expect(result1.session).toBe('regular');
      expect(finnhubService.getMarketStatus).toHaveBeenCalledTimes(1);

      // Call 2 (should be cached)
      mockFinnhubService.getMarketStatus.mockClear();
      const result2 = await service.getMarketStatus('AAPL');
      expect(result2.session).toBe('regular');
      expect(finnhubService.getMarketStatus).not.toHaveBeenCalled();
    });

    it('should fetch separately for different regions', async () => {
      mockFinnhubService.getMarketStatus.mockResolvedValue({
        isOpen: true,
        session: 'regular',
        exchange: 'US',
      });
      mockYahooService.getMarketStatus.mockResolvedValue({
        isOpen: false,
        session: 'closed',
        exchange: 'EU',
      });

      // US Call
      await service.getMarketStatus('AAPL');

      // EU Call (e.g. LVMH.PA)
      // Assume getRegion maps .PA to EU or similar.
      // Logic: if (symbol.includes('.')) -> return yahoo status (which might map to region key)
      await service.getMarketStatus('MC.PA');

      expect(finnhubService.getMarketStatus).toHaveBeenCalled(); // For US
      // For EU/Other, it uses Yahoo
      expect(yahooService.getMarketStatus).toHaveBeenCalled();
    });

    it('should return OPEN for EU market at 16:45 CET via fallback', () => {
      // Mock Date to 2025-01-08T15:45:00Z (Wednesday)
      // Winter time: CET = UTC+1. So 15:45 UTC = 16:45 CET.
      const mockDate = new Date('2025-01-08T15:45:00Z');
      jest.useFakeTimers().setSystemTime(mockDate);

      // Access private method by casting to any or testing via public API if possible.
      // Since we want to test fallback logic specifically, we can use the private method reference
      // if we cast service to any.
      const result = (service as any).getEUFallback();

      expect(result.isOpen).toBe(true);
      expect(result.session).toBe('regular');

      jest.useRealTimers();
    });
  });
});

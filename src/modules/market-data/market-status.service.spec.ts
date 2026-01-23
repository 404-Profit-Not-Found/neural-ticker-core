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
      mockYahooService.getMarketStatus.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50)); // Delay to allow concurrency
        return { isOpen: true, session: 'regular', exchange: 'US' };
      });

      // Launch 5 concurrent requests for US market (AAPL)
      const promises = [
        service.getMarketStatus('AAPL'),
        service.getMarketStatus('MSFT'),
        service.getMarketStatus('GOOGL'),
        service.getMarketStatus('TSLA'),
        service.getMarketStatus('NVDA'),
      ];

      await Promise.all(promises);

      // Verify that Yahoo was called ONLY ONCE for the 'US' region (using proxy ^GSPC)
      expect(yahooService.getMarketStatus).toHaveBeenCalledTimes(1);
      expect(yahooService.getMarketStatus).toHaveBeenCalledWith('^GSPC');
      expect(finnhubService.getMarketStatus).not.toHaveBeenCalled();
    });

    it('should return cached value if available', async () => {
      const mockStatus = { isOpen: true, session: 'regular', exchange: 'US' };
      // First call (cache miss)
      mockYahooService.getMarketStatus.mockResolvedValue(mockStatus);

      // Call 1
      const result1 = await service.getMarketStatus('AAPL');
      expect(result1.session).toBe('regular');
      expect(yahooService.getMarketStatus).toHaveBeenCalledTimes(1);

      // Call 2 (should be cached)
      mockYahooService.getMarketStatus.mockClear();
      const result2 = await service.getMarketStatus('AAPL');
      expect(result2.session).toBe('regular');
      expect(yahooService.getMarketStatus).not.toHaveBeenCalled();
    });

    it('should fetch separately for different regions', async () => {
      mockYahooService.getMarketStatus.mockImplementation((symbol) => {
        if (symbol === '^GSPC') {
          return { isOpen: true, session: 'regular', exchange: 'US' };
        }
        return { isOpen: false, session: 'closed', exchange: 'EU' };
      });

      // US Call
      await service.getMarketStatus('AAPL');

      // EU Call (e.g. LVMH.PA)
      await service.getMarketStatus('MC.PA');

      expect(yahooService.getMarketStatus).toHaveBeenCalledWith('^GSPC'); // For US
      // For EU/Other, it uses Yahoo with passed symbol
      expect(yahooService.getMarketStatus).toHaveBeenCalledWith('MC.PA');
    });

    it('should return OPEN for EU market at 16:45 CET via fallback', () => {
      // Mock Date to 2025-01-08T15:45:00Z (Wednesday)
      // Winter time: CET = UTC+1. So 15:45 UTC = 16:45 CET.
      const mockDate = new Date('2025-01-08T15:45:00Z');
      jest.useFakeTimers().setSystemTime(mockDate);

      const result = (service as any).getEUFallback();

      expect(result.isOpen).toBe(true);
      expect(result.session).toBe('regular');

      jest.useRealTimers();
    });

    it('should default to Yahoo Finance (^GSPC) for US status', async () => {
      mockYahooService.getMarketStatus.mockResolvedValue({
        isOpen: true,
        session: 'regular',
        exchange: 'US',
      });

      const result = await service.getMarketStatus('AAPL');

      expect(finnhubService.getMarketStatus).not.toHaveBeenCalled();
      expect(yahooService.getMarketStatus).toHaveBeenCalledWith('^GSPC');
      expect(result.isOpen).toBe(true);
    });

    it('should use Yahoo Finance proxy (^HSI) for ASIA region', async () => {
      mockYahooService.getMarketStatus.mockResolvedValue({
        isOpen: true,
        session: 'regular',
        exchange: 'ASIA',
      });

      const result = await service.getMarketStatus(undefined, 'ASIA');

      expect(yahooService.getMarketStatus).toHaveBeenCalledWith('^HSI');
      expect(result.region).toBe('ASIA');
      expect(result.isOpen).toBe(true);
    });

    it('should use Yahoo Finance proxy (^STOXX50E) for EU region when no symbol provided', async () => {
      mockYahooService.getMarketStatus.mockResolvedValue({
        isOpen: true,
        session: 'regular',
        exchange: 'EU',
      });

      const result = await service.getMarketStatus(undefined, 'EU');

      expect(yahooService.getMarketStatus).toHaveBeenCalledWith('^STOXX50E');
      expect(result.region).toBe('EU');
      expect(result.isOpen).toBe(true);
    });

    it('should use Yahoo Finance proxy (^HSI) for ASIA region', async () => {
      mockYahooService.getMarketStatus.mockResolvedValue({
        isOpen: true,
        session: 'regular',
        exchange: 'ASIA',
      });

      const result = await service.getMarketStatus(undefined, 'ASIA');

      expect(yahooService.getMarketStatus).toHaveBeenCalledWith('^HSI');
      expect(result.region).toBe('ASIA');
      expect(result.isOpen).toBe(true);
    });

    it('should use Yahoo Finance proxy (^STOXX50E) for EU region when no symbol provided', async () => {
      mockYahooService.getMarketStatus.mockResolvedValue({
        isOpen: true,
        session: 'regular',
        exchange: 'EU',
      });

      const result = await service.getMarketStatus(undefined, 'EU');

      expect(yahooService.getMarketStatus).toHaveBeenCalledWith('^STOXX50E');
      expect(result.region).toBe('EU');
      expect(result.isOpen).toBe(true);
    });
  });
});

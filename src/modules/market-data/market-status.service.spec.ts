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
      // Set to a weekday (Wed Jan 08 2025) to bypass weekend short-circuit
      jest.useFakeTimers().setSystemTime(new Date('2025-01-08T10:00:00Z'));

      mockYahooService.getMarketStatus.mockImplementation(() => {
        // Since we are using fake timers, this promise will never resolve unless we advance timers
        // However, we can't advance timers while awaiting... deadlock.
        // Solution: Don't use real setTimeout with fake timers if we can't control it easily from outside.
        // OR: Just return immediate value for this test since we test coalescing logic (mock is called once).
        return Promise.resolve({ isOpen: true, session: 'regular' });
      });

      const promises = [
        service.getMarketStatus('AAPL'),
        service.getMarketStatus('MSFT'), // Mapped to US region
        service.getMarketStatus('GOOGL'),
      ];

      // We don't need artificial delay with fake timers to test coalescing if the calls happen synchronously in the event loop tick.
      // The service implementation awaits the promise creation.

      await Promise.all(promises);
      expect(mockYahooService.getMarketStatus).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('should return cached value if available', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2025-01-08T10:00:00Z'));

      const mockStatus = { isOpen: true, session: 'regular', exchange: 'US' };
      // Simulate region resolution
      mockYahooService.getMarketStatus.mockResolvedValue(mockStatus);

      await service.getMarketStatus('AAPL');
      mockYahooService.getMarketStatus.mockClear();

      const result = await service.getMarketStatus('AAPL');
      expect(result.session).toBe('regular');
      expect(mockYahooService.getMarketStatus).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should fetch separately for different symbols/regions', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2025-01-08T10:00:00Z'));

      mockYahooService.getMarketStatus.mockResolvedValue({
        isOpen: true,
        session: 'regular',
        exchange: 'US',
      });

      await service.getMarketStatus('AAPL');
      await service.getMarketStatus('MC.PA');

      expect(mockYahooService.getMarketStatus).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
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

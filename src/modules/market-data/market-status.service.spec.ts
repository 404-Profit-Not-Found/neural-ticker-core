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

  describe('getRegion', () => {
    it.each([
      // Exchange suffix = the part after the last dot.
      ['SAP.DE', 'EU'],
      ['ASML.AS', 'EU'],
      ['VOLV-B.ST', 'EU'], // hyphen = share class, dot = venue
      ['MC.PA', 'EU'],
      ['BARC.L', 'EU'],
      ['7203.T', 'OTHER'], // Tokyo: a venue, but neither EU nor US
      ['SHOP.TO', 'OTHER'],
      // US share classes: a dot that is not a venue.
      ['BRK.A', 'US'],
      ['BRK.B', 'US'],
      // US symbols that merely CONTAIN a two-letter EU code.
      ['COIN', 'US'], // "CO"
      ['SMCI', 'US'], // "MC", "MI"
      ['COST', 'US'], // "CO", "ST"
      ['ASML', 'US'], // "AS" — the NASDAQ listing, no suffix
      ['PANW', 'US'], // "PA"
      ['HES', 'US'], // "HE"
      ['AAPL', 'US'],
    ])('classifies %s as %s', (symbol, region) => {
      expect(service.getRegion(symbol)).toBe(region);
      // getMarketStatus() passes 'US' when the caller has no exchange.
      expect(service.getRegion(symbol, 'US')).toBe(region);
    });

    it.each([
      ['AAPL', 'NASDAQ NMS - GLOBAL MARKET'], // "NASDAQ" contains "AS"
      ['COIN', 'NasdaqGS'],
      ['IBM', 'NEW YORK STOCK EXCHANGE, INC.'], // "STOCK" contains "ST"
      ['BRK.B', 'NEW YORK STOCK EXCHANGE, INC.'],
      ['BRK.A', 'NYSE'],
    ])(
      'does not read EU codes out of a US exchange name (%s on %s)',
      (symbol, exchange) => {
        expect(service.getRegion(symbol, exchange)).toBe('US');
      },
    );

    it('falls back to the exchange CODE when the symbol has no suffix', () => {
      expect(service.getRegion('SAP', 'XETRA')).toBe('EU');
      expect(service.getRegion('BARC', 'LSE')).toBe('EU');
      expect(service.getRegion('ASML', 'AS')).toBe('EU');
    });

    it('lets the symbol suffix win over the exchange field', () => {
      expect(service.getRegion('SAP.DE', 'NASDAQ')).toBe('EU');
      expect(service.getRegion('7203.T', 'XETRA')).toBe('OTHER');
    });

    it('keeps an unknown multi-letter suffix out of the US bucket', () => {
      expect(service.getRegion('BBCA.JK')).toBe('OTHER');
      expect(service.getRegion('BBCA.JK', 'NYSE')).toBe('US');
    });

    it('is case-insensitive', () => {
      expect(service.getRegion('sap.de')).toBe('EU');
      expect(service.getRegion('coin')).toBe('US');
    });
  });

  describe('getMarketStatus', () => {
    it('does not let COIN / BRK.B share (and poison) the EU status cache', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2025-01-08T10:00:00Z'));
      mockYahooService.getMarketStatus.mockImplementation((symbol: string) =>
        Promise.resolve({
          isOpen: symbol === 'SAP.DE',
          session: symbol === 'SAP.DE' ? 'regular' : 'pre',
          timezone: symbol === 'SAP.DE' ? 'Europe/Berlin' : 'America/New_York',
          exchange: symbol === 'SAP.DE' ? 'GER' : 'NMS',
        }),
      );

      const eu = await service.getMarketStatus('SAP.DE');
      const coin = await service.getMarketStatus('COIN');
      const brk = await service.getMarketStatus('BRK.B');

      expect(eu.region).toBe('EU');
      expect(eu.isOpen).toBe(true);
      // Previously COIN / BRK.B resolved to region EU and were served SAP.DE's
      // cached "open" status (the cache is keyed by region).
      expect(coin.region).toBe('US');
      expect(coin.isOpen).toBe(false);
      expect(brk.region).toBe('US');
      expect(brk.isOpen).toBe(false);

      jest.useRealTimers();
    });

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

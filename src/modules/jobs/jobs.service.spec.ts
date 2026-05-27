import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JobsService } from './jobs.service';
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { TickersService } from '../tickers/tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { MarketStatusService } from '../market-data/market-status.service';
import { ResearchService } from '../research/research.service';
import { StockTwitsService } from '../stocktwits/stocktwits.service';
import { RequestQueue } from './entities/request-queue.entity';
import { PortfolioService } from '../portfolio/portfolio.service';

describe('JobsService', () => {
  let service: JobsService;

  const mockRiskRewardService = {
    evaluateSymbol: jest.fn(),
    getLatestScore: jest.fn(),
  };

  const mockTickersService = {
    getAllTickers: jest.fn(),
    ensureTicker: jest.fn(),
  };

  const mockMarketDataService = {
    getSnapshot: jest.fn(),
    getHistory: jest.fn().mockResolvedValue([]),
    syncTickerHistory: jest.fn().mockResolvedValue(undefined),
    dedupeAnalystRatings: jest.fn().mockResolvedValue({ removed: 0 }),
    pickStaleSnapshotTickers: jest.fn(),
  };

  const mockResearchService = {
    failStuckTickets: jest.fn(),
    createResearchTicket: jest.fn(),
    processTicket: jest.fn(),
    getOrGenerateDailyDigest: jest.fn(),
    reprocessFinancials: jest.fn(),
  };

  const mockRequestQueueRepo = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockMarketStatusService = {
    getAllMarketsStatus: jest.fn().mockResolvedValue({
      us: { isOpen: true, session: 'regular' },
      eu: { isOpen: true, session: 'regular' },
    }),
    getMarketStatus: jest
      .fn()
      .mockResolvedValue({ isOpen: true, session: 'regular' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: RiskRewardService, useValue: mockRiskRewardService },
        { provide: TickersService, useValue: mockTickersService },
        { provide: MarketDataService, useValue: mockMarketDataService },
        { provide: MarketStatusService, useValue: mockMarketStatusService },
        { provide: ResearchService, useValue: mockResearchService },
        { provide: StockTwitsService, useValue: {} },

        {
          provide: getRepositoryToken(RequestQueue),
          useValue: mockRequestQueueRepo,
        },
        {
          provide: PortfolioService,
          useValue: {
            updateActivePortfolios: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(24) },
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('syncDailyCandles', () => {
    it('should iterate tickers and sync candles', async () => {
      const tickers = [{ symbol: 'AAPL' }, { symbol: 'TSLA' }];
      mockTickersService.getAllTickers.mockResolvedValue(tickers);
      mockMarketDataService.getSnapshot.mockResolvedValue({});

      await service.syncDailyCandles();

      expect(mockTickersService.getAllTickers).toHaveBeenCalled();
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledTimes(2);
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('AAPL');
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('TSLA');
    });

    it('should handle errors gracefully for individual symbols', async () => {
      const tickers = [{ symbol: 'AAPL' }, { symbol: 'FAIL' }];
      mockTickersService.getAllTickers.mockResolvedValue(tickers);
      mockMarketDataService.getSnapshot.mockResolvedValueOnce({});
      mockMarketDataService.getSnapshot.mockRejectedValueOnce(
        new Error('Sync failed'),
      );

      await service.syncDailyCandles();

      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledTimes(2);
      // Should not throw
    });

    it('should handle global errors', async () => {
      mockTickersService.getAllTickers.mockRejectedValue(
        new Error('Global fail'),
      );
      await expect(service.syncDailyCandles()).rejects.toThrow('Global fail');
    });

    it('should skip tickers without symbol', async () => {
      const tickers = [{ no_symbol: '?' }];
      mockTickersService.getAllTickers.mockResolvedValue(tickers);
      await service.syncDailyCandles();
      expect(mockMarketDataService.getSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('syncSnapshots (batched)', () => {
    let sleepSpy: jest.SpyInstance;

    beforeEach(() => {
      sleepSpy = jest
        .spyOn(global, 'setTimeout')
        // Resolve immediately to keep the test fast
        .mockImplementation((callback: any) => {
          callback();
          return {} as NodeJS.Timeout;
        });
    });

    afterEach(() => {
      sleepSpy.mockRestore();
    });

    it('returns skipped:true when all markets are closed', async () => {
      mockMarketStatusService.getAllMarketsStatus.mockResolvedValueOnce({
        us: { isOpen: false, session: 'closed' },
        eu: { isOpen: false, session: 'closed' },
      });

      const result = await service.syncSnapshots();

      expect(result).toMatchObject({ skipped: true });
      expect(
        mockMarketDataService.pickStaleSnapshotTickers,
      ).not.toHaveBeenCalled();
    });

    it('asks market-data for the stale-first batch and syncs only those', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'TSLA' },
        { symbol: 'MSFT' },
      ]);
      // Picker returns just two of the three — the batch limit in effect.
      mockMarketDataService.pickStaleSnapshotTickers.mockResolvedValue([
        'MSFT',
        'AAPL',
      ]);
      mockMarketDataService.getSnapshot.mockResolvedValue({});

      const result = await service.syncSnapshots();

      expect(
        mockMarketDataService.pickStaleSnapshotTickers,
      ).toHaveBeenCalledWith(
        ['AAPL', 'TSLA', 'MSFT'],
        JobsService.SNAPSHOTS_BATCH_SIZE,
      );
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledTimes(2);
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('MSFT');
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('AAPL');
      expect(mockMarketDataService.getSnapshot).not.toHaveBeenCalledWith(
        'TSLA',
      );
      expect(result).toMatchObject({
        success: 2,
        failed: 0,
        batchSize: 2,
        skipped: false,
      });
    });

    it('skips a batch ticker whose own market is closed without failing the batch', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL', exchange: 'US' },
        { symbol: 'SAP', exchange: 'EU' },
      ]);
      mockMarketDataService.pickStaleSnapshotTickers.mockResolvedValue([
        'AAPL',
        'SAP',
      ]);
      mockMarketStatusService.getMarketStatus
        .mockResolvedValueOnce({ isOpen: true, session: 'regular' })
        .mockResolvedValueOnce({ isOpen: false, session: 'closed' });
      mockMarketDataService.getSnapshot.mockResolvedValue({});

      const result = await service.syncSnapshots();

      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledTimes(1);
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('AAPL');
      expect(result).toMatchObject({
        success: 1,
        failed: 0,
        skippedMarketClosed: 1,
        batchSize: 2,
      });
    });

    it('counts per-ticker errors without aborting the rest of the batch', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'BAD' },
      ]);
      mockMarketDataService.pickStaleSnapshotTickers.mockResolvedValue([
        'AAPL',
        'BAD',
      ]);
      mockMarketDataService.getSnapshot
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('finnhub 500'));

      const result = await service.syncSnapshots();

      expect(result).toMatchObject({
        success: 1,
        failed: 1,
        batchSize: 2,
      });
    });
  });

  describe('runRiskRewardScanner', () => {
    it('should queue research for tickers with stale or missing analysis', async () => {
      const sleepSpy = jest
        .spyOn(global, 'setTimeout')
        // Resolve immediately to keep the test fast
        .mockImplementation((callback: any) => {
          callback();
          return {} as NodeJS.Timeout;
        });

      const tickers = [{ symbol: 'AAPL' }];
      mockTickersService.getAllTickers.mockResolvedValue(tickers);
      mockRiskRewardService.getLatestScore.mockResolvedValue(null);
      mockResearchService.createResearchTicket.mockResolvedValue({
        id: 'note-1',
      });
      mockResearchService.processTicket.mockResolvedValue(undefined);

      await service.runRiskRewardScanner();

      expect(mockTickersService.getAllTickers).toHaveBeenCalled();
      expect(mockRiskRewardService.getLatestScore).toHaveBeenCalledWith('AAPL');
      expect(mockResearchService.createResearchTicket).toHaveBeenCalled();
      expect(mockResearchService.processTicket).toHaveBeenCalledWith('note-1');

      sleepSpy.mockRestore();
    });
  });
});

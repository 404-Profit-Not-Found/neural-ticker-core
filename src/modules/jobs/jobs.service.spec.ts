import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JobsService } from './jobs.service';
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { TickersService } from '../tickers/tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { ResearchService } from '../research/research.service';
import { RequestQueue } from './entities/request-queue.entity';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: RiskRewardService, useValue: mockRiskRewardService },
        { provide: TickersService, useValue: mockTickersService },
        { provide: MarketDataService, useValue: mockMarketDataService },
        { provide: ResearchService, useValue: mockResearchService },

        {
          provide: getRepositoryToken(RequestQueue),
          useValue: mockRequestQueueRepo,
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
      await service.syncDailyCandles();
      // Should catch and log
    });

    it('should skip tickers without symbol', async () => {
      const tickers = [{ no_symbol: '?' }];
      mockTickersService.getAllTickers.mockResolvedValue(tickers);
      await service.syncDailyCandles();
      expect(mockMarketDataService.getSnapshot).not.toHaveBeenCalled();
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

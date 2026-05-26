import { Test, TestingModule } from '@nestjs/testing';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { MarketDataService } from '../market-data/market-data.service';

describe('JobsController', () => {
  let controller: JobsController;

  const mockJobsService = {
    syncDailyCandles: jest.fn(),
    syncSnapshots: jest.fn(),
    runRiskRewardScanner: jest.fn(),
    cleanupStuckResearch: jest.fn(),
    syncResearchAndRatings: jest.fn(),
    runDailyDigest: jest.fn(),
    processPendingRequests: jest.fn(),
  };

  const mockMarketDataService = {
    refreshTopPicks: jest.fn(),
    updateActivePortfolios: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        { provide: JobsService, useValue: mockJobsService },
        { provide: MarketDataService, useValue: mockMarketDataService },
      ],
    }).compile();

    controller = module.get<JobsController>(JobsController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('syncDailyCandles', () => {
    it('completes sync and returns success message', async () => {
      mockJobsService.syncDailyCandles.mockResolvedValue(undefined);

      const result = await controller.syncDailyCandles();

      expect(result).toEqual({ message: 'Daily candle sync completed' });
      expect(mockJobsService.syncDailyCandles).toHaveBeenCalled();
    });
  });

  describe('syncSnapshots', () => {
    it('returns stats from service', async () => {
      const stats = { updated: 12, skipped: 3 };
      mockJobsService.syncSnapshots.mockResolvedValue(stats);

      const result = await controller.syncSnapshots();

      expect(result).toEqual({ message: 'Snapshot sync completed', stats });
      expect(mockJobsService.syncSnapshots).toHaveBeenCalled();
    });
  });

  describe('runRiskRewardScanner', () => {
    it('queues scanner and returns immediately (fire-and-forget)', () => {
      mockJobsService.runRiskRewardScanner.mockResolvedValue(undefined);

      const result = controller.runRiskRewardScanner();

      expect(result).toEqual({ message: 'Risk/Reward scanner queued' });
      expect(mockJobsService.runRiskRewardScanner).toHaveBeenCalled();
    });

    it('does not throw when background scan rejects', async () => {
      mockJobsService.runRiskRewardScanner.mockRejectedValue(new Error('boom'));

      const result = controller.runRiskRewardScanner();
      expect(result).toEqual({ message: 'Risk/Reward scanner queued' });
      // Allow the rejected promise's catch handler to run.
      await new Promise((resolve) => setImmediate(resolve));
    });
  });

  describe('cleanupResearch', () => {
    it('returns cleanup stats', async () => {
      const stats = { markedFailed: 5 };
      mockJobsService.cleanupStuckResearch.mockResolvedValue(stats);

      const result = await controller.cleanupResearch();

      expect(result).toEqual({ message: 'Cleanup completed', stats });
      expect(mockJobsService.cleanupStuckResearch).toHaveBeenCalled();
    });
  });

  describe('syncResearch', () => {
    it('forwards symbol to service and merges result', async () => {
      const serviceResult = { research: 'ok', ratings: 'ok' };
      mockJobsService.syncResearchAndRatings.mockResolvedValue(serviceResult);

      const result = await controller.syncResearch('AAPL');

      expect(result).toEqual({ message: 'Sync completed', ...serviceResult });
      expect(mockJobsService.syncResearchAndRatings).toHaveBeenCalledWith(
        'AAPL',
      );
    });
  });

  describe('runDailyDigest', () => {
    it('triggers digest and returns success message', async () => {
      mockJobsService.runDailyDigest.mockResolvedValue(undefined);

      const result = await controller.runDailyDigest();

      expect(result).toEqual({ message: 'Daily digest generation triggered' });
      expect(mockJobsService.runDailyDigest).toHaveBeenCalled();
    });
  });

  describe('processPendingRequests', () => {
    it('triggers processing and returns success message', async () => {
      mockJobsService.processPendingRequests.mockResolvedValue(undefined);

      const result = await controller.processPendingRequests();

      expect(result).toEqual({
        message: 'Pending requests processing triggered',
      });
      expect(mockJobsService.processPendingRequests).toHaveBeenCalled();
    });
  });

  describe('refreshTopPicks', () => {
    it('delegates to MarketDataService.refreshTopPicks', async () => {
      mockMarketDataService.refreshTopPicks.mockResolvedValue(undefined);

      const result = await controller.refreshTopPicks();

      expect(result).toEqual({ message: 'Top Picks refresh triggered' });
      expect(mockMarketDataService.refreshTopPicks).toHaveBeenCalled();
    });
  });

  describe('refreshPortfolios', () => {
    it('delegates to MarketDataService.updateActivePortfolios', async () => {
      mockMarketDataService.updateActivePortfolios.mockResolvedValue(undefined);

      const result = await controller.refreshPortfolios();

      expect(result).toEqual({ message: 'Portfolio refresh triggered' });
      expect(mockMarketDataService.updateActivePortfolios).toHaveBeenCalled();
    });
  });
});

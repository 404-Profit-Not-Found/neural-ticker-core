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
    // The scan must run inside the request: Cloud Run throttles CPU and may
    // stop the instance once the response has been sent.
    it('waits for the scan and returns its stats', async () => {
      let finished = false;
      mockJobsService.runRiskRewardScanner.mockImplementation(async () => {
        await new Promise((resolve) => setImmediate(resolve));
        finished = true;
        return { processed: 3, errors: 0, due: 3 };
      });

      const result = await controller.runRiskRewardScanner();

      expect(finished).toBe(true);
      expect(result).toEqual({
        message: 'Risk/Reward scan completed',
        stats: { processed: 3, errors: 0, due: 3 },
      });
    });

    it('surfaces a failed scan to the caller instead of swallowing it', async () => {
      mockJobsService.runRiskRewardScanner.mockRejectedValue(new Error('boom'));

      await expect(controller.runRiskRewardScanner()).rejects.toThrow('boom');
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

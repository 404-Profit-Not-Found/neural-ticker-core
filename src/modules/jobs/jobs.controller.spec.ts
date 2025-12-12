import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

describe('JobsController', () => {
  let controller: JobsController;

  const mockJobsService = {
    syncDailyCandles: jest.fn(),
    runRiskRewardScanner: jest.fn(),
    cleanupStuckResearch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: mockJobsService,
        },
      ],
    }).compile();

    controller = module.get<JobsController>(JobsController);
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('syncDailyCandles', () => {
    it('should complete sync with valid secret', async () => {
      mockJobsService.syncDailyCandles.mockResolvedValue(undefined);

      const result = await controller.syncDailyCandles('test-secret');

      expect(result).toEqual({ message: 'Daily candle sync completed' });
      expect(mockJobsService.syncDailyCandles).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with invalid secret', async () => {
      await expect(controller.syncDailyCandles('wrong-secret')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('runRiskRewardScanner', () => {
    it('should complete scan with valid secret', async () => {
      mockJobsService.runRiskRewardScanner.mockResolvedValue(undefined);

      const result = await controller.runRiskRewardScanner('test-secret');

      expect(result).toEqual({ message: 'Risk/Reward scanner completed' });
      expect(mockJobsService.runRiskRewardScanner).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with invalid secret', async () => {
      await expect(controller.runRiskRewardScanner('wrong-secret')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('cleanupResearch', () => {
    it('should complete cleanup with valid secret', async () => {
      const stats = { markedFailed: 5 };
      mockJobsService.cleanupStuckResearch.mockResolvedValue(stats);

      const result = await controller.cleanupResearch('test-secret');

      expect(result).toEqual({ message: 'Cleanup completed', stats });
      expect(mockJobsService.cleanupStuckResearch).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with invalid secret', async () => {
      await expect(controller.cleanupResearch('wrong-secret')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

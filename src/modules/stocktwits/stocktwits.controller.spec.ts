import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { StockTwitsController } from './stocktwits.controller';
import { StockTwitsService } from './stocktwits.service';

describe('StockTwitsController', () => {
  let controller: StockTwitsController;

  const mockStockTwitsService = {
    getPosts: jest.fn(),
    getWatchersHistory: jest.fn(),
    fetchAndStorePosts: jest.fn(),
    trackWatchers: jest.fn(),
    handleHourlyPostsSync: jest.fn(),
    handleDailyWatchersSync: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockTwitsController],
      providers: [
        {
          provide: StockTwitsService,
          useValue: mockStockTwitsService,
        },
      ],
    }).compile();

    controller = module.get<StockTwitsController>(StockTwitsController);
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPosts', () => {
    it('should return paginated posts', async () => {
      const mockPosts = { data: [{ id: '1' }], total: 1, page: 1, limit: 50 };
      mockStockTwitsService.getPosts.mockResolvedValue(mockPosts);

      const result = await controller.getPosts('AAPL', 1, 50);

      expect(result).toEqual(mockPosts);
      expect(mockStockTwitsService.getPosts).toHaveBeenCalledWith('AAPL', 1, 50);
    });
  });

  describe('getWatchersHistory', () => {
    it('should return watcher history', async () => {
      const mockHistory = [{ symbol: 'AAPL', count: 100 }];
      mockStockTwitsService.getWatchersHistory.mockResolvedValue(mockHistory);

      const result = await controller.getWatchersHistory('AAPL');

      expect(result).toEqual(mockHistory);
      expect(mockStockTwitsService.getWatchersHistory).toHaveBeenCalledWith('AAPL');
    });
  });

  describe('triggerSync', () => {
    it('should trigger sync and return success message', async () => {
      mockStockTwitsService.fetchAndStorePosts.mockResolvedValue(undefined);
      mockStockTwitsService.trackWatchers.mockResolvedValue(undefined);

      const result = await controller.triggerSync('AAPL');

      expect(result).toEqual({ message: 'Sync triggered successfully' });
      expect(mockStockTwitsService.fetchAndStorePosts).toHaveBeenCalledWith('AAPL');
      expect(mockStockTwitsService.trackWatchers).toHaveBeenCalledWith('AAPL');
    });
  });

  describe('handleHourlyPostsSync', () => {
    it('should complete hourly sync with valid secret', async () => {
      mockStockTwitsService.handleHourlyPostsSync.mockResolvedValue(undefined);

      const result = await controller.handleHourlyPostsSync('test-secret');

      expect(result).toEqual({ message: 'Hourly posts sync completed' });
      expect(mockStockTwitsService.handleHourlyPostsSync).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with invalid secret', async () => {
      await expect(controller.handleHourlyPostsSync('wrong-secret')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('handleDailyWatchersSync', () => {
    it('should complete daily sync with valid secret', async () => {
      mockStockTwitsService.handleDailyWatchersSync.mockResolvedValue(undefined);

      const result = await controller.handleDailyWatchersSync('test-secret');

      expect(result).toEqual({ message: 'Daily watchers sync completed' });
      expect(mockStockTwitsService.handleDailyWatchersSync).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with invalid secret', async () => {
      await expect(controller.handleDailyWatchersSync('wrong-secret')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

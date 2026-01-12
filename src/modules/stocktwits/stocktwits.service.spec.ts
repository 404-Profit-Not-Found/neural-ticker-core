import { Test, TestingModule } from '@nestjs/testing';
import { StockTwitsService } from './stocktwits.service';
import { HttpService } from '@nestjs/axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StockTwitsPost } from './entities/stocktwits-post.entity';
import { StockTwitsWatcher } from './entities/stocktwits-watcher.entity';
import { TickersService } from '../tickers/tickers.service';
import { of, throwError } from 'rxjs';

describe('StockTwitsService', () => {
  let service: StockTwitsService;
  let httpService: HttpService;
  let postsRepo: any;
  let watchersRepo: any;

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockPostsRepo = {
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
  };

  const mockWatchersRepo = {
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockTickersService = {
    getAllTickers: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockTwitsService,
        { provide: HttpService, useValue: mockHttpService },
        {
          provide: getRepositoryToken(StockTwitsPost),
          useValue: mockPostsRepo,
        },
        {
          provide: getRepositoryToken(StockTwitsWatcher),
          useValue: mockWatchersRepo,
        },
        { provide: TickersService, useValue: mockTickersService },
      ],
    }).compile();

    service = module.get<StockTwitsService>(StockTwitsService);
    httpService = module.get<HttpService>(HttpService);
    postsRepo = module.get(getRepositoryToken(StockTwitsPost));
    watchersRepo = module.get(getRepositoryToken(StockTwitsWatcher));

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('fetchAndStorePosts', () => {
    it('should fetch and store new posts', async () => {
      const symbol = 'AAPL';
      const mockResponse = {
        data: {
          messages: [
            {
              id: 101,
              body: 'Bullish!',
              user: { username: 'trader1', followers: 100 },
              created_at: '2023-01-01T10:00:00Z',
              likes: { total: 5 },
            },
          ],
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));
      mockPostsRepo.findOne.mockResolvedValue(null);

      await service.fetchAndStorePosts(symbol);

      expect(httpService.get).toHaveBeenCalledWith(
        `https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`,
      );
      expect(postsRepo.findOne).toHaveBeenCalledWith({ where: { id: 101 } });
      expect(postsRepo.save).toHaveBeenCalled();
    });

    it('should skip existing posts', async () => {
      const symbol = 'AAPL';
      const mockResponse = {
        data: {
          messages: [{ id: 101 }],
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));
      mockPostsRepo.findOne.mockResolvedValue({ id: 101 });

      await service.fetchAndStorePosts(symbol);

      expect(postsRepo.save).not.toHaveBeenCalled();
    });

    it('should handle missing messages', async () => {
      mockHttpService.get.mockReturnValue(of({ data: {} }));

      await service.fetchAndStorePosts('AAPL');

      expect(postsRepo.save).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(service.fetchAndStorePosts('AAPL')).resolves.toBeUndefined();
    });
  });

  describe('trackWatchers', () => {
    it('should save watcher count', async () => {
      const symbol = 'AAPL';
      const mockResponse = {
        data: {
          symbol: { watchlist_count: 5000 },
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      await service.trackWatchers(symbol);

      expect(watchersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol,
          count: 5000,
        }),
      );
    });

    it('should handle missing watcher count', async () => {
      mockHttpService.get.mockReturnValue(of({ data: {} }));

      await service.trackWatchers('AAPL');

      expect(watchersRepo.save).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(service.trackWatchers('AAPL')).resolves.toBeUndefined();
    });
  });

  describe('handleHourlyPostsSync', () => {
    it('should sync posts for all tickers', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'GOOGL' },
      ]);
      mockHttpService.get.mockReturnValue(of({ data: { messages: [] } }));

      await service.handleHourlyPostsSync();

      expect(mockHttpService.get).toHaveBeenCalledTimes(2);
    });

    it('should skip tickers without symbol', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { name: 'no symbol' },
      ]);
      mockHttpService.get.mockReturnValue(of({ data: { messages: [] } }));

      await service.handleHourlyPostsSync();

      expect(mockHttpService.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleDailyWatchersSync', () => {
    it('should sync watchers for all tickers', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'GOOGL' },
      ]);
      mockHttpService.get.mockReturnValue(
        of({ data: { symbol: { watchlist_count: 100 } } }),
      );

      await service.handleDailyWatchersSync();

      expect(watchersRepo.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('getPosts', () => {
    it('should return paginated posts', async () => {
      const symbol = 'AAPL';
      const mockPosts = [{ id: 1 }, { id: 2 }];
      const total = 10;
      mockPostsRepo.findAndCount.mockResolvedValue([mockPosts, total]);

      const result = await service.getPosts(symbol, 1, 10);

      expect(postsRepo.findAndCount).toHaveBeenCalledWith({
        where: { symbol },
        order: { created_at: 'DESC' },
        take: 10,
        skip: 0,
      });
      expect(result).toEqual({
        data: mockPosts,
        total,
        page: 1,
        limit: 10,
      });
    });

    it('should calculate skip correctly for page 2', async () => {
      mockPostsRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getPosts('AAPL', 2, 10);

      expect(postsRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10 }),
      );
    });
  });

  describe('getWatchersHistory', () => {
    it('should return watcher history', async () => {
      const history = [{ symbol: 'AAPL', count: 1000, timestamp: new Date() }];
      mockWatchersRepo.find.mockResolvedValue(history);

      const result = await service.getWatchersHistory('AAPL');

      expect(result).toEqual(history);
      expect(watchersRepo.find).toHaveBeenCalledWith({
        where: { symbol: 'AAPL' },
        order: { timestamp: 'ASC' },
      });
    });
  });
});

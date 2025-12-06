import { Test, TestingModule } from '@nestjs/testing';
import { StockTwitsService } from './stocktwits.service';
import { HttpService } from '@nestjs/axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StockTwitsPost } from './entities/stocktwits-post.entity';
import { StockTwitsWatcher } from './entities/stocktwits-watcher.entity';
import { TickersService } from '../tickers/tickers.service';
import { of } from 'rxjs';

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
    create: jest.fn(),
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
  });

  afterEach(() => {
    jest.clearAllMocks();
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
      mockPostsRepo.findOne.mockResolvedValue(null); // Post does not exist
      mockPostsRepo.create.mockReturnValue({ id: 101, symbol });

      await service.fetchAndStorePosts(symbol);

      // eslint-disable-next-line @typescript-eslint/unbound-method
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
      mockPostsRepo.findOne.mockResolvedValue({ id: 101 }); // Post exists

      await service.fetchAndStorePosts(symbol);

      expect(postsRepo.save).not.toHaveBeenCalled();
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
  });

  describe('getPosts', () => {
    it('should return paginated posts', async () => {
      const symbol = 'AAPL';
      const mockPosts = [{ id: 1 }, { id: 2 }];
      const total = 10;
      mockPostsRepo.findAndCount = jest.fn().mockResolvedValue([mockPosts, total]);

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
  });
});

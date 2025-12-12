import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SocialService } from './social.service';
import { Comment } from './entities/comment.entity';
import { WatchlistItem } from '../watchlist/entities/watchlist-item.entity';
import { TickerEntity } from '../tickers/entities/ticker.entity';

describe('SocialService', () => {
  let service: SocialService;

  const mockCommentRepo = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockWatchlistItemRepo = {
    count: jest.fn(),
  };

  const mockTickerRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        {
          provide: getRepositoryToken(Comment),
          useValue: mockCommentRepo,
        },
        {
          provide: getRepositoryToken(WatchlistItem),
          useValue: mockWatchlistItemRepo,
        },
        {
          provide: getRepositoryToken(TickerEntity),
          useValue: mockTickerRepo,
        },
      ],
    }).compile();

    service = module.get<SocialService>(SocialService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getComments', () => {
    it('should return comments for a symbol', async () => {
      const mockComments = [
        { id: '1', ticker_symbol: 'AAPL', content: 'Great stock!' },
        { id: '2', ticker_symbol: 'AAPL', content: 'Bullish' },
      ];
      mockCommentRepo.find.mockResolvedValue(mockComments);

      const result = await service.getComments('AAPL');

      expect(result).toEqual(mockComments);
      expect(mockCommentRepo.find).toHaveBeenCalledWith({
        where: { ticker_symbol: 'AAPL' },
        order: { created_at: 'DESC' },
        take: 50,
        relations: ['user'],
      });
    });

    it('should respect custom limit', async () => {
      mockCommentRepo.find.mockResolvedValue([]);

      await service.getComments('AAPL', 10);

      expect(mockCommentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  describe('postComment', () => {
    it('should create and save a comment', async () => {
      const mockComment = {
        id: '1',
        user_id: 'user123',
        ticker_symbol: 'AAPL',
        content: 'Great stock!',
      };
      mockCommentRepo.create.mockReturnValue(mockComment);
      mockCommentRepo.save.mockResolvedValue(mockComment);

      const result = await service.postComment('user123', 'AAPL', 'Great stock!');

      expect(result).toEqual(mockComment);
      expect(mockCommentRepo.create).toHaveBeenCalledWith({
        user_id: 'user123',
        ticker_symbol: 'AAPL',
        content: 'Great stock!',
      });
      expect(mockCommentRepo.save).toHaveBeenCalledWith(mockComment);
    });
  });

  describe('getWatcherCount', () => {
    it('should return watcher count when ticker exists', async () => {
      mockTickerRepo.findOne.mockResolvedValue({ id: 'ticker-1', symbol: 'AAPL' });
      mockWatchlistItemRepo.count.mockResolvedValue(42);

      const result = await service.getWatcherCount('AAPL');

      expect(result).toBe(42);
      expect(mockTickerRepo.findOne).toHaveBeenCalledWith({ where: { symbol: 'AAPL' } });
      expect(mockWatchlistItemRepo.count).toHaveBeenCalledWith({
        where: { ticker_id: 'ticker-1' },
      });
    });

    it('should return 0 when ticker does not exist', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);

      const result = await service.getWatcherCount('UNKNOWN');

      expect(result).toBe(0);
      expect(mockWatchlistItemRepo.count).not.toHaveBeenCalled();
    });
  });
});

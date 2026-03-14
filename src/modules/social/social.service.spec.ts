import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SocialService } from './social.service';
import { Comment } from './entities/comment.entity';
import { CommentLike } from './entities/comment-like.entity';
import { WatchlistItem } from '../watchlist/entities/watchlist-item.entity';
import { TickerEntity } from '../tickers/entities/ticker.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { WebPushService } from '../web-push/web-push.service';
import { UsersService } from '../users/users.service';

describe('SocialService', () => {
  let service: SocialService;

  const mockCommentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
  };

  const mockLikeRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
  };

  const mockWatchlistItemRepo = {
    count: jest.fn(),
  };

  const mockTickerRepo = {
    findOne: jest.fn(),
  };

  const mockNotificationsService = {
    create: jest.fn().mockResolvedValue({}),
  };

  const mockWebPushService = {
    sendToUser: jest.fn().mockResolvedValue(undefined),
  };

  const mockUsersService = {
    findByIds: jest.fn().mockResolvedValue([]),
    searchUsers: jest.fn().mockResolvedValue([]),
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
          provide: getRepositoryToken(CommentLike),
          useValue: mockLikeRepo,
        },
        {
          provide: getRepositoryToken(WatchlistItem),
          useValue: mockWatchlistItemRepo,
        },
        {
          provide: getRepositoryToken(TickerEntity),
          useValue: mockTickerRepo,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: WebPushService,
          useValue: mockWebPushService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
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
        {
          id: '1',
          ticker_symbol: 'AAPL',
          content: 'Great stock!',
          replies: [],
        },
        { id: '2', ticker_symbol: 'AAPL', content: 'Bullish', replies: [] },
      ];
      mockCommentRepo.find.mockResolvedValue(mockComments);

      const result = await service.getComments('AAPL');

      expect(result.comments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: '1' }),
          expect.objectContaining({ id: '2' }),
        ]),
      );
      expect(result.mentionedUsers).toBeDefined();
      expect(mockCommentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ticker_symbol: 'AAPL' }),
          order: { created_at: 'DESC' },
          take: 50,
        }),
      );
    });

    it('should respect custom limit', async () => {
      mockCommentRepo.find.mockResolvedValue([]);

      await service.getComments('AAPL', 10);

      expect(mockCommentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });

    it('should resolve mentionedUsers from <@userId> tokens in comment content', async () => {
      const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const mockComments = [
        {
          id: '1',
          ticker_symbol: 'AAPL',
          content: `hey <@${userId}> what do you think?`,
          replies: [],
        },
      ];
      mockCommentRepo.find.mockResolvedValue(mockComments);
      mockUsersService.findByIds.mockResolvedValue([
        { id: userId, nickname: 'testuser', avatar_url: null, tier: 'free' },
      ]);

      const result = await service.getComments('AAPL');

      expect(mockUsersService.findByIds).toHaveBeenCalledWith([userId]);
      expect(result.mentionedUsers[userId]).toMatchObject({
        id: userId,
        nickname: 'testuser',
      });
    });

    it('should return empty mentionedUsers when no mentions in comments', async () => {
      mockCommentRepo.find.mockResolvedValue([
        { id: '1', content: 'No mentions here', replies: [] },
      ]);

      const result = await service.getComments('AAPL');

      expect(mockUsersService.findByIds).not.toHaveBeenCalled();
      expect(result.mentionedUsers).toEqual({});
    });
  });

  describe('postComment', () => {
    it('should create and save a comment', async () => {
      const mockComment = {
        id: '1',
        user_id: 'user123',
        ticker_symbol: 'AAPL',
        content: 'Great stock!',
        parent_id: null,
      };
      mockCommentRepo.create.mockReturnValue(mockComment);
      mockCommentRepo.save.mockResolvedValue(mockComment);
      mockCommentRepo.findOne.mockResolvedValue(mockComment);

      const result = await service.postComment(
        'user123',
        'AAPL',
        'Great stock!',
      );

      expect(result).toEqual(mockComment);
      expect(mockCommentRepo.create).toHaveBeenCalledWith({
        user_id: 'user123',
        ticker_symbol: 'AAPL',
        content: 'Great stock!',
        parent_id: null,
      });
      expect(mockCommentRepo.save).toHaveBeenCalledWith(mockComment);
    });

    it('should send mention notification when a different user is mentioned', async () => {
      const mentionedUserId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const content = `hey <@${mentionedUserId}> what do you think?`;
      const mockComment = {
        id: '10',
        user_id: 'user123',
        ticker_symbol: 'AAPL',
        content,
        parent_id: null,
        user: { nickname: 'commenter', email: 'commenter@test.com' },
      };
      mockCommentRepo.create.mockReturnValue(mockComment);
      mockCommentRepo.save.mockResolvedValue(mockComment);
      mockCommentRepo.findOne.mockResolvedValue(mockComment);

      await service.postComment('user123', 'AAPL', content);

      // Wait for async fire-and-forget notifications
      await new Promise((r) => setTimeout(r, 10));

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        mentionedUserId,
        'comment_mention',
        expect.stringContaining('mentioned you on AAPL'),
        expect.any(String),
        expect.objectContaining({ symbol: 'AAPL', commentId: '10' }),
      );
      expect(mockWebPushService.sendToUser).toHaveBeenCalledWith(
        mentionedUserId,
        expect.objectContaining({
          title: expect.stringContaining('mentioned you'),
        }),
      );
    });

    it('should skip mention notification for self-mentions', async () => {
      const selfId = 'user123';
      const content = `<@${selfId}> this is a self mention`;
      const mockComment = {
        id: '11',
        user_id: selfId,
        ticker_symbol: 'AAPL',
        content,
        parent_id: null,
        user: { nickname: 'self', email: 'self@test.com' },
      };
      mockCommentRepo.create.mockReturnValue(mockComment);
      mockCommentRepo.save.mockResolvedValue(mockComment);
      mockCommentRepo.findOne.mockResolvedValue(mockComment);

      await service.postComment(selfId, 'AAPL', content);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockNotificationsService.create).not.toHaveBeenCalledWith(
        selfId,
        'comment_mention',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should skip duplicate mention notification for reply parent author', async () => {
      const parentAuthorId = 'parent-author-id-1111-111111111111';
      const mentionId = parentAuthorId; // mentioning the same user we're replying to
      const content = `<@${mentionId}> agree!`;
      const parentComment = { id: 'parent-1', user_id: parentAuthorId };
      const newComment = {
        id: '12',
        user_id: 'user123',
        ticker_symbol: 'AAPL',
        content,
        parent_id: 'parent-1',
        user: { nickname: 'commenter', email: 'commenter@test.com' },
      };
      mockCommentRepo.create.mockReturnValue(newComment);
      mockCommentRepo.save.mockResolvedValue(newComment);
      // findOne called twice: once for full comment, once for parent
      mockCommentRepo.findOne
        .mockResolvedValueOnce(newComment) // full comment lookup
        .mockResolvedValueOnce(parentComment); // parent lookup for reply notify

      await service.postComment('user123', 'AAPL', content, 'parent-1');
      await new Promise((r) => setTimeout(r, 10));

      const mentionNotifyCalls =
        mockNotificationsService.create.mock.calls.filter(
          (call) => call[1] === 'comment_mention',
        );
      expect(mentionNotifyCalls).toHaveLength(0);
    });

    it('should post a reply and notify the parent author', async () => {
      const parentAuthorId = 'parent-author-uuid-1111-111111111111';
      const parentComment = { id: 'parent-1', user_id: parentAuthorId };
      const replyComment = {
        id: '2',
        user_id: 'user123',
        ticker_symbol: 'AAPL',
        content: 'I agree!',
        parent_id: 'parent-1',
        user: { nickname: 'replier', email: 'replier@test.com' },
      };
      mockCommentRepo.create.mockReturnValue(replyComment);
      mockCommentRepo.save.mockResolvedValue(replyComment);
      mockCommentRepo.findOne
        .mockResolvedValueOnce(replyComment) // full comment
        .mockResolvedValueOnce(parentComment); // parent

      await service.postComment('user123', 'AAPL', 'I agree!', 'parent-1');
      await new Promise((r) => setTimeout(r, 10));

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        parentAuthorId,
        'comment_reply',
        expect.stringContaining('replied'),
        expect.any(String),
        expect.objectContaining({ symbol: 'AAPL' }),
      );
    });
  });

  describe('getWatcherCount', () => {
    it('should return watcher count when ticker exists', async () => {
      mockTickerRepo.findOne.mockResolvedValue({
        id: 'ticker-1',
        symbol: 'AAPL',
      });
      mockWatchlistItemRepo.count.mockResolvedValue(42);

      const result = await service.getWatcherCount('AAPL');

      expect(result).toBe(42);
      expect(mockTickerRepo.findOne).toHaveBeenCalledWith({
        where: { symbol: 'AAPL' },
      });
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

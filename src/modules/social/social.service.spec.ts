import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SocialService } from './social.service';
import { Comment } from './entities/comment.entity';
import { CommentLike } from './entities/comment-like.entity';
import { WatchlistItem } from '../watchlist/entities/watchlist-item.entity';
import { TickerEntity } from '../tickers/entities/ticker.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { WebPushService } from '../web-push/web-push.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// Mock @google/genai for moderation tests
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: jest.fn().mockResolvedValue({
        text: JSON.stringify([
          { id: 1, status: 'flagged', reason: 'spam' },
          { id: 2, status: 'ok', reason: null },
        ]),
      }),
    },
  })),
}));

describe('SocialService', () => {
  let service: SocialService;

  const mockCommentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
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

  // toggleLike runs inside likeRepo.manager.transaction(tx => ...) under an
  // advisory lock; the tx manager hands back the same like-repo mock.
  const mockLikeTx = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: jest.fn(),
  };

  const mockLikeRepo: any = {
    manager: {
      transaction: jest.fn((cb: (tx: typeof mockLikeTx) => unknown) =>
        Promise.resolve(cb(mockLikeTx)),
      ),
    },
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

  mockLikeTx.getRepository.mockReturnValue(mockLikeRepo);

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
    tickerIconUrl: jest.fn(
      (symbol: string) => `/api/v1/tickers/${symbol}/logo?fallback=app`,
    ),
  };

  const mockUsersService = {
    findPublicByIds: jest.fn().mockResolvedValue([]),
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
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'GEMINI_API_KEY') return 'test-api-key';
              return undefined;
            }),
          },
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

    it('never loads the `user` relation — authors come from the public lookup', async () => {
      mockCommentRepo.find.mockResolvedValue([]);

      await service.getComments('AAPL');

      const { relations } = mockCommentRepo.find.mock.calls[0][0];
      expect(relations).toEqual(['replies']);
      expect(JSON.stringify(relations)).not.toContain('user');
    });

    it('attaches ONLY the public view of each author, nested replies included (the feed is a PUBLIC endpoint)', async () => {
      const author = 'aaaaaaaa-0000-4000-8000-000000000001';
      const replier = 'bbbbbbbb-0000-4000-8000-000000000002';
      mockCommentRepo.find.mockResolvedValue([
        {
          id: '1',
          user_id: author,
          content: 'Top level',
          created_at: new Date('2026-01-01'),
          replies: [
            {
              id: '2',
              user_id: replier,
              content: 'A reply',
              created_at: new Date('2026-01-02'),
            },
            {
              id: '3',
              user_id: author,
              content: 'Author answers',
              created_at: new Date('2026-01-03'),
            },
          ],
        },
      ]);
      mockUsersService.findPublicByIds.mockResolvedValue([
        {
          id: author,
          nickname: 'FunnyPanda123',
          avatar_url: null,
          tier: 'pro',
        },
        {
          id: replier,
          nickname: 'CalmOtter7',
          avatar_url: 'a.png',
          tier: 'free',
        },
      ]);

      const result = await service.getComments('AAPL');

      // One lookup for every author of the thread, de-duplicated.
      expect(mockUsersService.findPublicByIds).toHaveBeenCalledTimes(1);
      expect(mockUsersService.findPublicByIds).toHaveBeenCalledWith([
        author,
        replier,
      ]);

      const [comment] = result.comments;
      const PUBLIC_KEYS = ['avatar_url', 'id', 'nickname', 'tier'];
      expect(comment.user).toEqual({
        id: author,
        nickname: 'FunnyPanda123',
        avatar_url: null,
        tier: 'pro',
      });
      expect(Object.keys(comment.user as object).sort()).toEqual(PUBLIC_KEYS);
      expect(comment.replies.map((r) => r.user?.nickname)).toEqual([
        'CalmOtter7',
        'FunnyPanda123',
      ]);
      for (const reply of comment.replies) {
        expect(Object.keys(reply.user as object).sort()).toEqual(PUBLIC_KEYS);
      }
    });

    it('leaks nothing even when the repository hands back fully loaded authors', async () => {
      // Not what the query asks for any more — this pins the projection on its
      // own: whatever is on the row, the response carries the public view.
      const leakyAuthor = () =>
        Object.assign(new User(), {
          id: 'aaaaaaaa-0000-4000-8000-000000000001',
          email: 'alice.private@example.com',
          google_id: 'google-sub-1234567890',
          full_name: 'Alice Private',
          credits_balance: 4242,
          nickname: 'FunnyPanda123',
          tier: 'pro',
          preferences: { gemini_api_key: 'SECRET' },
        });
      mockCommentRepo.find.mockResolvedValue([
        {
          id: '1',
          user_id: 'aaaaaaaa-0000-4000-8000-000000000001',
          content: 'Top level',
          user: leakyAuthor(),
          replies: [
            {
              id: '2',
              user_id: 'aaaaaaaa-0000-4000-8000-000000000001',
              content: 'Reply',
              created_at: new Date('2026-01-02'),
              user: leakyAuthor(),
            },
          ],
        },
      ]);
      mockUsersService.findPublicByIds.mockResolvedValue([
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000001',
          nickname: 'FunnyPanda123',
          avatar_url: null,
          tier: 'pro',
        },
      ]);

      const json = JSON.stringify(await service.getComments('AAPL'));

      for (const secret of [
        'SECRET',
        'alice.private',
        'google-sub-1234567890',
        'Alice Private',
        '4242',
      ]) {
        expect(json).not.toContain(secret);
      }
      expect(json).toContain('FunnyPanda123');
    });

    it('returns user: null for an author that no longer resolves', async () => {
      mockCommentRepo.find.mockResolvedValue([
        { id: '1', user_id: 'gone', content: 'orphan', replies: [] },
      ]);
      mockUsersService.findPublicByIds.mockResolvedValue([]);

      const result = await service.getComments('AAPL');

      expect(result.comments[0].user).toBeNull();
    });

    it('should respect custom limit', async () => {
      mockCommentRepo.find.mockResolvedValue([]);

      await service.getComments('AAPL', null, 10);

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
      mockUsersService.findPublicByIds.mockResolvedValue([
        { id: userId, nickname: 'testuser', avatar_url: null, tier: 'free' },
      ]);

      const result = await service.getComments('AAPL');

      expect(mockUsersService.findPublicByIds).toHaveBeenCalledWith([userId]);
      expect(result.mentionedUsers[userId]).toEqual({
        id: userId,
        nickname: 'testuser',
        avatar_url: null,
        tier: 'free',
      });
    });

    it('should return empty mentionedUsers when no mentions in comments', async () => {
      mockCommentRepo.find.mockResolvedValue([
        { id: '1', content: 'No mentions here', replies: [] },
      ]);

      const result = await service.getComments('AAPL');

      expect(mockUsersService.findPublicByIds).not.toHaveBeenCalled();
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
      mockUsersService.findPublicByIds.mockResolvedValue([
        {
          id: 'user123',
          nickname: 'commenter',
          avatar_url: null,
          tier: 'free',
        },
      ]);

      const result = await service.postComment(
        'user123',
        'AAPL',
        'Great stock!',
      );

      // The saved comment plus the author's PUBLIC view — the poster's own
      // row (email, API key) is not echoed back.
      expect(result).toEqual({
        ...mockComment,
        user: {
          id: 'user123',
          nickname: 'commenter',
          avatar_url: null,
          tier: 'free',
        },
      });
      expect(mockUsersService.findPublicByIds).toHaveBeenCalledWith([
        'user123',
      ]);
      expect(mockCommentRepo.findOne).not.toHaveBeenCalled();
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
      };
      mockCommentRepo.create.mockReturnValue(mockComment);
      mockCommentRepo.save.mockResolvedValue(mockComment);
      mockUsersService.findPublicByIds.mockResolvedValue([
        {
          id: 'user123',
          nickname: 'commenter',
          avatar_url: null,
          tier: 'free',
        },
      ]);

      await service.postComment('user123', 'AAPL', content);

      // Wait for async fire-and-forget notifications
      await new Promise((r) => setTimeout(r, 10));

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        mentionedUserId,
        'comment_mention',
        'commenter mentioned you on AAPL',
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
      };
      mockCommentRepo.create.mockReturnValue(mockComment);
      mockCommentRepo.save.mockResolvedValue(mockComment);

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
      const parentComment = {
        id: 'parent-1',
        user_id: parentAuthorId,
        ticker_symbol: 'AAPL',
      };
      const newComment = {
        id: '12',
        user_id: 'user123',
        ticker_symbol: 'AAPL',
        content,
        parent_id: 'parent-1',
      };
      mockCommentRepo.create.mockReturnValue(newComment);
      mockCommentRepo.save.mockResolvedValue(newComment);
      // findOne is only ever the parent lookup (reply notify + mention dedup)
      mockCommentRepo.findOne.mockResolvedValue(parentComment);

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
      const parentComment = {
        id: 'parent-1',
        user_id: parentAuthorId,
        ticker_symbol: 'AAPL',
      };
      const replyComment = {
        id: '2',
        user_id: 'user123',
        ticker_symbol: 'AAPL',
        content: 'I agree!',
        parent_id: 'parent-1',
      };
      mockCommentRepo.create.mockReturnValue(replyComment);
      mockCommentRepo.save.mockResolvedValue(replyComment);
      mockCommentRepo.findOne.mockResolvedValue(parentComment); // parent
      mockUsersService.findPublicByIds.mockResolvedValue([
        { id: 'user123', nickname: 'replier', avatar_url: null, tier: 'free' },
      ]);

      await service.postComment('user123', 'AAPL', 'I agree!', 'parent-1');
      await new Promise((r) => setTimeout(r, 10));

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        parentAuthorId,
        'comment_reply',
        'replier replied to your comment',
        expect.any(String),
        expect.objectContaining({ symbol: 'AAPL' }),
      );
      // The parent is looked up for its user_id only — no author relation.
      expect(mockCommentRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'parent-1' },
      });
    });

    it('names an author without a nickname by an id-derived handle in notifications — never the email', async () => {
      const parentComment = {
        id: 'parent-1',
        user_id: 'someone-else',
        ticker_symbol: 'AAPL',
      };
      const reply = {
        id: '3',
        user_id: 'user123',
        ticker_symbol: 'AAPL',
        content: 'I agree!',
        parent_id: 'parent-1',
      };
      mockCommentRepo.create.mockReturnValue(reply);
      mockCommentRepo.save.mockResolvedValue(reply);
      mockCommentRepo.findOne.mockResolvedValue(parentComment);
      // What UsersService.findPublicByIds returns for a legacy account whose
      // nickname is NULL (see toPublicUser).
      mockUsersService.findPublicByIds.mockResolvedValue([
        {
          id: 'user123',
          nickname: 'Trader-user12',
          avatar_url: null,
          tier: 'free',
        },
      ]);

      await service.postComment('user123', 'AAPL', 'I agree!', 'parent-1');
      await new Promise((r) => setTimeout(r, 10));

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        'someone-else',
        'comment_reply',
        'Trader-user12 replied to your comment',
        expect.any(String),
        expect.anything(),
      );
    });
  });

  describe('toggleLike', () => {
    it('loads the comment without its author and names the liker by nickname', async () => {
      mockCommentRepo.findOne.mockResolvedValue({
        id: '5',
        user_id: 'owner-1',
        ticker_symbol: 'AAPL',
        content: 'Nice',
      });
      mockLikeRepo.findOne.mockResolvedValue(null);
      mockLikeRepo.create.mockReturnValue({});
      mockLikeRepo.save.mockResolvedValue({});
      mockLikeRepo.count.mockResolvedValue(1);
      mockUsersService.findPublicByIds.mockResolvedValue([
        {
          id: 'liker-2',
          nickname: 'CalmOtter7',
          avatar_url: null,
          tier: 'free',
        },
      ]);

      const result = await service.toggleLike('liker-2', '5');
      await new Promise((r) => setTimeout(r, 10));

      expect(result).toEqual({ liked: true, likeCount: 1 });
      expect(mockCommentRepo.findOne).toHaveBeenCalledWith({
        where: { id: '5' },
      });
      // No raw `SELECT ... email FROM users` any more.
      expect(mockCommentRepo.query).not.toHaveBeenCalled();
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        'owner-1',
        'comment_like',
        'CalmOtter7 liked your comment',
        expect.any(String),
        expect.objectContaining({ symbol: 'AAPL', commentId: '5' }),
      );
    });
  });

  describe('getComments — moderation', () => {
    const AUTHOR = 'aaaaaaaa-0000-4000-8000-000000000001';
    const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';

    // What the database would return for the given `where`, so the filter is
    // exercised end to end without Postgres.
    const thread = () => [
      {
        id: '1',
        user_id: OTHER,
        content: 'Fine comment',
        moderation_status: 'ok',
        moderation_reason: null,
        created_at: new Date('2026-01-04'),
        replies: [
          {
            id: '11',
            user_id: AUTHOR,
            content: 'A reply moderation took down',
            moderation_status: 'flagged',
            moderation_reason: 'personal attack',
            created_at: new Date('2026-01-05'),
          },
          {
            id: '12',
            user_id: OTHER,
            content: 'A fine reply',
            moderation_status: 'pending',
            moderation_reason: null,
            created_at: new Date('2026-01-06'),
          },
        ],
      },
      {
        id: '2',
        user_id: AUTHOR,
        content: 'Taken down top-level comment',
        moderation_status: 'flagged',
        moderation_reason: 'spam',
        created_at: new Date('2026-01-03'),
        replies: [],
      },
      {
        id: '3',
        user_id: OTHER,
        content: 'Rejected',
        moderation_status: 'rejected',
        moderation_reason: 'hate speech',
        created_at: new Date('2026-01-02'),
        replies: [],
      },
    ];

    const matches = (row: any, where: any): boolean =>
      Object.entries(where).every(([key, expected]: [string, any]) => {
        if (key === 'ticker_symbol' || key === 'parent_id') return true;
        if (key === 'moderation_status') {
          // Not(In([...]))
          return !expected.value.includes(row.moderation_status);
        }
        return row[key] === expected;
      });

    beforeEach(() => {
      mockCommentRepo.find.mockImplementation(({ where }: any) => {
        const alternatives = Array.isArray(where) ? where : [where];
        return Promise.resolve(
          thread().filter((row) => alternatives.some((w) => matches(row, w))),
        );
      });
      mockUsersService.findPublicByIds.mockResolvedValue([]);
    });

    const ids = (result: any) =>
      result.comments.map((c: any) => [c.id, c.replies.map((r: any) => r.id)]);

    it('an ANONYMOUS visitor never gets a flagged / rejected comment or reply', async () => {
      const result = await service.getComments('AAPL');

      expect(ids(result)).toEqual([['1', ['12']]]);
      // ...and they are filtered in the query, not after the page was cut.
      const { where } = mockCommentRepo.find.mock.calls[0][0];
      expect(Array.isArray(where)).toBe(false);
      expect(where.moderation_status.type).toBe('not');
      expect(where.moderation_status.child.type).toBe('in');
      expect(where.moderation_status.value).toEqual(['flagged', 'rejected']);
      const json = JSON.stringify(result);
      expect(json).not.toContain('Taken down');
      expect(json).not.toContain('took down');
      expect(json).not.toContain('Rejected');
    });

    it('another signed-in user gets the same as an anonymous visitor', async () => {
      const result = await service.getComments('AAPL', {
        id: 'cccccccc-0000-4000-8000-000000000003',
        role: 'user',
      });

      expect(ids(result)).toEqual([['1', ['12']]]);
    });

    it("the AUTHOR additionally gets their own taken-down comment and reply — nobody else's", async () => {
      const result = await service.getComments('AAPL', {
        id: AUTHOR,
        role: 'user',
      });

      expect(ids(result)).toEqual([
        ['1', ['11', '12']],
        ['2', []],
      ]);
      // The author sees the status, not the moderator's reason.
      expect(result.comments[1].moderation_status).toBe('flagged');
      expect(JSON.stringify(result)).not.toContain('spam');
      expect(JSON.stringify(result)).not.toContain('personal attack');
    });

    it('an ADMIN gets everything, with the moderation reason', async () => {
      const result = await service.getComments('AAPL', {
        id: 'dddddddd-0000-4000-8000-000000000004',
        role: 'admin',
      });

      expect(ids(result)).toEqual([
        ['1', ['11', '12']],
        ['2', []],
        ['3', []],
      ]);
      expect(result.comments[1].moderation_reason).toBe('spam');
      expect(result.comments[0].replies[0].moderation_reason).toBe(
        'personal attack',
      );
    });

    it.each([
      ['anonymous', undefined],
      ['a regular user', { id: OTHER, role: 'user' }],
      ['the author', { id: AUTHOR, role: 'user' }],
    ])('never exposes moderation_reason to %s', async (_label, viewer) => {
      const result = await service.getComments('AAPL', viewer as any);

      for (const comment of result.comments) {
        expect(comment).not.toHaveProperty('moderation_reason');
        for (const reply of comment.replies) {
          expect(reply).not.toHaveProperty('moderation_reason');
        }
      }
      expect(JSON.stringify(result)).not.toContain('moderation_reason');
    });

    it('does not resolve authors or mentions of comments it does not serve', async () => {
      await service.getComments('AAPL');

      // Only the authors of comment 1 and reply 12 (the same user).
      expect(mockUsersService.findPublicByIds).toHaveBeenCalledWith([OTHER]);
    });
  });

  describe('postComment — replies', () => {
    const reply = {
      id: '20',
      user_id: 'user123',
      ticker_symbol: 'AAPL',
      content: 'I agree!',
      parent_id: '7',
    };

    beforeEach(() => {
      mockCommentRepo.create.mockImplementation((c: any) => ({ ...c }));
      mockCommentRepo.save.mockImplementation((c: any) =>
        Promise.resolve({ id: '20', ...c }),
      );
      mockUsersService.findPublicByIds.mockResolvedValue([]);
    });

    it('rejects a reply whose parent is a comment on ANOTHER ticker (400) and saves nothing', async () => {
      mockCommentRepo.findOne.mockResolvedValue({
        id: '7',
        user_id: 'someone-else',
        ticker_symbol: 'TSLA',
      });

      await expect(
        service.postComment('user123', 'AAPL', reply.content, '7'),
      ).rejects.toThrow(BadRequestException);

      expect(mockCommentRepo.save).not.toHaveBeenCalled();
      expect(mockNotificationsService.create).not.toHaveBeenCalled();
    });

    it('answers a parent that does not exist with 404 instead of a foreign-key error', async () => {
      mockCommentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.postComment('user123', 'AAPL', reply.content, '999'),
      ).rejects.toThrow(NotFoundException);

      expect(mockCommentRepo.save).not.toHaveBeenCalled();
    });

    it("files a reply under its parent's ticker (symbol case does not matter)", async () => {
      mockCommentRepo.findOne.mockResolvedValue({
        id: '7',
        user_id: 'someone-else',
        ticker_symbol: 'AAPL',
      });

      await service.postComment('user123', 'aapl', reply.content, '7');

      expect(mockCommentRepo.create).toHaveBeenCalledWith({
        user_id: 'user123',
        ticker_symbol: 'AAPL',
        content: 'I agree!',
        parent_id: '7',
      });
      // One parent lookup serves validation, the reply notification and the
      // mention de-duplication.
      expect(mockCommentRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('does not look anything up for a top-level comment', async () => {
      await service.postComment('user123', 'AAPL', 'Top level');

      expect(mockCommentRepo.findOne).not.toHaveBeenCalled();
      expect(mockCommentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ticker_symbol: 'AAPL', parent_id: null }),
      );
    });

    it('does not echo a moderation reason back to the author', async () => {
      mockCommentRepo.save.mockResolvedValue({
        id: '21',
        user_id: 'user123',
        ticker_symbol: 'AAPL',
        content: 'Top level',
        parent_id: null,
        moderation_status: 'pending',
        moderation_reason: null,
      });

      const result = await service.postComment('user123', 'AAPL', 'Top level');

      expect(result).not.toHaveProperty('moderation_reason');
      expect(result.moderation_status).toBe('pending');
    });
  });

  describe('toggleLike — one like per user per comment', () => {
    const comment = {
      id: '5',
      user_id: 'owner-1',
      ticker_symbol: 'AAPL',
      content: 'Nice',
    };

    beforeEach(() => {
      mockCommentRepo.findOne.mockResolvedValue(comment);
      mockLikeRepo.create.mockImplementation((l: any) => l);
      mockLikeRepo.save.mockResolvedValue({});
      mockLikeRepo.remove.mockResolvedValue({});
      mockLikeRepo.count.mockResolvedValue(1);
      mockUsersService.findPublicByIds.mockResolvedValue([]);
    });

    it('checks and inserts inside one transaction, under a lock keyed by (comment, user)', async () => {
      mockLikeRepo.findOne.mockResolvedValue(null);
      const order: string[] = [];
      mockLikeTx.query.mockImplementation(() => {
        order.push('lock');
        return Promise.resolve();
      });
      mockLikeRepo.findOne.mockImplementation(() => {
        order.push('check');
        return Promise.resolve(null);
      });
      mockLikeRepo.save.mockImplementation(() => {
        order.push('insert');
        return Promise.resolve({});
      });

      const result = await service.toggleLike('liker-2', '5');

      expect(result.liked).toBe(true);
      expect(mockLikeRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(mockLikeTx.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['comment-like:5:liker-2'],
      );
      // The lock is taken BEFORE the existence check.
      expect(order).toEqual(['lock', 'check', 'insert']);
      expect(mockLikeRepo.save).toHaveBeenCalledWith({
        comment_id: '5',
        user_id: 'liker-2',
      });
    });

    it('two requests for the same like end as like + unlike, never as two likes', async () => {
      // A minimal in-memory table behind the mocked repository, with the lock
      // modelled as "transactions run one after another".
      const rows: any[] = [];
      let chain: Promise<unknown> = Promise.resolve();
      mockLikeRepo.manager.transaction.mockImplementation((cb: any) => {
        const run = chain.then(() => cb(mockLikeTx));
        chain = run.catch(() => undefined);
        return run;
      });
      mockLikeRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(
          rows.find(
            (r) =>
              r.comment_id === where.comment_id && r.user_id === where.user_id,
          ) ?? null,
        ),
      );
      mockLikeRepo.save.mockImplementation((like: any) => {
        rows.push(like);
        return Promise.resolve(like);
      });
      mockLikeRepo.remove.mockImplementation((like: any) => {
        rows.splice(rows.indexOf(like), 1);
        return Promise.resolve(like);
      });

      const results = await Promise.all([
        service.toggleLike('liker-2', '5'),
        service.toggleLike('liker-2', '5'),
      ]);

      expect(results.map((r) => r.liked)).toEqual([true, false]);
      expect(rows).toHaveLength(0);

      // And a different user is not serialized into the same outcome.
      await service.toggleLike('liker-2', '5');
      await service.toggleLike('liker-3', '5');
      expect(rows).toEqual([
        { comment_id: '5', user_id: 'liker-2' },
        { comment_id: '5', user_id: 'liker-3' },
      ]);
    });

    it('unlikes without notifying anyone', async () => {
      const existing = { id: '9', comment_id: '5', user_id: 'liker-2' };
      mockLikeRepo.findOne.mockResolvedValue(existing);
      mockLikeRepo.count.mockResolvedValue(0);

      const result = await service.toggleLike('liker-2', '5');
      await new Promise((r) => setTimeout(r, 10));

      expect(result).toEqual({ liked: false, likeCount: 0 });
      expect(mockLikeRepo.remove).toHaveBeenCalledWith(existing);
      expect(mockLikeRepo.save).not.toHaveBeenCalled();
      expect(mockNotificationsService.create).not.toHaveBeenCalled();
    });

    it('declares the unique (comment_id, user_id) index the schema already has', () => {
      const { getMetadataArgsStorage } = jest.requireActual('typeorm');
      const index = getMetadataArgsStorage().indices.find(
        (i: any) => i.target === CommentLike && i.unique,
      );

      expect(index).toBeDefined();
      expect(index.name).toBe('idx_comment_likes_unique');
      expect(index.columns).toEqual(['comment_id', 'user_id']);
    });
  });

  describe('deleteComment', () => {
    it('should delete a comment by id', async () => {
      await service.deleteComment('42');

      expect(mockCommentRepo.delete).toHaveBeenCalledWith({ id: '42' });
    });

    it('should delete a different comment id', async () => {
      await service.deleteComment('99');

      expect(mockCommentRepo.delete).toHaveBeenCalledWith({ id: '99' });
    });
  });

  describe('moderatePendingComments', () => {
    it('should return zero counts when no pending comments', async () => {
      mockCommentRepo.find.mockResolvedValue([]);

      const result = await service.moderatePendingComments();

      expect(result).toEqual({ scanned: 0, flagged: 0, ok: 0 });
    });

    it('should scan pending comments and update moderation_status', async () => {
      const pendingComments = [
        { id: '1', content: 'spam comment' },
        { id: '2', content: 'great stock analysis' },
      ];
      mockCommentRepo.find.mockResolvedValue(pendingComments);

      const result = await service.moderatePendingComments();

      expect(result.scanned).toBe(2);
      expect(result.flagged).toBe(1);
      expect(result.ok).toBe(1);
      // Verify update was called for each comment
      expect(mockCommentRepo.update).toHaveBeenCalledTimes(2);
      expect(mockCommentRepo.update).toHaveBeenCalledWith(
        { id: '1' },
        { moderation_status: 'flagged', moderation_reason: 'spam' },
      );
      expect(mockCommentRepo.update).toHaveBeenCalledWith(
        { id: '2' },
        { moderation_status: 'ok', moderation_reason: null },
      );
    });

    it('should throw when GEMINI_API_KEY is missing', async () => {
      mockCommentRepo.find.mockResolvedValue([{ id: '1', content: 'test' }]);

      // Build a service instance with no API key
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
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue(undefined) },
          },
        ],
      }).compile();
      const unconfigured = module.get<SocialService>(SocialService);

      await expect(unconfigured.moderatePendingComments()).rejects.toThrow(
        /GEMINI_API_KEY/,
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

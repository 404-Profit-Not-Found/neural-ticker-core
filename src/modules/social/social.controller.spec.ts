import { Test, TestingModule } from '@nestjs/testing';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

describe('SocialController', () => {
  let controller: SocialController;

  const mockSocialService = {
    getComments: jest.fn(),
    postComment: jest.fn(),
    getWatcherCount: jest.fn(),
    toggleLike: jest.fn(),
    getUserLikedCommentIds: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SocialController],
      providers: [
        {
          provide: SocialService,
          useValue: mockSocialService,
        },
      ],
    }).compile();

    controller = module.get<SocialController>(SocialController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getComments', () => {
    it('should return comments for a symbol', async () => {
      const mockComments = [
        { id: '1', content: 'Great stock!' },
        { id: '2', content: 'Bullish' },
      ];
      mockSocialService.getComments.mockResolvedValue(mockComments);

      const result = await controller.getComments('AAPL');

      expect(result).toEqual(mockComments);
      expect(mockSocialService.getComments).toHaveBeenCalledWith('AAPL');
    });
  });

  describe('postComment', () => {
    it('should post a comment', async () => {
      const mockComment = { id: '1', content: 'Great stock!' };
      mockSocialService.postComment.mockResolvedValue(mockComment);
      const req = { user: { id: 'user123' } };

      const result = await controller.postComment(req, 'AAPL', 'Great stock!');

      expect(result).toEqual(mockComment);
      expect(mockSocialService.postComment).toHaveBeenCalledWith(
        'user123',
        'AAPL',
        'Great stock!',
        undefined,
      );
    });

    it('should post a reply', async () => {
      const mockReply = { id: '2', content: 'I agree!', parent_id: '1' };
      mockSocialService.postComment.mockResolvedValue(mockReply);
      const req = { user: { id: 'user123' } };

      const result = await controller.postComment(req, 'AAPL', 'I agree!', '1');

      expect(result).toEqual(mockReply);
      expect(mockSocialService.postComment).toHaveBeenCalledWith(
        'user123',
        'AAPL',
        'I agree!',
        '1',
      );
    });
  });

  describe('getWatcherCount', () => {
    it('should return watcher count', async () => {
      mockSocialService.getWatcherCount.mockResolvedValue(42);

      const result = await controller.getWatcherCount('AAPL');

      expect(result).toEqual({ symbol: 'AAPL', watchers: 42 });
      expect(mockSocialService.getWatcherCount).toHaveBeenCalledWith('AAPL');
    });
  });
});

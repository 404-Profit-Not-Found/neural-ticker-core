import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ResearchService } from './research.service';
import {
  ResearchNote,
  ResearchStatus,
  LlmProvider,
} from './entities/research-note.entity';
import { LlmService } from '../llm/llm.service';
import { MarketDataService } from '../market-data/market-data.service';
import { UsersService } from '../users/users.service';
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';

describe('ResearchService', () => {
  let service: ResearchService;

  const mockRepo = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    })),
  };

  const mockLlmService = {
    generateResearch: jest.fn(),
  };

  const mockMarketDataService = {
    getSnapshot: jest.fn(),
    upsertFundamentals: jest.fn(),
  };

  const mockUsersService = {
    findById: jest.fn(),
  };

  const mockRiskRewardService = {
    getLatestScore: jest.fn(),
    evaluateFromResearch: jest.fn(),
  };

  const mockNotificationsService = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchService,
        { provide: getRepositoryToken(ResearchNote), useValue: mockRepo },
        { provide: LlmService, useValue: mockLlmService },
        { provide: MarketDataService, useValue: mockMarketDataService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: RiskRewardService, useValue: mockRiskRewardService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ResearchService>(ResearchService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createResearchTicket', () => {
    it('should create and save a PENDING research note', async () => {
      const tickers = ['AAPL'];
      const question = 'Analyze';
      const userId = 'user-1';

      await service.createResearchTicket(userId, tickers, question);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ResearchStatus.PENDING,
          user_id: userId,
          tickers,
          question,
        }),
      );
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should default to gemini provider and deep quality', async () => {
      await service.createResearchTicket('user-1', ['AAPL'], 'Question');

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'gemini',
          quality: 'deep',
        }),
      );
    });
  });

  describe('createManualNote', () => {
    it('should create a manual note with COMPLETED status', async () => {
      const userId = 'user-1';
      const tickers = ['AAPL'];
      const title = 'My Research';
      const content = '# Analysis';

      await service.createManualNote(userId, tickers, title, content);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: LlmProvider.MANUAL,
          quality: 'manual',
          title,
          answer_markdown: content,
          status: ResearchStatus.COMPLETED,
          user_id: userId,
        }),
      );
      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  describe('getResearchNote', () => {
    it('should return a note by id', async () => {
      const note = { id: '1', title: 'Test' };
      mockRepo.findOne.mockResolvedValue(note);

      const result = await service.getResearchNote('1');

      expect(result).toEqual(note);
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
        relations: ['user'],
      });
    });

    it('should return null if not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.getResearchNote('999');

      expect(result).toBeNull();
    });
  });

  describe('deleteResearchNote', () => {
    it('should delete note by id', async () => {
      const note = { id: '1', user_id: 'user-1' };
      mockRepo.findOne.mockResolvedValue(note);
      mockRepo.delete.mockResolvedValue({ affected: 1 });
      mockUsersService.findById.mockResolvedValue({
        id: 'user-1',
        role: 'user',
      });

      await service.deleteResearchNote('1', 'user-1');

      expect(mockRepo.delete).toHaveBeenCalledWith('1');
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const notes = [{ id: '1' }, { id: '2' }];
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
        getManyAndCount: jest.fn().mockResolvedValue([notes, 10]),
      };
      mockRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll('user-1', 'all', 1, 10);

      expect(result).toEqual({
        data: notes,
        total: 10,
        page: 1,
        limit: 10,
      });
    });

    it('should filter by status when not "all"', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.findAll('user-1', 'completed', 1, 10);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'note.status = :status',
        { status: 'completed' },
      );
    });
  });

  describe('failStuckTickets', () => {
    it('should mark stuck tickets as failed', async () => {
      const stuckNote = {
        id: '1',
        status: ResearchStatus.PROCESSING,
        updated_at: new Date(Date.now() - 30 * 60 * 1000), // 30 mins ago
      };
      mockRepo.find.mockResolvedValue([stuckNote]);

      const count = await service.failStuckTickets(20);

      expect(count).toBe(1);
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ResearchStatus.FAILED,
          error: expect.stringContaining('Timeout'),
        }),
      );
    });

    it('should return 0 if no stuck tickets', async () => {
      mockRepo.find.mockResolvedValue([]);

      const count = await service.failStuckTickets(20);

      expect(count).toBe(0);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('updateTitle', () => {
    it('should update title for owner', async () => {
      const note = { id: '1', user_id: 'user-1', title: 'Old' };
      mockRepo.findOne.mockResolvedValue(note);
      mockUsersService.findById.mockResolvedValue({
        id: 'user-1',
        role: 'user',
      });

      const result = await service.updateTitle('1', 'user-1', 'New Title');

      expect(result.title).toBe('New Title');
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should update title for admin', async () => {
      const note = { id: '1', user_id: 'other-user', title: 'Old' };
      mockRepo.findOne.mockResolvedValue(note);
      mockUsersService.findById.mockResolvedValue({
        id: 'admin-1',
        role: 'admin',
      });

      const result = await service.updateTitle('1', 'admin-1', 'Admin Edit');

      expect(result.title).toBe('Admin Edit');
    });

    it('should throw if note not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateTitle('999', 'user-1', 'Title'),
      ).rejects.toThrow('Research note not found');
    });

    it('should throw if unauthorized', async () => {
      const note = { id: '1', user_id: 'other-user', title: 'Old' };
      mockRepo.findOne.mockResolvedValue(note);
      mockUsersService.findById.mockResolvedValue({
        id: 'user-1',
        role: 'user',
      });

      await expect(service.updateTitle('1', 'user-1', 'Title')).rejects.toThrow(
        'Unauthorized',
      );
    });
  });

  describe('processTicket', () => {
    it('should return early if note not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await service.processTicket('999');

      expect(mockLlmService.generateResearch).not.toHaveBeenCalled();
    });
  });
});

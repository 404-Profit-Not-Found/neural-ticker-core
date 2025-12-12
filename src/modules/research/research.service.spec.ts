import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ResearchService } from './research.service';
import { ResearchNote, ResearchStatus } from './entities/research-note.entity';
import { LlmService } from '../llm/llm.service';
import { MarketDataService } from '../market-data/market-data.service';
import { UsersService } from '../users/users.service';
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { ConfigService } from '@nestjs/config';

describe('ResearchService', () => {
  let service: ResearchService;
  let repo: any;
  let llmService: any;
  let marketDataService: any;
  let usersService: any;
  let riskRewardService: any;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockLlmService = {
    generateResearch: jest.fn(),
  };

  const mockMarketDataService = {
    getSnapshot: jest.fn(),
  };

  const mockUsersService = {
    findById: jest.fn(),
  };

  const mockRiskRewardService = {
    getLatestScore: jest.fn(),
    evaluateFromResearch: jest.fn(),
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
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ResearchService>(ResearchService);
    repo = module.get(getRepositoryToken(ResearchNote));
    llmService = module.get(LlmService);
    marketDataService = module.get(MarketDataService);
    usersService = module.get(UsersService);
    riskRewardService = module.get(RiskRewardService);
  });

  afterEach(() => {
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

      repo.create.mockReturnValue({
        id: '1',
        question,
        status: ResearchStatus.PENDING,
      });
      repo.save.mockResolvedValue({
        id: '1',
        question,
        status: ResearchStatus.PENDING,
      });

      const result = await service.createResearchTicket(
        userId,
        tickers,
        question,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ResearchStatus.PENDING,
          user_id: userId,
        }),
      );
      expect(repo.save).toHaveBeenCalled();
      expect(marketDataService.getSnapshot).not.toHaveBeenCalled();
      expect(llmService.generateResearch).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: '1',
        question,
        status: ResearchStatus.PENDING,
      });
    });
  });

  describe('processTicket', () => {
    it('should process a ticket, fetch data, call LLM, and update status', async () => {
      const note = {
        id: '1',
        tickers: ['AAPL'],
        question: 'Q',
        status: ResearchStatus.PENDING,
        user_id: 'u1',
        provider: 'gemini',
        quality: 'deep',
      };
      repo.findOne.mockResolvedValue(note);
      mockMarketDataService.getSnapshot.mockResolvedValue({ price: 100 });
      mockUsersService.findById.mockResolvedValue({
        preferences: { gemini_api_key: 'key' },
      });
      mockRiskRewardService.getLatestScore.mockResolvedValue({
        risk_reward_score: 80,
        risk_score: 20,
        reward_score: 90,
        confidence_level: 'high',
        rationale_markdown: 'Good',
      });
      mockLlmService.generateResearch
        .mockResolvedValueOnce({
          answerMarkdown: 'Answer with key findings about AI demand.',
          models: ['gemini-3'],
          tokensIn: 100,
          tokensOut: 50,
          groundingMetadata: { sources: [] },
          thoughts: 'Thinking...',
        }) // First call: Research
        .mockResolvedValueOnce({
          answerMarkdown: 'NVDA: AI Demand Surge',
          models: ['gemini-3-flash'],
        }); // Second call: Title Generation

      await service.processTicket('1');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(marketDataService.getSnapshot).toHaveBeenCalledWith('AAPL');
      expect(riskRewardService.getLatestScore).toHaveBeenCalledWith('AAPL');
      expect(usersService.findById).toHaveBeenCalledWith('u1');

      // Verify Research Call
      expect(llmService.generateResearch).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          apiKey: 'key',
          provider: 'gemini',
        }),
      );

      // Verify Title Generation Call
      expect(llmService.generateResearch).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          maxTokens: 50,
          quality: 'low',
        }),
      );

      expect(repo.save).toHaveBeenCalledTimes(2);

      // Verify Deep Verification Score trigger
      expect(riskRewardService.evaluateFromResearch).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          answer_markdown: 'Answer with key findings about AI demand.',
          title: 'NVDA: AI Demand Surge',
          full_response: expect.stringContaining('tokensIn'),
          thinking_process: 'Thinking...',
          tokens_in: 100,
          tokens_out: 50,
        }),
      );
    });
  });
});

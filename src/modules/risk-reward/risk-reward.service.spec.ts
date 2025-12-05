import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RiskRewardService } from './risk-reward.service';
import { RiskRewardScore } from './entities/risk-reward-score.entity';
import { LlmService } from '../llm/llm.service';
import { MarketDataService } from '../market-data/market-data.service';

describe('RiskRewardService', () => {
  let service: RiskRewardService;
  let repo: any;
  let llmService: any;
  // let marketDataService: any;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockLlmService = {
    generateResearch: jest.fn(),
  };

  const mockMarketDataService = {
    getSnapshot: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskRewardService,
        { provide: getRepositoryToken(RiskRewardScore), useValue: mockRepo },
        { provide: LlmService, useValue: mockLlmService },
        { provide: MarketDataService, useValue: mockMarketDataService },
      ],
    }).compile();

    service = module.get<RiskRewardService>(RiskRewardService);
    repo = module.get(getRepositoryToken(RiskRewardScore));
    llmService = module.get(LlmService);
    // marketDataService = module.get(MarketDataService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLatestScore', () => {
    it('should return fresh score from DB', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1' },
      });
      const freshScore = { as_of: new Date() }; // Now
      repo.findOne.mockResolvedValue(freshScore);

      const result = await service.getLatestScore('AAPL');
      expect(result).toBe(freshScore);
      expect(llmService.generateResearch).not.toHaveBeenCalled();
    });

    it('should generate new score if stale', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1', symbol: 'AAPL' },
        latestPrice: {},
        fundamentals: {},
      });
      const staleDate = new Date();
      staleDate.setHours(staleDate.getHours() - 2); // 2 hours old
      repo.findOne.mockResolvedValue({ as_of: staleDate });

      // Mock evaluateSymbol internals
      mockLlmService.generateResearch.mockResolvedValue({
        answerMarkdown: '```json\n{"risk_reward_score": 80}\n```',
        models: [],
      });
      repo.create.mockReturnValue({});
      repo.save.mockResolvedValue({ risk_reward_score: 80 });

      const result = await service.getLatestScore('AAPL');
      expect(llmService.generateResearch).toHaveBeenCalled();
      expect(result).toBeDefined();
      if (result) expect(result.risk_reward_score).toBe(80);
    });

    it('should generate new score if missing', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1', symbol: 'AAPL' },
        latestPrice: {},
        fundamentals: {},
      });
      repo.findOne.mockResolvedValue(null);

      mockLlmService.generateResearch.mockResolvedValue({
        answerMarkdown: '```json\n{"risk_reward_score": 80}\n```',
        models: [],
      });
      repo.save.mockResolvedValue({ risk_reward_score: 80 });

      const result = await service.getLatestScore('AAPL');
      expect(result).toBeDefined();
      if (result) expect(result.risk_reward_score).toBe(80);
    });

    it('should fallback to old score on error', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1' },
      });
      const staleDate = new Date();
      staleDate.setHours(staleDate.getHours() - 5);
      const staleScore = { as_of: staleDate, val: 'old' };
      repo.findOne.mockResolvedValue(staleScore);

      // evaluateSymbol fails
      jest
        .spyOn(service, 'evaluateSymbol')
        .mockRejectedValue(new Error('Fail'));

      const result = await service.getLatestScore('AAPL');
      expect(result).toBe(staleScore);
    });
  });

  describe('evaluateSymbol', () => {
    it('should handle JSON parse errors', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1', symbol: 'AAPL' },
        latestPrice: {},
        fundamentals: {},
      });
      mockLlmService.generateResearch.mockResolvedValue({
        answerMarkdown: 'INVALID JSON',
        models: ['gpt'],
      });

      const result = await service.evaluateSymbol('AAPL');
      expect(result).toBeNull();
    });

    it('should map confidence correctly', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1', symbol: 'AAPL' },
        latestPrice: {},
        fundamentals: {},
      });

      // Test with number confidence
      mockLlmService.generateResearch.mockResolvedValueOnce({
        answerMarkdown: '```json\n{"confidence": "90"}\n```',
        models: [],
      });
      repo.create.mockReturnValue({});
      repo.save.mockImplementation((x: any) => x);

      await service.evaluateSymbol('AAPL');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ confidence_level: 'high' }),
      );

      // Test with low string
      mockLlmService.generateResearch.mockResolvedValueOnce({
        answerMarkdown: '```json\n{"confidence": "low"}\n```',
        models: [],
      });
      await service.evaluateSymbol('AAPL');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ confidence_level: 'low' }),
      );
    });
  });

  describe('getScoreHistory', () => {
    it('should return found scores', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1' },
      });
      repo.find.mockResolvedValue([]);
      const res = await service.getScoreHistory('AAPL');
      expect(res).toEqual([]);
    });
  });
});

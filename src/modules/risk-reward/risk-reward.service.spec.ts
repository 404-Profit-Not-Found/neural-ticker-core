import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RiskRewardService } from './risk-reward.service';
import { TickersService } from '../tickers/tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { LlmService } from '../llm/llm.service';
import { RiskRewardScore } from './entities/risk-reward-score.entity';
import { RiskAnalysis } from './entities/risk-analysis.entity';

describe('RiskRewardService', () => {
  let service: RiskRewardService;

  const mockAnalysisRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockOldScoreRepo = {};

  const mockMarketDataService = {
    getSnapshot: jest.fn(),
  };

  const mockLlmService = {
    generateResearch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskRewardService,
        {
          provide: getRepositoryToken(RiskAnalysis),
          useValue: mockAnalysisRepo,
        },
        {
          provide: getRepositoryToken(RiskRewardScore),
          useValue: mockOldScoreRepo,
        },
        {
          provide: MarketDataService,
          useValue: mockMarketDataService,
        },
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
      ],
    }).compile();

    service = module.get<RiskRewardService>(RiskRewardService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLatestScore', () => {
    it('should return null if no score found', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: 'ticker-1' },
      });
      mockAnalysisRepo.findOne.mockResolvedValue(null);

      const result = await service.getLatestScore('AAPL');

      expect(result).toBeNull();
    });

    it('should return found score', async () => {
      const mockScore = { symbol: 'AAPL', overall_score: 90 };
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: 'ticker-1' },
      });
      mockAnalysisRepo.findOne.mockResolvedValue(mockScore);

      const result = await service.getLatestScore('AAPL');

      expect(result).toEqual(mockScore);
    });
  });

  describe('getLatestAnalysis', () => {
    it('should return analysis with relations', async () => {
      const mockAnalysis = {
        id: '1',
        overall_score: 7,
        scenarios: [{ scenario_type: 'bull' }],
      };
      mockAnalysisRepo.findOne.mockResolvedValue(mockAnalysis);

      const result = await service.getLatestAnalysis('ticker-1');

      expect(result).toEqual(mockAnalysis);
      expect(mockAnalysisRepo.findOne).toHaveBeenCalledWith({
        where: { ticker_id: 'ticker-1' },
        order: { created_at: 'DESC' },
        relations: ['scenarios', 'qualitative_factors', 'catalysts'],
      });
    });

    it('should return null when no analysis exists', async () => {
      mockAnalysisRepo.findOne.mockResolvedValue(null);

      const result = await service.getLatestAnalysis('ticker-1');

      expect(result).toBeNull();
    });
  });

  describe('getScoreHistory', () => {
    it('should return analysis history for symbol', async () => {
      const history = [{ id: '1', overall_score: 7 }, { id: '2', overall_score: 8 }];
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: 'ticker-1' },
      });
      mockAnalysisRepo.find.mockResolvedValue(history);

      const result = await service.getScoreHistory('AAPL');

      expect(result).toEqual(history);
      expect(mockAnalysisRepo.find).toHaveBeenCalledWith({
        where: { ticker_id: 'ticker-1' },
        order: { created_at: 'DESC' },
        relations: ['scenarios'],
        take: 10,
      });
    });
  });

  describe('evaluateFromResearch', () => {
    it('should return null if note is falsy', async () => {
      const result = await service.evaluateFromResearch(null);
      expect(result).toBeNull();
    });

    it('should return null if answer_markdown is missing', async () => {
      const result = await service.evaluateFromResearch({ tickers: ['AAPL'] });
      expect(result).toBeNull();
    });

    it('should generate analysis from research note', async () => {
      const mockNote = {
        id: 'note-1',
        tickers: ['AAPL'],
        answer_markdown: 'Research content',
      };

      const mockSnapshot = {
        ticker: { id: 'ticker-1', symbol: 'AAPL' },
        latestPrice: { close: 150 },
        fundamentals: { market_cap: 1000 },
      };

      const detailedJson = JSON.stringify({
        risk_score: { overall: 8 },
        scenarios: {
          bull: { probability: 0.3 },
          base: { probability: 0.5 },
          bear: { probability: 0.2 },
        },
        expected_value: {},
        analyst_summary: {},
        fundamentals: {},
        qualitative: {},
        catalysts: {},
        red_flags: [],
      });

      const mockLlmResponse = {
        answerMarkdown: '```json\n' + detailedJson + '\n```',
      };

      mockMarketDataService.getSnapshot.mockResolvedValue(mockSnapshot);
      mockLlmService.generateResearch.mockResolvedValue(mockLlmResponse);

      const mockSaved = new RiskAnalysis();
      mockAnalysisRepo.save.mockResolvedValue(mockSaved);

      const result = await service.evaluateFromResearch(mockNote);

      expect(result).toBeDefined();
      expect(mockLlmService.generateResearch).toHaveBeenCalled();
      expect(mockAnalysisRepo.save).toHaveBeenCalled();
    });

    it('should handle errors for individual tickers gracefully', async () => {
      const mockNote = {
        id: 'note-1',
        tickers: ['AAPL', 'INVALID'],
        answer_markdown: 'Research content',
      };

      mockMarketDataService.getSnapshot
        .mockResolvedValueOnce({
          ticker: { id: 'ticker-1', symbol: 'AAPL' },
          latestPrice: {},
          fundamentals: {},
        })
        .mockRejectedValueOnce(new Error('Ticker not found'));

      const detailedJson = JSON.stringify({
        risk_score: { overall: 5 },
        scenarios: { bull: { probability: 0.3 }, base: { probability: 0.5 }, bear: { probability: 0.2 } },
      });

      mockLlmService.generateResearch.mockResolvedValue({
        answerMarkdown: '```json\n' + detailedJson + '\n```',
      });
      mockAnalysisRepo.save.mockResolvedValue(new RiskAnalysis());

      const result = await service.evaluateFromResearch(mockNote);

      expect(result).toBeDefined(); // Should still return first successful result
    });
  });
});


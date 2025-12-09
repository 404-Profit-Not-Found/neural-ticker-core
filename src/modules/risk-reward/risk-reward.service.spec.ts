import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RiskRewardService } from './risk-reward.service';
import { AiInsight } from './entities/ai-insight.entity';
import { TickersService } from '../tickers/tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { LlmService } from '../llm/llm.service';
import { RiskRewardScore } from './entities/risk-reward-score.entity';
import { RiskAnalysis } from './entities/risk-analysis.entity';
import { Repository } from 'typeorm';

describe('RiskRewardService', () => {
  let service: RiskRewardService;
  let analysisRepo: Repository<RiskAnalysis>;
  let marketDataService: MarketDataService;
  let llmService: LlmService;

  const mockAnalysisRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockOldScoreRepo = {
    // Only used for constructor, effectively unused
  };

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
    analysisRepo = module.get<Repository<RiskAnalysis>>(getRepositoryToken(RiskAnalysis));
    marketDataService = module.get<MarketDataService>(MarketDataService);
    llmService = module.get<LlmService>(LlmService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLatestScore', () => {
    it('should return null if no score found', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({ ticker: { id: 1 } });
      mockAnalysisRepo.findOne.mockResolvedValue(null);

      const result = await service.getLatestScore('AAPL');

      expect(result).toBeNull();
    });

    it('should return found score', async () => {
      const mockScore = { symbol: 'AAPL', overall_score: 90 };
      mockMarketDataService.getSnapshot.mockResolvedValue({ ticker: { id: 1 } });
      mockAnalysisRepo.findOne.mockResolvedValue(mockScore);

      const result = await service.getLatestScore('AAPL');

      expect(result).toEqual(mockScore);
    });
  });

  describe('evaluateFromResearch', () => {
    it('should generate analysis from research note', async () => {
      // Mock Data
      const mockNote = { 
        id: 'note-1', 
        tickers: ['AAPL'], 
        answer_markdown: '```json\n{"risk_score": {"overall": 8}, "scenarios": {"bull": {"probability": 0.2}}}\n```' 
      };
      
      const mockSnapshot = { 
        ticker: { id: 1, symbol: 'AAPL' }, 
        latestPrice: { close: 150 }, 
        fundamentals: { market_cap: 1000 } 
      };

      const mockLlmResponse = {
        answerMarkdown: '```json\n{"risk_score": {"overall": 8}, "scenarios": {"bull": {"probability": 0.2}}}\n```'
      };

      mockMarketDataService.getSnapshot.mockResolvedValue(mockSnapshot);
      mockLlmService.generateResearch.mockResolvedValue(mockLlmResponse);

      const mockSaved = new RiskAnalysis(); 
      mockAnalysisRepo.save.mockResolvedValue(mockSaved);

      // Mocks for successful parse
      // We need detailed JSON structure that the service expects
      const detailedJson = JSON.stringify({
        risk_score: { overall: 8 },
        scenarios: { bull: { probability: 0.2 } },
        expected_value: {},
        analyst_summary: {},
        fundamentals: {},
        qualitative: {},
        catalysts: {},
        red_flags: []
      });
      mockLlmService.generateResearch.mockResolvedValue({
        answerMarkdown: '```json\n' + detailedJson + '\n```'
      });

      const result = await service.evaluateFromResearch(mockNote);

      expect(result).toBeDefined();
      expect(llmService.generateResearch).toHaveBeenCalled();
      expect(analysisRepo.save).toHaveBeenCalled();
    });
  });
});

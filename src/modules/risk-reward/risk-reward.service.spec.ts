import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RiskRewardService } from './risk-reward.service';
import { RiskRewardScore } from './entities/risk-reward-score.entity';
import { RiskAnalysis } from './entities/risk-analysis.entity';
import { LlmService } from '../llm/llm.service';
import { MarketDataService } from '../market-data/market-data.service';

describe('RiskRewardService', () => {
  let service: RiskRewardService;
  // let analysisRepo: any;
  let llmService: any;
  // let marketDataService: any;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockAnalysisRepo = {
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
        {
          provide: getRepositoryToken(RiskAnalysis),
          useValue: mockAnalysisRepo,
        },
        { provide: LlmService, useValue: mockLlmService },
        { provide: MarketDataService, useValue: mockMarketDataService },
      ],
    }).compile();

    service = module.get<RiskRewardService>(RiskRewardService);
    // analysisRepo = module.get(getRepositoryToken(RiskAnalysis));
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
      const freshScore = { created_at: new Date() }; // Now
      mockAnalysisRepo.findOne.mockResolvedValue(freshScore);

      const result = await service.getLatestScore('AAPL');
      expect(result).toBe(freshScore);
      expect(llmService.generateResearch).not.toHaveBeenCalled();
    });

    it('should return null (and NOT auto-generate) if missing', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1', symbol: 'AAPL' },
        latestPrice: {},
        fundamentals: {},
      });
      mockAnalysisRepo.findOne.mockResolvedValue(null);

      // getLatestScore logic for missing: return null.
      // It might log 'stale/missing', but it calls evaluateSymbol (which we removed public access to or modified behavior).
      // wait, in my implementation I kept `if(isStale) ... evaluateSymbol`.
      // BUT I modified evaluateSymbol to ... actually I didn't change it to be empty.
      // I changed getLatestScore to return `latest || null;` and commented out the generation block!
      // Let's verify my changes in Step 56.

      const result = await service.getLatestScore('AAPL');
      expect(result).toBeNull();
      expect(llmService.generateResearch).not.toHaveBeenCalled();
    });

    it('should return stale score if stale (without regeneration)', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1' },
      });
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 5);
      const staleScore = { created_at: staleDate };
      mockAnalysisRepo.findOne.mockResolvedValue(staleScore);

      const result = await service.getLatestScore('AAPL');
      expect(result).toBe(staleScore);
      expect(llmService.generateResearch).not.toHaveBeenCalled();
    });
  });

  describe('evaluateFromResearch', () => {
    it('should return null if no note or markdown', async () => {
      expect(await service.evaluateFromResearch(null)).toBeNull();
      expect(await service.evaluateFromResearch({})).toBeNull();
    });

    it('should generate analysis from valid research note', async () => {
      const note = {
        id: '123',
        tickers: ['AAPL'],
        answer_markdown: 'Analysis...',
      };

      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1', symbol: 'AAPL' },
        latestPrice: { close: 100 },
        fundamentals: { market_cap: 1000 },
      });

      mockLlmService.generateResearch.mockResolvedValue({
        answerMarkdown:
          '```json\n{"risk_score": {"overall": 8}, "scenarios": {"bull": {"probability": 0.5}}}\n```',
        models: [],
      });

      // mock save
      mockAnalysisRepo.save.mockImplementation((entity) => {
        // verify entity properties
        if (entity.overall_score !== 8) throw new Error('Mapping failed');
        return entity;
      });

      const result = await service.evaluateFromResearch(note);
      expect(llmService.generateResearch).toHaveBeenCalled();
      expect(mockAnalysisRepo.save).toHaveBeenCalled();
      expect(result.overall_score).toBe(8);
    });
  });
});

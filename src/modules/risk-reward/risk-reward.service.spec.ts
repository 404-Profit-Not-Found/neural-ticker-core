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
      const history = [
        { id: '1', overall_score: 7 },
        { id: '2', overall_score: 8 },
      ];
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
        scenarios: {
          bull: { probability: 0.3 },
          base: { probability: 0.5 },
          bear: { probability: 0.2 },
        },
      });

      mockLlmService.generateResearch.mockResolvedValue({
        answerMarkdown: '```json\n' + detailedJson + '\n```',
      });
      mockAnalysisRepo.save.mockResolvedValue(new RiskAnalysis());

      const result = await service.evaluateFromResearch(mockNote);

      expect(result).toBeDefined(); // Should still return first successful result
    });
  });

  describe('salvageFromRaw', () => {
    // Exposed via reflection for testing
    let salvageFromRaw: (raw: string) => any;

    beforeEach(() => {
      // Access private method via prototype
      salvageFromRaw = (service as any).salvageFromRaw.bind(service);
    });

    it('should return null if raw is empty', () => {
      expect(salvageFromRaw('')).toBeNull();
      expect(salvageFromRaw(null as any)).toBeNull();
    });

    it('should return null if overall score is not found', () => {
      const raw = 'some random text without scores';
      expect(salvageFromRaw(raw)).toBeNull();
    });

    it('should extract overall risk score from TOON format', () => {
      const raw = `{
        risk_score: { overall: 7 },
        expected_value: { price_target_weighted: 100 }
      }`;
      const result = salvageFromRaw(raw);
      expect(result).not.toBeNull();
      expect(result.risk_score.overall).toBe(7);
    });

    it('should extract scenario prices from TOON format', () => {
      const raw = `{
        risk_score: { overall: 5 },
        scenarios: {
          bull: { price_target_mid: 150 },
          base: { price_target_mid: 100 },
          bear: { price_target_mid: 50 }
        }
      }`;
      const result = salvageFromRaw(raw);
      expect(result.scenarios.bull.price_target_mid).toBe(150);
      expect(result.scenarios.base.price_target_mid).toBe(100);
      expect(result.scenarios.bear.price_target_mid).toBe(50);
    });

    it('should extract probabilities from TOON format', () => {
      const raw = `{
        risk_score: { overall: 5 },
        scenarios: {
          bull: { probability: 0.30, price_target_mid: 150 },
          base: { probability: 0.45, price_target_mid: 100 },
          bear: { probability: 0.25, price_target_mid: 50 }
        }
      }`;
      const result = salvageFromRaw(raw);
      expect(result.scenarios.bull.probability).toBe(0.3);
      expect(result.scenarios.base.probability).toBe(0.45);
      expect(result.scenarios.bear.probability).toBe(0.25);
    });

    it('should extract qualitative factors from TOON/JSON arrays', () => {
      const raw = `{
        risk_score: { overall: 6 },
        qualitative: {
          strengths: ["strong pipeline", "good management"],
          weaknesses: ["cash burn", "competition"],
          opportunities: ["new market expansion"],
          threats: ["regulatory risk"]
        }
      }`;
      const result = salvageFromRaw(raw);
      expect(result.qualitative.strengths).toContain('strong pipeline');
      expect(result.qualitative.strengths).toContain('good management');
      expect(result.qualitative.weaknesses).toContain('cash burn');
      expect(result.qualitative.opportunities).toContain(
        'new market expansion',
      );
      expect(result.qualitative.threats).toContain('regulatory risk');
    });

    it('should extract catalysts from TOON/JSON arrays', () => {
      const raw = `{
        risk_score: { overall: 4 },
        catalysts: {
          near_term: ["FDA decision in Q1", "earnings report"],
          long_term: ["pipeline expansion", "market growth"]
        }
      }`;
      const result = salvageFromRaw(raw);
      expect(result.catalysts.near_term).toContain('FDA decision in Q1');
      expect(result.catalysts.near_term).toContain('earnings report');
      expect(result.catalysts.long_term).toContain('pipeline expansion');
    });

    it('should extract red_flags from TOON/JSON arrays', () => {
      const raw = `{
        risk_score: { overall: 8 },
        red_flags: ["high debt levels", "management turnover", "SEC investigation"]
      }`;
      const result = salvageFromRaw(raw);
      expect(result.red_flags).toContain('high debt levels');
      expect(result.red_flags).toContain('management turnover');
      expect(result.red_flags).toContain('SEC investigation');
    });

    it('should extract key_drivers for scenarios', () => {
      const raw = `{
        risk_score: { overall: 5 },
        scenarios: {
          bull: { price_target_mid: 200, key_drivers: ["AI growth", "market expansion"] },
          base: { price_target_mid: 150, key_drivers: ["steady growth"] },
          bear: { price_target_mid: 100, key_drivers: ["competition", "margin pressure"] }
        }
      }`;
      const result = salvageFromRaw(raw);
      expect(result.scenarios.bull.key_drivers).toContain('AI growth');
      expect(result.scenarios.base.key_drivers).toContain('steady growth');
      expect(result.scenarios.bear.key_drivers).toContain('margin pressure');
    });

    it('should use default probabilities (25/50/25) when not specified', () => {
      const raw = `{
        risk_score: { overall: 5 },
        scenarios: {
          bull: { price_target_mid: 150 },
          base: { price_target_mid: 100 },
          bear: { price_target_mid: 50 }
        }
      }`;
      const result = salvageFromRaw(raw);
      expect(result.scenarios.bull.probability).toBe(0.25);
      expect(result.scenarios.base.probability).toBe(0.5);
      expect(result.scenarios.bear.probability).toBe(0.25);
    });

    it('should handle text pattern extraction for scenarios', () => {
      const raw = `
        risk_score: { overall: 6 }
        Bull Case: $120
        Base Case: $90
        Bear Case: $60
      `;
      const result = salvageFromRaw(raw);
      expect(result.scenarios.bull.price_target_mid).toBe(120);
      expect(result.scenarios.base.price_target_mid).toBe(90);
      expect(result.scenarios.bear.price_target_mid).toBe(60);
    });

    it('should extract all sub-risk scores', () => {
      const raw = `{
        risk_score: {
          overall: 7,
          financial_risk: 8,
          execution_risk: 6,
          dilution_risk: 5,
          competitive_risk: 7,
          regulatory_risk: 4
        }
      }`;
      const result = salvageFromRaw(raw);
      expect(result.risk_score.overall).toBe(7);
      expect(result.risk_score.financial_risk).toBe(8);
      expect(result.risk_score.execution_risk).toBe(6);
      expect(result.risk_score.dilution_risk).toBe(5);
      expect(result.risk_score.competitive_risk).toBe(7);
      expect(result.risk_score.regulatory_risk).toBe(4);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RiskRewardService } from './risk-reward.service';
import { TickersService } from '../tickers/tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { LlmService } from '../llm/llm.service';
import { ConfigService } from '@nestjs/config';
import { RiskRewardScore } from './entities/risk-reward-score.entity';
import { RiskAnalysis } from './entities/risk-analysis.entity';

describe('RiskRewardService', () => {
  let service: RiskRewardService;

  const mockAnalysisRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
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
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('openai'),
          },
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

    it('should skip auto risk-analysis for multi-ticker notes (M5)', async () => {
      // A note's answer_markdown is ONE combined document; feeding it to the
      // per-ticker extractor for each symbol bleeds one ticker's numbers into
      // another's analysis. Multi-ticker notes are skipped, not contaminated.
      const mockNote = {
        id: 'note-1',
        tickers: ['AAPL', 'MSFT'],
        answer_markdown: 'Research content covering two companies',
      };

      const result = await service.evaluateFromResearch(mockNote);

      expect(result).toBeNull();
      // No extraction work should happen for a skipped multi-ticker note.
      expect(mockMarketDataService.getSnapshot).not.toHaveBeenCalled();
      expect(mockLlmService.generateResearch).not.toHaveBeenCalled();
      expect(mockAnalysisRepo.save).not.toHaveBeenCalled();
    });

    it('should still process a single-ticker note (M5 regression)', async () => {
      const mockNote = {
        id: 'note-1',
        tickers: ['AAPL'],
        answer_markdown: 'Research content',
      };

      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: 'ticker-1', symbol: 'AAPL' },
        latestPrice: { close: 150 },
        fundamentals: {},
      });
      mockLlmService.generateResearch.mockResolvedValue({
        answerMarkdown:
          '```json\n' +
          JSON.stringify({
            risk_score: { overall: 6 },
            scenarios: {
              bull: { probability: 0.3, price_target_mid: 200 },
              base: { probability: 0.5, price_target_mid: 150 },
              bear: { probability: 0.2, price_target_mid: 100 },
            },
          }) +
          '\n```',
      });
      mockAnalysisRepo.save.mockImplementation((a: RiskAnalysis) =>
        Promise.resolve(a),
      );

      const result = await service.evaluateFromResearch(mockNote);

      expect(result).toBeDefined();
      expect(mockLlmService.generateResearch).toHaveBeenCalledTimes(1);
      expect(mockAnalysisRepo.save).toHaveBeenCalledTimes(1);
    });

    it('returns null gracefully when single-ticker extraction throws', async () => {
      const mockNote = {
        id: 'note-1',
        tickers: ['AAPL'],
        answer_markdown: 'Research content',
      };
      mockMarketDataService.getSnapshot.mockRejectedValue(
        new Error('Ticker not found'),
      );

      const result = await service.evaluateFromResearch(mockNote);

      // The per-ticker try/catch swallows the failure; with no successful
      // result the method resolves to null rather than rejecting.
      expect(result).toBeNull();
    });

    it('clamps an overflowing overall score to the numeric(4,2) column max (M3)', async () => {
      const mockNote = {
        id: 'note-1',
        tickers: ['NVDA'],
        answer_markdown: 'Research content',
      };
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: 'ticker-1', symbol: 'NVDA' },
        latestPrice: { close: 150 },
        fundamentals: {},
      });
      // A hallucinated out-of-range rating (>10) would overflow numeric(4,2)
      // (max 99.99 is fine, but the domain max is 10) and corrupt the DB write.
      mockLlmService.generateResearch.mockResolvedValue({
        answerMarkdown:
          '```json\n' +
          JSON.stringify({
            neural_investment_rating: 999,
            risk_score: {
              financial_risk: 42,
              execution_risk: -8,
              dilution_risk: 7,
            },
            scenarios: {
              bull: { probability: 0.3, price_target_mid: 200 },
              base: { probability: 0.5, price_target_mid: 150 },
              bear: { probability: 0.2, price_target_mid: 100 },
            },
          }) +
          '\n```',
      });
      mockAnalysisRepo.save.mockImplementation((a: RiskAnalysis) =>
        Promise.resolve(a),
      );

      const result = await service.evaluateFromResearch(mockNote);

      expect(result).not.toBeNull();
      expect(result!.overall_score).toBe(10); // 999 clamped down
      expect(result!.financial_risk).toBe(10); // 42 clamped down
      expect(result!.execution_risk).toBe(0); // -8 clamped up
      expect(result!.dilution_risk).toBe(7); // in range, untouched
    });

    it('preserves a legitimate 0 risk score and neutralizes missing ones (M4)', async () => {
      const mockNote = {
        id: 'note-1',
        tickers: ['AAPL'],
        answer_markdown: 'Research content',
      };
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: 'ticker-1', symbol: 'AAPL' },
        latestPrice: { close: 150 },
        fundamentals: {},
      });
      // financial_risk is an explicit 0 ("NO RISK") — must survive, not be
      // coerced to 5 by the old `value || 5`. competitive_risk is omitted —
      // must fall back to the neutral 5, not 0.
      mockLlmService.generateResearch.mockResolvedValue({
        answerMarkdown:
          '```json\n' +
          JSON.stringify({
            risk_score: { overall: 6, financial_risk: 0 },
            scenarios: {
              bull: { probability: 0.3, price_target_mid: 200 },
              base: { probability: 0.5, price_target_mid: 150 },
              bear: { probability: 0.2, price_target_mid: 100 },
            },
          }) +
          '\n```',
      });
      mockAnalysisRepo.save.mockImplementation((a: RiskAnalysis) =>
        Promise.resolve(a),
      );

      const result = await service.evaluateFromResearch(mockNote);

      expect(result).not.toBeNull();
      expect(result!.financial_risk).toBe(0); // legitimate 0 preserved
      expect(result!.competitive_risk).toBe(5); // missing -> neutral
    });

    it('normalizes scenario probabilities to sum to 1 (M6)', async () => {
      const mockNote = {
        id: 'note-1',
        tickers: ['AAPL'],
        answer_markdown: 'Research content',
      };
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: 'ticker-1', symbol: 'AAPL' },
        latestPrice: { close: 150 },
        fundamentals: {},
      });
      // Probabilities deliberately do NOT sum to 1 (0.6 + 0.6 + 0.3 = 1.5).
      // They must be renormalized so probability-weighted EV math is correct.
      mockLlmService.generateResearch.mockResolvedValue({
        answerMarkdown:
          '```json\n' +
          JSON.stringify({
            risk_score: { overall: 6 },
            scenarios: {
              bull: { probability: 0.6, price_target_mid: 200 },
              base: { probability: 0.6, price_target_mid: 150 },
              bear: { probability: 0.3, price_target_mid: 100 },
            },
          }) +
          '\n```',
      });
      mockAnalysisRepo.save.mockImplementation((a: RiskAnalysis) =>
        Promise.resolve(a),
      );

      const result = await service.evaluateFromResearch(mockNote);

      expect(result).not.toBeNull();
      const probs = result!.scenarios.map((s) => s.probability);
      const total = probs.reduce((sum, p) => sum + p, 0);
      expect(total).toBeCloseTo(1, 6);
      // Proportions preserved: 0.6/1.5 = 0.4, 0.3/1.5 = 0.2.
      expect(probs[0]).toBeCloseTo(0.4, 6);
      expect(probs[1]).toBeCloseTo(0.4, 6);
      expect(probs[2]).toBeCloseTo(0.2, 6);
    });

    it('falls back to an even probability split when totals are unusable (M6)', async () => {
      const mockNote = {
        id: 'note-1',
        tickers: ['AAPL'],
        answer_markdown: 'Research content',
      };
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: 'ticker-1', symbol: 'AAPL' },
        latestPrice: { close: 150 },
        fundamentals: {},
      });
      // All probabilities zero/garbage -> even split across the 3 present scenarios.
      mockLlmService.generateResearch.mockResolvedValue({
        answerMarkdown:
          '```json\n' +
          JSON.stringify({
            risk_score: { overall: 6 },
            scenarios: {
              bull: { probability: 0, price_target_mid: 200 },
              base: { probability: 0, price_target_mid: 150 },
              bear: { probability: 0, price_target_mid: 100 },
            },
          }) +
          '\n```',
      });
      mockAnalysisRepo.save.mockImplementation((a: RiskAnalysis) =>
        Promise.resolve(a),
      );

      const result = await service.evaluateFromResearch(mockNote);

      expect(result).not.toBeNull();
      const probs = result!.scenarios.map((s) => s.probability);
      probs.forEach((p) => expect(p).toBeCloseTo(1 / 3, 6));
    });
  });

  describe('clampScore (M3/M4)', () => {
    let clampScore: (value: unknown) => number;

    beforeEach(() => {
      clampScore = (service as any).clampScore.bind(service);
    });

    it('clamps an overflowing score down to the domain max of 10', () => {
      expect(clampScore(999)).toBe(10);
      expect(clampScore(10.01)).toBe(10);
    });

    it('clamps a negative score up to 0', () => {
      expect(clampScore(-5)).toBe(0);
    });

    it('preserves a legitimate 0 (NO RISK) instead of coercing it to 5', () => {
      expect(clampScore(0)).toBe(0);
    });

    it('passes an in-range score through unchanged', () => {
      expect(clampScore(7)).toBe(7);
      expect(clampScore(3.5)).toBe(3.5);
    });

    it('coerces in-range numeric strings', () => {
      expect(clampScore('8')).toBe(8);
      expect(clampScore('150')).toBe(10);
    });

    it('falls back to the neutral 5 for non-finite / no-data input', () => {
      expect(clampScore(NaN)).toBe(5);
      expect(clampScore(Infinity)).toBe(5);
      expect(clampScore(-Infinity)).toBe(5);
      expect(clampScore('not a number')).toBe(5);
      expect(clampScore(null)).toBe(5);
      expect(clampScore(undefined)).toBe(5);
      expect(clampScore('')).toBe(5);
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

    it('should extract large market cap values without overflow', () => {
      const raw = `{
        risk_score: { overall: 5 },
        scenarios: {
          bull: { price_target_mid: 200, expected_market_cap: 3500000000000 } // 3.5 Trillion
        }
      }`;
      // In a real scenario, this would go through TypeORM which handles the BigInt/numeric string conversion.
      // Here we just verify the parser doesn't mangle it.
      // Since our salvageFromRaw uses Number(), JS handles integers up to 2^53 safely (9 quadrillion).
      // 3.5T is well within safe integer range for JS logic.
      // The issue was DB column precision.
      const result = salvageFromRaw(raw);
      expect(result.scenarios.bull.expected_market_cap).toBe(3500000000000);
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

    it('surfaces the salvaged overall as neural_investment_rating (regression: H3)', () => {
      // The consumer reads `parsed.neural_investment_rating` first. If salvage
      // never sets it, every salvaged analysis silently collapses to a flat 5.
      const raw = `{ risk_score: { overall: 8 } }`;
      const result = salvageFromRaw(raw);
      expect(result.neural_investment_rating).toBe(8);
      expect(result.risk_score.overall).toBe(8);
    });
  });

  describe('getLastAnalysisAtByTickerId', () => {
    const buildQb = (rows: any[]) => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rows),
      };
      return qb;
    };

    it('returns an empty map without hitting the DB when no ids are given', async () => {
      const result = await service.getLastAnalysisAtByTickerId([]);

      expect(result.size).toBe(0);
      expect(mockAnalysisRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('keys the latest analysis time by internal ticker id', async () => {
      const t1 = new Date('2026-06-01T00:00:00.000Z');
      const t2 = new Date('2026-06-10T00:00:00.000Z');
      const qb = buildQb([
        { ticker_id: '101', last_at: t1.toISOString() },
        { ticker_id: '202', last_at: t2.toISOString() },
      ]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getLastAnalysisAtByTickerId(['101', '202']);

      expect(qb.where).toHaveBeenCalledWith('a.ticker_id IN (:...ids)', {
        ids: ['101', '202'],
      });
      expect(result.get('101')).toBe(t1.getTime());
      expect(result.get('202')).toBe(t2.getTime());
    });

    it('coerces bigint ticker ids returned as numbers to string keys', async () => {
      const t1 = new Date('2026-06-01T00:00:00.000Z');
      const qb = buildQb([{ ticker_id: 101, last_at: t1.toISOString() }]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getLastAnalysisAtByTickerId(['101']);

      // Decision layer keys on String(id); a numeric DB row must still match.
      expect(result.get('101')).toBe(t1.getTime());
      expect(result.has('101')).toBe(true);
    });

    it('skips rows whose last_at is null', async () => {
      const qb = buildQb([{ ticker_id: '303', last_at: null }]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getLastAnalysisAtByTickerId(['303']);

      expect(result.has('303')).toBe(false);
      expect(result.size).toBe(0);
    });
  });
});

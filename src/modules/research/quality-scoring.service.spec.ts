import { Test, TestingModule } from '@nestjs/testing';
import { QualityScoringService } from './quality-scoring.service';
import { LlmService } from '../llm/llm.service';

describe('QualityScoringService', () => {
  let service: QualityScoringService;
  let llmService: Partial<LlmService>;

  beforeEach(async () => {
    llmService = {
      generateResearch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QualityScoringService,
        { provide: LlmService, useValue: llmService },
      ],
    }).compile();

    service = module.get<QualityScoringService>(QualityScoringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return a score and rarity for valid input', async () => {
    const mockReponse = {
      answerMarkdown: JSON.stringify({
        score: 85,
        rarity: 'Rare',
        details: {
          riskRewardAnalysis: 8,
          hallucinationCheck: 9,
          insightDensity: 8,
          comprehensive: 9,
          reasoning: 'Good note.',
        },
      }),
      models: ['gemini-2.5-flash-lite'],
      provider: 'gemini',
    };

    (llmService.generateResearch as jest.Mock).mockResolvedValue(mockReponse);

    const result = await service.score('Sample research content');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score).toBe(85);
      expect(result.rarity).toBe('Rare');
    }
  });

  it('should handle Epic rarity', async () => {
    const mockReponse = {
      answerMarkdown: JSON.stringify({
        score: 90,
        rarity: 'Epic',
        details: {
          riskRewardAnalysis: 9,
          hallucinationCheck: 9,
          insightDensity: 9,
          comprehensive: 9,
          reasoning: 'Epic note.',
        },
      }),
      models: ['gemini-2.5-flash-lite'],
      provider: 'gemini',
    };

    (llmService.generateResearch as jest.Mock).mockResolvedValue(mockReponse);

    const result = await service.score('Epic content');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score).toBe(90);
      expect(result.rarity).toBe('Epic');
    }
  });

  it('should handle loose JSON parsing from LLM', async () => {
    const mockReponse = {
      answerMarkdown:
        'Here is the JSON: ```json\n{ "score": 40, "rarity": "Common", "details": { "reasoning": "ok" } }\n```',
      models: [],
      provider: 'gemini',
    };

    (llmService.generateResearch as jest.Mock).mockResolvedValue(mockReponse);

    // The service uses .match(/\{[\s\S]*\}/) which should extract it
    const result = await service.score('Badly formatted LLM response');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score).toBe(40);
      expect(result.rarity).toBe('Common');
    }
  });

  it('returns { ok: false } on LLM error so callers can leave the score NULL', async () => {
    (llmService.generateResearch as jest.Mock).mockRejectedValue(
      new Error('LLM Failed'),
    );

    const result = await service.score('Fail me');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('LLM Failed');
    }
  });

  it('returns { ok: false } when the LLM response is not valid JSON', async () => {
    (llmService.generateResearch as jest.Mock).mockResolvedValue({
      answerMarkdown: 'totally not json',
      models: [],
      provider: 'gemini',
    });

    const result = await service.score('content');
    expect(result.ok).toBe(false);
  });

  it('returns { ok: false } when the schema is missing score/rarity', async () => {
    (llmService.generateResearch as jest.Mock).mockResolvedValue({
      answerMarkdown: JSON.stringify({ foo: 'bar' }),
      models: [],
      provider: 'gemini',
    });

    const result = await service.score('content');
    expect(result.ok).toBe(false);
  });

  it('clamps an over-100 score and re-derives rarity (L6)', async () => {
    (llmService.generateResearch as jest.Mock).mockResolvedValue({
      answerMarkdown: JSON.stringify({
        score: 150,
        rarity: 'Common',
        details: { reasoning: 'x' },
      }),
      models: [],
      provider: 'gemini',
    });

    const result = await service.score('content');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score).toBe(100);
      expect(result.rarity).toBe('Legendary');
    }
  });

  it('overrides a model rarity that contradicts the score (L6)', async () => {
    (llmService.generateResearch as jest.Mock).mockResolvedValue({
      answerMarkdown: JSON.stringify({
        score: 88,
        rarity: 'Common',
        details: { reasoning: 'x' },
      }),
      models: [],
      provider: 'gemini',
    });

    const result = await service.score('content');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rarity).toBe('Epic');
    }
  });

  describe('clampScore / deriveRarity', () => {
    const clamp = (v: unknown) => (service as any).clampScore(v) as number;
    const rarity = (s: number) => (service as any).deriveRarity(s) as string;

    it('clamps out-of-range and non-finite scores into [0, 100]', () => {
      expect(clamp(150)).toBe(100);
      expect(clamp(-5)).toBe(0);
      expect(clamp(NaN)).toBe(0);
      expect(clamp('not a number')).toBe(0);
      expect(clamp(72.5)).toBe(72.5);
    });

    it('derives rarity from the score bands', () => {
      expect(rarity(0)).toBe('Common');
      expect(rarity(40)).toBe('Common');
      expect(rarity(41)).toBe('Uncommon');
      expect(rarity(70)).toBe('Uncommon');
      expect(rarity(71)).toBe('Rare');
      expect(rarity(85)).toBe('Rare');
      expect(rarity(86)).toBe('Epic');
      expect(rarity(95)).toBe('Epic');
      expect(rarity(96)).toBe('Legendary');
      expect(rarity(100)).toBe('Legendary');
    });
  });
});

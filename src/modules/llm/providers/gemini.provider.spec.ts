import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './gemini.provider';
import { LlmBudgetService } from '../llm-budget.service';
import { ResearchPrompt } from '../llm.types';
import { LlmUnavailableException } from '../llm-unavailable.exception';
import { GEMINI_FLASH_LITE_MODEL } from '../../../config/configuration';
import { GoogleGenAI } from '@google/genai';

// Mock the Google GenAI SDK module structure
jest.mock('@google/genai', () => {
  return {
    GoogleGenAI: jest.fn(),
    ThinkingLevel: { HIGH: 'HIGH' },
  };
});

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  let configService: ConfigService;
  let mockGenerateContent: jest.Mock;
  let mockInteractionsCreate: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGenerateContent = jest.fn();
    mockInteractionsCreate = jest.fn();

    // Setup the mock implementation for this test run
    (GoogleGenAI as unknown as jest.Mock).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
      interactions: {
        create: mockInteractionsCreate,
      },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'gemini.apiKey') return 'test-system-key';
              return null;
            }),
          },
        },
        {
          provide: LlmBudgetService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    provider = module.get<GeminiProvider>(GeminiProvider);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('generate', () => {
    const validPrompt: ResearchPrompt = {
      question: 'Test Question',
      tickers: ['AAPL'],
      numericContext: { AAPL: { price: 100 } },
      quality: 'medium',
    };

    it('with no API key available it is "LLM unavailable" (503), not a plain error (500)', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(null);

      const error = await provider
        .generate({ ...validPrompt, apiKey: undefined })
        .catch((e) => e);

      expect(error).toBeInstanceOf(LlmUnavailableException);
      expect(error.reason).toBe('not_configured');
      expect(error.getStatus()).toBe(503);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should use system API key if not provided in prompt', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Response',
        candidates: [],
      });

      await provider.generate(validPrompt);
      expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-system-key' });
    });

    it('should use prompt API key if provided', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Response',
        candidates: [],
      });

      await provider.generate({ ...validPrompt, apiKey: 'user-key' });
      expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'user-key' });
    });

    it('should use gemini-4-argon for "deep" quality', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Deep Response',
        candidates: [],
      });

      await provider.generate({ ...validPrompt, quality: 'deep' });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-4-argon',
          config: expect.objectContaining({
            tools: expect.arrayContaining([{ googleSearch: {} }]),
            // Argon takes thinking levels, not a token budget.
            thinkingConfig: { includeThoughts: true },
          }),
        }),
      );
    });

    it('should configure Google Search tool', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Search Response',
        candidates: [],
      });

      await provider.generate(validPrompt);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            tools: expect.arrayContaining([{ googleSearch: {} }]),
          }),
        }),
      );
    });

    it('should include Critical Instruction in system prompt', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Response',
        candidates: [],
      });

      await provider.generate(validPrompt);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            systemInstruction: expect.stringContaining(
              'CRITICAL INSTRUCTION: You have access to a "Google Search" tool',
            ),
          }),
        }),
      );
    });

    it('should use flash-lite for "summary" quality without search tools', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Summary',
        candidates: [],
      });

      await provider.generate({ ...validPrompt, quality: 'summary' });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.5-flash-lite',
          config: expect.objectContaining({ tools: undefined }),
        }),
      );
    });

    it('should use flash-lite for "recommendation" quality', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Rec', candidates: [] });

      await provider.generate({ ...validPrompt, quality: 'recommendation' });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.5-flash-lite' }),
      );
    });

    it('should use flash-lite for "scoring" quality without search tools', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Score', candidates: [] });

      await provider.generate({ ...validPrompt, quality: 'scoring' });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.5-flash-lite',
          config: expect.objectContaining({ tools: undefined }),
        }),
      );
    });

    it('should use gemini-3.5-flash-lite for "cron" quality', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Cron', candidates: [] });

      await provider.generate({ ...validPrompt, quality: 'cron' });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.5-flash-lite' }),
      );
    });

    // Flash Lite is ONE default (GEMINI_FLASH_LITE_MODEL) for the user-facing
    // `low` tier and every background tier.
    it.each([
      'low',
      'extraction',
      'cron',
      'summary',
      'recommendation',
      'scoring',
    ] as const)(
      'the %s tier defaults to gemini-3.5-flash-lite',
      async (quality) => {
        mockGenerateContent.mockResolvedValue({ text: 'x', candidates: [] });

        await provider.generate({ ...validPrompt, quality });

        expect(mockGenerateContent).toHaveBeenCalledWith(
          expect.objectContaining({ model: GEMINI_FLASH_LITE_MODEL }),
        );
        expect(GEMINI_FLASH_LITE_MODEL).toBe('gemini-3.5-flash-lite');
      },
    );

    it('a configured model (env override, e.g. GEMINI_MODEL_EXTRACTION) still wins over the default', async () => {
      (configService.get as jest.Mock).mockImplementation((key: string) =>
        key === 'gemini.apiKey'
          ? 'test-system-key'
          : key === 'gemini.models'
            ? { extraction: 'gemini-3.1-flash-lite', low: 'custom-low-model' }
            : null,
      );
      mockGenerateContent.mockResolvedValue({ text: 'x', candidates: [] });

      await provider.generate({ ...validPrompt, quality: 'extraction' });
      await provider.generate({ ...validPrompt, quality: 'low' });
      await provider.generate({ ...validPrompt, quality: 'scoring' });

      expect(
        mockGenerateContent.mock.calls.map(([call]) => call.model),
      ).toEqual([
        'gemini-3.1-flash-lite', // overridden back to the previous default
        'custom-low-model',
        'gemini-3.5-flash-lite', // not overridden: the default
      ]);
    });

    it('a Flash Lite call falls back to the other Flash Lite first on a 429, and that call is still metered', async () => {
      const budget = (provider as any).budgetService;
      const quota = { status: 429, message: '429 quota exceeded' };
      mockGenerateContent
        .mockRejectedValueOnce(quota) // gemini-3.5-flash-lite
        .mockResolvedValue({ text: 'ok', candidates: [] }); // gemini-3.1-flash-lite

      const result = await provider.generate({
        ...validPrompt,
        quality: 'cron',
      });

      expect(
        mockGenerateContent.mock.calls.map(([call]) => call.model),
      ).toEqual(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
      expect(result.models).toEqual(['gemini-3.1-flash-lite']);
      expect(budget.record).toHaveBeenCalledWith(1);
    });

    it('a Flash Lite call reaches the Flash models only after both Flash Lites answer 429', async () => {
      const quota = { status: 429, message: '429 quota exceeded' };
      mockGenerateContent
        .mockRejectedValueOnce(quota) // gemini-3.5-flash-lite
        .mockRejectedValueOnce(quota) // gemini-3.1-flash-lite
        .mockRejectedValueOnce(quota) // gemini-3.8-flash
        .mockResolvedValue({ text: 'ok', candidates: [] }); // gemini-3.5-flash

      await provider.generate({ ...validPrompt, quality: 'low' });

      expect(
        mockGenerateContent.mock.calls.map(([call]) => call.model),
      ).toEqual([
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-3.8-flash',
        'gemini-3.5-flash',
      ]);
    });

    it('a Flash ("medium") call keeps its fallback order: Flash models first, Flash Lite after', async () => {
      const quota = { status: 429, message: '429 quota exceeded' };
      mockGenerateContent
        .mockRejectedValueOnce(quota) // gemini-3.8-flash
        .mockRejectedValueOnce(quota) // gemini-3.5-flash
        .mockResolvedValue({ text: 'ok', candidates: [] }); // gemini-3.5-flash-lite

      await provider.generate({ ...validPrompt, quality: 'medium' });

      expect(
        mockGenerateContent.mock.calls.map(([call]) => call.model),
      ).toEqual([
        'gemini-3.8-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
      ]);
    });

    it('should use gemini-3.5-flash-lite for user-picked "low" quality', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Low', candidates: [] });

      await provider.generate({ ...validPrompt, quality: 'low' });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.5-flash-lite' }),
      );
    });

    it('should use concise system prompt for local text tasks (no search instruction)', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Summary',
        candidates: [],
      });

      await provider.generate({ ...validPrompt, quality: 'summary' });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            systemInstruction: expect.stringContaining(
              'concise financial analyst',
            ),
          }),
        }),
      );
    });

    it('should return result with markdown and models', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Final Answer',
        candidates: [
          {
            groundingMetadata: { searchQueries: ['q1'] },
            content: { parts: [{ thought: true, text: 'Hmm...' }] },
          },
        ],
      });

      const result = await provider.generate(validPrompt);

      expect(result.answerMarkdown).toBe('Final Answer');
      expect(result.models).toContain('gemini-3.8-flash');
      expect(result.groundingMetadata).toBeDefined();
    });

    it('meters successful medium-quality (gemini-3.8-flash) calls against the daily budget (regression: H6)', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'ok', candidates: [] });
      const budget = (provider as any).budgetService;

      // 'medium' resolves to gemini-3.8-flash, which runs on the free key and
      // MUST be counted — it was previously absent from `freeModels`.
      await provider.generate({ ...validPrompt, quality: 'medium' });

      expect(budget.record).toHaveBeenCalledWith(1);
    });

    it('does NOT meter local text tasks (summary/scoring/recommendation) against the budget', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'ok', candidates: [] });
      const budget = (provider as any).budgetService;

      // These run on flash-lite (which IS a metered free model), but they must
      // stay excluded so the daily budget keeps gating research throughput only.
      await provider.generate({ ...validPrompt, quality: 'summary' });
      await provider.generate({ ...validPrompt, quality: 'scoring' });
      await provider.generate({ ...validPrompt, quality: 'recommendation' });

      expect(budget.record).not.toHaveBeenCalled();
    });

    // Background research nobody paid for (cron scans, the initial research of
    // a newly created ticker) runs free-only: whatever happens, the billed
    // secondary key is never used.
    describe('free-only calls and the billed secondary key', () => {
      const quota = { status: 429, message: '429 quota exceeded' };
      const usedBilledKey = (): boolean =>
        (GoogleGenAI as unknown as jest.Mock).mock.calls.some(
          ([options]) => options?.apiKey === 'billed-key',
        );

      beforeEach(() => {
        (configService.get as jest.Mock).mockImplementation((key: string) =>
          key === 'gemini.apiKey'
            ? 'test-system-key'
            : key === 'gemini.secondaryApiKey'
              ? 'billed-key'
              : null,
        );
      });

      const exhaustFreeModelsThenSucceed = () =>
        mockGenerateContent
          .mockRejectedValueOnce(quota)
          .mockRejectedValueOnce(quota)
          .mockRejectedValueOnce(quota)
          .mockRejectedValueOnce(quota)
          .mockResolvedValue({ text: 'from the billed key', candidates: [] });

      it('control — a normal call falls through to the billed key once every free model answers 429', async () => {
        exhaustFreeModelsThenSucceed();

        const result = await provider.generate({ ...validPrompt });

        expect(result.answerMarkdown).toBe('from the billed key');
        expect(usedBilledKey()).toBe(true);
      });

      it.each([
        ['freeOnly: true', { freeOnly: true }],
        ["quality: 'cron'", { quality: 'cron' as const }],
      ])(
        '%s — fails instead, after trying the free models only',
        async (_l, extra) => {
          exhaustFreeModelsThenSucceed();

          await expect(
            provider.generate({ ...validPrompt, ...extra }),
          ).rejects.toEqual(quota);

          expect(mockGenerateContent).toHaveBeenCalledTimes(4);
          expect(usedBilledKey()).toBe(false);
        },
      );

      it('control — a model only the billed key serves switches to it up front', async () => {
        mockGenerateContent.mockResolvedValue({ text: 'ok', candidates: [] });

        await provider.generate({ ...validPrompt, quality: 'deep' });

        expect(usedBilledKey()).toBe(true);
      });

      it('free-only — even such a model stays on the free key', async () => {
        mockGenerateContent.mockResolvedValue({ text: 'ok', candidates: [] });

        await provider.generate({
          ...validPrompt,
          quality: 'deep',
          freeOnly: true,
        });

        expect(usedBilledKey()).toBe(false);
      });
    });
  });
});

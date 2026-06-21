import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './gemini.provider';
import { LlmBudgetService } from '../llm-budget.service';
import { ResearchPrompt } from '../llm.types';
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

    it('should throw error if no API key is available', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(null);
      await expect(
        provider.generate({ ...validPrompt, apiKey: undefined }),
      ).rejects.toThrow('Gemini API Key not configured');
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

    it('should use gemini-3.1-pro-preview for "deep" quality', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Deep Response',
        candidates: [],
      });

      await provider.generate({ ...validPrompt, quality: 'deep' });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.1-pro-preview',
          config: expect.objectContaining({
            tools: expect.arrayContaining([{ googleSearch: {} }]),
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
          model: 'gemini-3.1-flash-lite',
          config: expect.objectContaining({ tools: undefined }),
        }),
      );
    });

    it('should use flash-lite for "recommendation" quality', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Rec', candidates: [] });

      await provider.generate({ ...validPrompt, quality: 'recommendation' });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.1-flash-lite' }),
      );
    });

    it('should use flash-lite for "scoring" quality without search tools', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Score', candidates: [] });

      await provider.generate({ ...validPrompt, quality: 'scoring' });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.1-flash-lite',
          config: expect.objectContaining({ tools: undefined }),
        }),
      );
    });

    it('should use gemini-3.1-flash-lite for "cron" quality', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Cron', candidates: [] });

      await provider.generate({ ...validPrompt, quality: 'cron' });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.1-flash-lite' }),
      );
    });

    it('should use concise system prompt for local text tasks (no search instruction)', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Summary', candidates: [] });

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
      expect(result.models).toContain('gemini-3.5-flash');
      expect(result.groundingMetadata).toBeDefined();
    });

    it('meters successful medium-quality (gemini-3.5-flash) calls against the daily budget (regression: H6)', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'ok', candidates: [] });
      const budget = (provider as any).budgetService;

      // 'medium' resolves to gemini-3.5-flash, which runs on the free key and
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
  });
});

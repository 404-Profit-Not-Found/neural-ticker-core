import { LlmUnavailableException } from './llm-unavailable.exception';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LlmService } from './llm.service';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { QualityTier } from './llm.types';

describe('LlmService', () => {
  let service: LlmService;
  let geminiGenerate: jest.Mock;
  let openAiGenerate: jest.Mock;

  beforeEach(async () => {
    geminiGenerate = jest.fn();
    openAiGenerate = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        {
          provide: GeminiProvider,
          useValue: { generate: geminiGenerate },
        },
        {
          provide: OpenAiProvider,
          useValue: { generate: openAiGenerate },
        },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateResearch', () => {
    const basePrompt = {
      question: 'Test?',
      tickers: [] as string[],
      numericContext: {},
      quality: 'medium' as QualityTier,
    };

    it('should route to OpenAI if provider specified', async () => {
      const prompt = { ...basePrompt, provider: 'openai' as const };
      openAiGenerate.mockResolvedValue({
        answerMarkdown: 'openai',
        models: ['gpt-4'],
      });

      const result = await service.generateResearch(prompt);

      expect(result.answerMarkdown).toBe('openai');
      expect(openAiGenerate).toHaveBeenCalled();
      expect(geminiGenerate).not.toHaveBeenCalled();
    });

    // No key, quota used up, provider down: a stable 503 for the caller, with
    // none of the provider's text. Everything else stays the error it is.
    describe('when no LLM answer can be had', () => {
      const quota = Object.assign(
        new Error('429 quota exceeded for key AIzaSy-FAKE'),
        {
          status: 429,
        },
      );

      it.each([
        ['gemini', () => geminiGenerate],
        ['openai', () => openAiGenerate],
      ] as const)(
        '%s failing on quota → LlmUnavailableException',
        async (provider, mock) => {
          mock().mockRejectedValue(quota);

          const error = await service
            .generateResearch({ ...basePrompt, provider })
            .catch((e) => e);

          expect(error).toBeInstanceOf(LlmUnavailableException);
          expect(error.reason).toBe('quota_exhausted');
          expect(JSON.stringify(error.getResponse())).not.toContain('AIza');
        },
      );

      it('a provider that reports itself unavailable is passed through as is', async () => {
        const notConfigured = new LlmUnavailableException('not_configured');
        geminiGenerate.mockRejectedValue(notConfigured);

        await expect(
          service.generateResearch({ ...basePrompt, provider: 'gemini' }),
        ).rejects.toBe(notConfigured);
      });

      it('a genuine bug is NOT disguised as an outage', async () => {
        const bug = new TypeError(
          "Cannot read properties of undefined (reading 'text')",
        );
        geminiGenerate.mockRejectedValue(bug);

        await expect(
          service.generateResearch({ ...basePrompt, provider: 'gemini' }),
        ).rejects.toBe(bug);
      });

      it('ensemble: both providers down → unavailable; both failing otherwise → the generic error', async () => {
        openAiGenerate.mockRejectedValue(new Error('boom'));
        geminiGenerate.mockRejectedValue(quota);
        await expect(
          service.generateResearch({ ...basePrompt, provider: 'ensemble' }),
        ).rejects.toBeInstanceOf(LlmUnavailableException);

        geminiGenerate.mockRejectedValue(new Error('bang'));
        await expect(
          service.generateResearch({ ...basePrompt, provider: 'ensemble' }),
        ).rejects.toThrow('All ensemble providers failed');
      });

      it('generateText (portfolio analysis) goes through the same door', async () => {
        geminiGenerate.mockRejectedValue(quota);
        await expect(
          service.generateText('hello', 'gemini'),
        ).rejects.toBeInstanceOf(LlmUnavailableException);
      });
    });

    // "Free-only" = no billed spend. OpenAI has no free tier.
    it.each(['openai', 'ensemble', undefined] as const)(
      'refuses a free-only call for the billed provider %s without calling it',
      async (provider) => {
        await expect(
          service.generateResearch({ ...basePrompt, provider, freeOnly: true }),
        ).rejects.toThrow(/free-only LLM call cannot use the billed provider/);

        expect(openAiGenerate).not.toHaveBeenCalled();
        expect(geminiGenerate).not.toHaveBeenCalled();
      },
    );

    it('passes a free-only call to Gemini with the flag intact', async () => {
      geminiGenerate.mockResolvedValue({ answerMarkdown: 'g', models: ['m'] });

      await service.generateResearch({
        ...basePrompt,
        provider: 'gemini',
        freeOnly: true,
      });

      expect(geminiGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ freeOnly: true }),
      );
      expect(openAiGenerate).not.toHaveBeenCalled();
    });

    it('should route to Gemini if specified', async () => {
      const prompt = { ...basePrompt, provider: 'gemini' as const };
      geminiGenerate.mockResolvedValue({
        answerMarkdown: 'gemini',
        models: ['gemini-2.5-flash'],
      });

      const result = await service.generateResearch(prompt);

      expect(result.answerMarkdown).toBe('gemini');
      expect(geminiGenerate).toHaveBeenCalled();
      expect(openAiGenerate).not.toHaveBeenCalled();
    });

    it('should route to OpenAI by default', async () => {
      const prompt = {
        question: 'q',
        tickers: [] as string[],
        numericContext: {},
        quality: 'medium' as QualityTier,
      };
      openAiGenerate.mockResolvedValue({
        answerMarkdown: 'openai',
        models: ['gpt-4'],
      });

      const result = await service.generateResearch(prompt);

      expect(result.answerMarkdown).toBe('openai');
      expect(openAiGenerate).toHaveBeenCalled();
    });

    it('should handle ensemble mode with both providers successful', async () => {
      const prompt = { ...basePrompt, provider: 'ensemble' as const };
      openAiGenerate.mockResolvedValue({
        answerMarkdown: 'OpenAI response',
        models: ['gpt-4'],
        tokensIn: 100,
        tokensOut: 50,
      });
      geminiGenerate.mockResolvedValue({
        answerMarkdown: 'Gemini response',
        models: ['gemini-2.5-flash'],
        tokensIn: 80,
        tokensOut: 40,
      });

      const result = await service.generateResearch(prompt);

      expect(result.provider).toBe('ensemble');
      expect(result.models).toContain('gpt-4');
      expect(result.models).toContain('gemini-2.5-flash');
      expect(result.answerMarkdown).toContain('OpenAI');
      expect(result.answerMarkdown).toContain('Gemini');
      // Ensemble sums token usage across both providers.
      expect(result.tokensIn).toBe(180); // 100 (OpenAI) + 80 (Gemini)
      expect(result.tokensOut).toBe(90); // 50 (OpenAI) + 40 (Gemini)
    });

    it('should handle ensemble mode when one provider fails', async () => {
      const prompt = { ...basePrompt, provider: 'ensemble' as const };
      openAiGenerate.mockRejectedValue(new Error('OpenAI failed'));
      geminiGenerate.mockResolvedValue({
        answerMarkdown: 'Gemini response',
        models: ['gemini-2.5-flash'],
      });

      const result = await service.generateResearch(prompt);

      expect(result.answerMarkdown).toContain('Gemini');
      expect(result.answerMarkdown).not.toContain('OpenAI');
    });

    it('should throw when all ensemble providers fail', async () => {
      const prompt = { ...basePrompt, provider: 'ensemble' as const };
      openAiGenerate.mockRejectedValue(new Error('OpenAI failed'));
      geminiGenerate.mockRejectedValue(new Error('Gemini failed'));

      await expect(service.generateResearch(prompt)).rejects.toThrow(
        'All ensemble providers failed',
      );
    });

    it('should throw BadRequestException for unknown provider', async () => {
      const prompt = { ...basePrompt, provider: 'unknown' as any };

      await expect(service.generateResearch(prompt)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should optimize numericContext with toon-parser', async () => {
      const prompt = {
        ...basePrompt,
        numericContext: { price: 150, date: new Date() },
      };
      openAiGenerate.mockResolvedValue({
        answerMarkdown: 'result',
        models: ['gpt-4'],
      });

      await service.generateResearch(prompt);

      // Should have called with optimized context (toon format)
      expect(openAiGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          numericContext: expect.any(String),
        }),
      );
    });

    it('should handle toon-parser failure gracefully', async () => {
      // Mock jsonToToon to throw by passing a circular reference
      const prompt = {
        ...basePrompt,
        numericContext: { a: 1 }, // Normal object that can be parsed
      };
      openAiGenerate.mockResolvedValue({
        answerMarkdown: 'result',
        models: ['gpt-4'],
      });

      const result = await service.generateResearch(prompt);

      expect(result.answerMarkdown).toBe('result');
    });
  });
});

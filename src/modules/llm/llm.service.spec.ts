import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from './llm.service';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { QualityTier } from './llm.types';

describe('LlmService', () => {
  let service: LlmService;
  let geminiProvider: GeminiProvider;
  let openAiProvider: OpenAiProvider;

  const mockProvider = {
    generate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        {
          provide: GeminiProvider,
          useValue: mockProvider,
        },
        {
          provide: OpenAiProvider,
          useValue: mockProvider,
        },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
    geminiProvider = module.get<GeminiProvider>(GeminiProvider);
    openAiProvider = module.get<OpenAiProvider>(OpenAiProvider);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateResearch', () => {
    it('should route to OpenAI if provider specified', async () => {
      const prompt = {
        question: 'q',
        provider: 'openai' as const,
        quality: 'medium' as QualityTier,
      };
      mockProvider.generate.mockResolvedValue({ answerMarkdown: 'openai' });

      const result = await service.generateResearch(prompt);

      expect(result.answerMarkdown).toBe('openai');
      expect(openAiProvider.generate).toHaveBeenCalledWith(prompt);
      expect(geminiProvider.generate).not.toHaveBeenCalled();
    });

    it('should route to Gemini if specified', async () => {
      const prompt = {
        question: 'q',
        provider: 'gemini' as const,
        quality: 'medium' as QualityTier,
      };
      mockProvider.generate.mockResolvedValue({ answerMarkdown: 'gemini' });

      const result = await service.generateResearch(prompt);

      expect(result.answerMarkdown).toBe('gemini');
      expect(geminiProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'gemini' }),
      );
      expect(openAiProvider.generate).not.toHaveBeenCalled();
    });

    it('should route to OpenAI by default', async () => {
      const prompt = { question: 'q', quality: 'medium' as QualityTier };
      mockProvider.generate.mockResolvedValue({ answerMarkdown: 'openai' });

      const result = await service.generateResearch(prompt);

      expect(result.answerMarkdown).toBe('openai');
      expect(openAiProvider.generate).toHaveBeenCalledWith(expect.anything());
    });
  });
});

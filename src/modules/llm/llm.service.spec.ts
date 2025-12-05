import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from './llm.service';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { ResearchPrompt, ResearchResult } from './llm.types';

describe('LlmService', () => {
  let service: LlmService;
  let openai: any;
  let gemini: any;

  const mockOpenAiProvider = {
    generate: jest.fn(),
  };

  const mockGeminiProvider = {
    generate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        { provide: OpenAiProvider, useValue: mockOpenAiProvider },
        { provide: GeminiProvider, useValue: mockGeminiProvider },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
    openai = module.get(OpenAiProvider);
    gemini = module.get(GeminiProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateResearch', () => {
    const prompt: ResearchPrompt = {
      question: 'Why?',
      tickers: ['A'],
      numericContext: {},
    };

    it('should default to openai', async () => {
      const expected: ResearchResult = { provider: 'openai', models: ['gpt'], answerMarkdown: 'Ok' };
      mockOpenAiProvider.generate.mockResolvedValue(expected);

      const result = await service.generateResearch(prompt);
      expect(result).toEqual(expected);
      expect(openai.generate).toHaveBeenCalledWith(prompt);
      expect(gemini.generate).not.toHaveBeenCalled();
    });

    it('should call gemini when provider is gemini', async () => {
        const expected: ResearchResult = { provider: 'gemini', models: ['gem'], answerMarkdown: 'Ok' };
        mockGeminiProvider.generate.mockResolvedValue(expected);
        
        const result = await service.generateResearch({ ...prompt, provider: 'gemini' });
        expect(result).toEqual(expected);
        expect(gemini.generate).toHaveBeenCalled();
    });

    it('should call both for ensemble', async () => {
        const openaiRes: ResearchResult = { provider: 'openai', models: ['gpt'], answerMarkdown: 'AI answer' };
        const geminiRes: ResearchResult = { provider: 'gemini', models: ['gem'], answerMarkdown: 'Gem answer' };
        
        mockOpenAiProvider.generate.mockResolvedValue(openaiRes);
        mockGeminiProvider.generate.mockResolvedValue(geminiRes);

        const result = await service.generateResearch({ ...prompt, provider: 'ensemble' });
        
        expect(openai.generate).toHaveBeenCalled();
        expect(gemini.generate).toHaveBeenCalled();
        expect(result.provider).toBe('ensemble');
        expect(result.answerMarkdown).toContain('### OpenAI');
        expect(result.answerMarkdown).toContain('### Gemini');
    });
  });
});

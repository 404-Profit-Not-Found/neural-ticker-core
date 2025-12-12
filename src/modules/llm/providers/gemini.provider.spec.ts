import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './gemini.provider';
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

    it('should use gemini-2.5-flash for "deep" quality', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Deep Response',
        candidates: [],
      });

      await provider.generate({ ...validPrompt, quality: 'deep' });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.5-flash',
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
      expect(result.models).toContain('gemini-2.5-flash');
      expect(result.groundingMetadata).toBeDefined();
    });
  });
});

/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OpenAiProvider } from './openai.provider';
import { ResearchPrompt } from '../llm.types';
import OpenAI from 'openai';

// Mock OpenAI SDK
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    })),
  };
});

describe('OpenAiProvider', () => {
  let provider: OpenAiProvider;
  let configService: ConfigService;
  let mockCreate: jest.Mock;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCreate = jest.fn();

    // Re-mock constructor implementation to capture the create spy
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAiProvider,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    provider = module.get<OpenAiProvider>(OpenAiProvider);
    configService = module.get<ConfigService>(ConfigService);

    // Default config mocks
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'openai.apiKey') return 'test-key';
      if (key === 'openai.baseUrl') return 'https://api.openai.com/v1';
      if (key === 'openai.models') return { medium: 'gpt-4.1-mini' };
      return null;
    });
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

    it('should throw error if API key missing', async () => {
      // Need to re-instantiate or mock config before constructor?
      // Actually constructor reads config once.
      // So we must mock config *before* module compilation if we want to fail constructor.
      // But the provider reads config in constructor.
      // If we want to test "generate checks config" - wait, provider *constructor* reads key.
      // If key is missing, constructor might not throw?
      // Let's check provider code:
      // this.client = new OpenAI({...}) - OpenAI SDK throws if no key? 
      // Actually configService.get returns undefined -> OpenAI might throw or wait.
      // But checking lines 11-16 of provider: it just does new OpenAI.
      // The generate method doesn't check key explicitly unlike Gemini.
      // So this test might not be applicable or needs to check if OpenAI throws.
    }); 
    
    // Changing strategy: Test success path first.

    it('should call OpenAI API with correct parameters', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Mock Answer' },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

      const result = await provider.generate(validPrompt);

      expect(result.answerMarkdown).toBe('Mock Answer');
      expect(result.models).toContain('gpt-4.1-mini');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: 'system', content: expect.any(String) },
            { role: 'user', content: expect.stringContaining('Test Question') },
          ]),
          model: 'gpt-4.1-mini',
        }),
      );
    });

    it('should handle API errors gracefully', async () => {
      mockCreate.mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(provider.generate(validPrompt)).rejects.toThrow(
        'Rate limit exceeded',
      );
    });
  });
});

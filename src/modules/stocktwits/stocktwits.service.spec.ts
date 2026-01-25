import { Test, TestingModule } from '@nestjs/testing';
import { StockTwitsService } from './stocktwits.service';
import { HttpService } from '@nestjs/axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StockTwitsPost } from './entities/stocktwits-post.entity';
import { StockTwitsWatcher } from './entities/stocktwits-watcher.entity';
import { StocktwitsAnalysis } from './entities/stocktwits-analysis.entity';
import { EventCalendar } from './entities/event-calendar.entity';
import { TickersService } from '../tickers/tickers.service';
import { LlmService } from '../llm/llm.service';
import { CreditService } from '../users/credit.service';
import { of } from 'rxjs';

describe('StockTwitsService', () => {
  let service: StockTwitsService;
  let llmService: LlmService;
  let analysisRepo: any;
  let calendarRepo: any;

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((dto) => Promise.resolve({ id: '1', ...dto })),
    findAndCount: jest.fn(),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockTickersService = {
    getAllTickers: jest.fn(),
    findOneBySymbol: jest.fn(), // Updated method name
  };

  const mockLlmService = {
    generateText: jest.fn(),
    generateResearch: jest.fn(),
  };

  const mockCreditService = {
    deductCredits: jest.fn().mockResolvedValue({ success: true }),
    getModelCost: jest.fn().mockReturnValue(10),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockTwitsService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: getRepositoryToken(StockTwitsPost), useValue: mockRepo },
        { provide: getRepositoryToken(StockTwitsWatcher), useValue: mockRepo },
        { provide: getRepositoryToken(StocktwitsAnalysis), useValue: mockRepo },
        { provide: getRepositoryToken(EventCalendar), useValue: mockRepo },
        { provide: TickersService, useValue: mockTickersService },
        { provide: LlmService, useValue: mockLlmService },
        { provide: CreditService, useValue: mockCreditService },
      ],
    }).compile();

    service = module.get<StockTwitsService>(StockTwitsService);
    llmService = module.get<LlmService>(LlmService);
    analysisRepo = module.get(getRepositoryToken(StocktwitsAnalysis));
    calendarRepo = module.get(getRepositoryToken(EventCalendar));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyzeComments', () => {
    it('should return null if not enough posts', async () => {
      mockRepo.find.mockResolvedValue([]); // Empty posts
      const result = await service.analyzeComments('AAPL');
      expect(result).toBeNull();
    });

    it('should analyze posts and save analysis + events', async () => {
      // 0. Mock fetchAndStorePosts
      jest.spyOn(service, 'fetchAndStorePosts').mockResolvedValue(undefined);

      // 1. Mock Posts
      const mockPosts = Array(10).fill({
        username: 'user1',
        likes_count: 5,
        body: 'Bullish on earnings!',
        created_at: new Date(),
      });
      mockRepo.find.mockResolvedValue(mockPosts);

      // 2. Mock Ticker
      mockTickersService.findOneBySymbol.mockResolvedValue({
        id: 'ticker-123',
        symbol: 'AAPL',
      });

      // 3. Mock LLM Response
      const mockLlmResponse = {
        answerMarkdown: JSON.stringify({
          sentiment_score: 0.9,
          sentiment_label: 'Bullish',
          summary: 'Very positive.',
          highlights: {
            topics: ['Earnings'],
            bullish_points: [],
            bearish_points: [],
          },
          extracted_events: [
            {
              title: 'Earnings Call',
              date: '2025-01-01',
              type: 'earnings',
              confidence: 0.95,
            },
          ],
        }),
        models: ['gemini-pro'],
        tokensIn: 1000,
        tokensOut: 200,
      };

      // Note: We mocked LlmService with generateText, we need to add generateResearch
      // Since we provided useValue: mockLlmService in test setup, we can just attach it if it was a real object,
      // but here it is a const. We need to update the mock definition in the test file first.

      // ... actually, let me edit the mock definition in the file directly in the next Step.
      // For now, let's assume I fix the mock definition there.
      jest
        .spyOn(llmService, 'generateResearch')
        .mockResolvedValue(mockLlmResponse as any);

      // 4. Run
      const result = await service.analyzeComments('AAPL');

      // 5. Verify Analysis Saved
      expect(analysisRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          sentiment_score: 0.9,
          tokens_used: 1200,
          model_used: 'gemini-pro',
        }),
      );
      expect(analysisRepo.save).toHaveBeenCalled();

      // 6. Verify Events Saved
      expect(calendarRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Earnings Call',
          event_date: '2025-01-01',
        }),
      );
      expect(calendarRepo.save).toHaveBeenCalled();

      expect(result).toBeDefined();
    });
  });
});

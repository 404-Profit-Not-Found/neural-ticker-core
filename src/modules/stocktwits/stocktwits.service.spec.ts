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
  let postsRepo: any;
  let watchersRepo: any;

  const mockHttpService = {
    get: jest.fn().mockReturnValue(of({ data: { messages: [] } })),
  };

  // Flexible query builder that supports both DELETE chains (used by
  // analyzeComments) and aggregate SELECT chains (used by the staleness
  // pickers). Each test can override `getRawMany` to return staleness rows.
  const buildQb = () => ({
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
    getRawMany: jest.fn().mockResolvedValue([]),
  });

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((dto) => Promise.resolve({ id: '1', ...dto })),
    findAndCount: jest.fn(),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => buildQb()),
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
    postsRepo = module.get(getRepositoryToken(StockTwitsPost));
    watchersRepo = module.get(getRepositoryToken(StockTwitsWatcher));
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  describe('pickStaleTickersForPostsSync', () => {
    it('orders never-synced tickers first, then by oldest MAX(inserted_at)', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'TSLA' },
        { symbol: 'MSFT' },
        { symbol: 'NVDA' },
      ]);

      // AAPL: synced yesterday, TSLA: synced 1h ago, MSFT: never, NVDA: synced 5d ago.
      const now = Date.now();
      const yesterday = new Date(now - 24 * 3600 * 1000).toISOString();
      const oneHourAgo = new Date(now - 3600 * 1000).toISOString();
      const fiveDaysAgo = new Date(now - 5 * 24 * 3600 * 1000).toISOString();

      postsRepo.createQueryBuilder.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { symbol: 'AAPL', last_sync: yesterday },
          { symbol: 'TSLA', last_sync: oneHourAgo },
          { symbol: 'NVDA', last_sync: fiveDaysAgo },
        ]),
      });

      const result = await service.pickStaleTickersForPostsSync(3);

      // MSFT (never) → NVDA (oldest) → AAPL → TSLA (newest). Limit 3 cuts TSLA off.
      expect(result).toEqual(['MSFT', 'NVDA', 'AAPL']);
    });

    it('returns empty when there are no tickers', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([]);
      const result = await service.pickStaleTickersForPostsSync(10);
      expect(result).toEqual([]);
    });

    it('falls back to alphabetical for tickers that all share the never-synced state', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'TSLA' },
        { symbol: 'AAPL' },
        { symbol: 'MSFT' },
      ]);
      postsRepo.createQueryBuilder.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      const result = await service.pickStaleTickersForPostsSync(10);
      expect(result).toEqual(['AAPL', 'MSFT', 'TSLA']);
    });

    it('drops tickers that have no symbol property', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: undefined },
        { symbol: '' },
        { symbol: 'MSFT' },
      ]);
      postsRepo.createQueryBuilder.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      const result = await service.pickStaleTickersForPostsSync(10);
      expect(result).toEqual(['AAPL', 'MSFT']);
    });

    it('skips rows whose last_sync column came back null', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'TSLA' },
      ]);
      // Simulate Postgres returning a row with a NULL aggregate (no posts yet).
      postsRepo.createQueryBuilder.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { symbol: 'AAPL', last_sync: null },
          {
            symbol: 'TSLA',
            last_sync: new Date(Date.now() - 3600 * 1000).toISOString(),
          },
        ]),
      });

      // AAPL treated as never-synced (last_sync null) so it sorts first.
      const result = await service.pickStaleTickersForPostsSync(2);
      expect(result).toEqual(['AAPL', 'TSLA']);
    });
  });

  describe('trackWatchers', () => {
    it('saves a watcher row with the count returned by the StockTwits API', async () => {
      mockHttpService.get.mockReturnValueOnce(
        of({
          data: { symbol: { watchlist_count: 12345 } },
        }),
      );

      await service.trackWatchers('AAPL');

      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/AAPL.json'),
        expect.objectContaining({ timeout: 5000 }),
      );
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'AAPL', count: 12345 }),
      );
    });

    it('rejects an invalid symbol before making an HTTP call', async () => {
      await expect(service.trackWatchers('bad symbol!')).rejects.toThrow(
        'Invalid symbol format',
      );
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('silently exits when the API response is missing watchlist_count', async () => {
      mockHttpService.get.mockReturnValueOnce(
        of({ data: { symbol: { id: 1 } } }),
      );
      mockRepo.save.mockClear();

      await service.trackWatchers('AAPL');

      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getFutureEvents', () => {
    it('queries calendar for symbol + today onwards, oldest first', async () => {
      mockRepo.find.mockResolvedValueOnce([{ id: 1 }]);
      const result = await service.getFutureEvents('AAPL');
      expect(mockRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ symbol: 'AAPL' }),
          order: { event_date: 'ASC' },
          take: 10,
        }),
      );
      expect(result).toEqual([{ id: 1 }]);
    });
  });

  describe('pickStaleTickersForWatchersSync', () => {
    it('orders never-synced first, then by oldest MAX(timestamp)', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'TSLA' },
        { symbol: 'MSFT' },
      ]);
      const now = Date.now();
      const oneHourAgo = new Date(now - 3600 * 1000).toISOString();
      const oneDayAgo = new Date(now - 24 * 3600 * 1000).toISOString();

      watchersRepo.createQueryBuilder.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { symbol: 'AAPL', last_sync: oneHourAgo },
          { symbol: 'TSLA', last_sync: oneDayAgo },
        ]),
      });

      // MSFT never-synced → first. TSLA older than AAPL → second. Limit 2 drops AAPL.
      const result = await service.pickStaleTickersForWatchersSync(2);
      expect(result).toEqual(['MSFT', 'TSLA']);
    });

    it('returns empty when there are no tickers', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([]);
      const result = await service.pickStaleTickersForWatchersSync(10);
      expect(result).toEqual([]);
    });
  });

  describe('handleHourlyPostsSync', () => {
    it('processes only the staleness-picked batch and returns stats', async () => {
      jest
        .spyOn(service, 'pickStaleTickersForPostsSync')
        .mockResolvedValue(['AAPL', 'TSLA']);
      const fetchSpy = jest
        .spyOn(service, 'fetchAndStorePosts')
        .mockResolvedValue(undefined);

      const stats = await service.handleHourlyPostsSync(2);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenCalledWith('AAPL', 20);
      expect(fetchSpy).toHaveBeenCalledWith('TSLA', 20);
      expect(stats).toEqual({ batchSize: 2, processed: 2, failed: 0 });
    });

    it('isolates per-ticker errors so a bad ticker cannot abort the batch', async () => {
      jest
        .spyOn(service, 'pickStaleTickersForPostsSync')
        .mockResolvedValue(['AAPL', 'BAD', 'TSLA']);
      const fetchSpy = jest
        .spyOn(service, 'fetchAndStorePosts')
        .mockImplementation((symbol: string) =>
          symbol === 'BAD'
            ? Promise.reject(new Error('boom'))
            : Promise.resolve(undefined),
        );

      const stats = await service.handleHourlyPostsSync(3);

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(stats).toEqual({ batchSize: 3, processed: 2, failed: 1 });
    });

    it('returns zero-stats when there are no tickers to sync', async () => {
      jest.spyOn(service, 'pickStaleTickersForPostsSync').mockResolvedValue([]);
      const fetchSpy = jest.spyOn(service, 'fetchAndStorePosts');

      const stats = await service.handleHourlyPostsSync(10);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(stats).toEqual({ batchSize: 0, processed: 0, failed: 0 });
    });
  });

  describe('handleDailyWatchersSync', () => {
    it('processes only the staleness-picked batch and returns stats', async () => {
      jest
        .spyOn(service, 'pickStaleTickersForWatchersSync')
        .mockResolvedValue(['AAPL', 'TSLA']);
      const trackSpy = jest
        .spyOn(service, 'trackWatchers')
        .mockResolvedValue(undefined);

      const stats = await service.handleDailyWatchersSync(2);

      expect(trackSpy).toHaveBeenCalledTimes(2);
      expect(trackSpy).toHaveBeenCalledWith('AAPL');
      expect(trackSpy).toHaveBeenCalledWith('TSLA');
      expect(stats).toEqual({ batchSize: 2, processed: 2, failed: 0 });
    });

    it('isolates per-ticker errors', async () => {
      jest
        .spyOn(service, 'pickStaleTickersForWatchersSync')
        .mockResolvedValue(['AAPL', 'BAD']);
      jest
        .spyOn(service, 'trackWatchers')
        .mockImplementation((symbol: string) =>
          symbol === 'BAD'
            ? Promise.reject(new Error('boom'))
            : Promise.resolve(undefined),
        );

      const stats = await service.handleDailyWatchersSync(2);

      expect(stats).toEqual({ batchSize: 2, processed: 1, failed: 1 });
    });
  });
});

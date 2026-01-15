import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ResearchService } from './research.service';
import { ResearchNote, ResearchStatus } from './entities/research-note.entity';
import { LlmService } from '../llm/llm.service';
import { WatchlistService } from '../watchlist/watchlist.service';
import { MarketDataService } from '../market-data/market-data.service';
import { UsersService } from '../users/users.service';
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { TickersService } from '../tickers/tickers.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { QualityScoringService } from './quality-scoring.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { CreditService } from '../users/credit.service';

describe('ResearchService - Digest', () => {
  let service: ResearchService;
  let marketDataService: any;
  let llmService: any;
  let portfolioService: any;

  const mockRepo = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((entity) =>
        Promise.resolve({ ...entity, id: 'saved-id' }),
      ),
    findOne: jest.fn(),
    delete: jest.fn(),
  };

  const mockLlmService = {
    generateResearch: jest.fn().mockResolvedValue({
      answerMarkdown: '# Digest',
      models: ['gemini'],
      tokensIn: 100,
      tokensOut: 100,
    }),
  };

  const mockMarketDataService = {
    getAnalyzerTickers: jest.fn(),
  };

  const mockWatchlistService = {
    getUserWatchlists: jest.fn(),
  };

  const mockPortfolioService = {
    findAll: jest.fn(),
  };

  // Mock other dependencies to avoid errors
  const mockUsersService = {};
  const mockRiskRewardService = {};
  const mockNotificationsService = {};
  const mockConfigService = { get: jest.fn() };
  const mockTickersService = {
    getTicker: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchService,
        { provide: getRepositoryToken(ResearchNote), useValue: mockRepo },
        { provide: LlmService, useValue: mockLlmService },
        { provide: MarketDataService, useValue: mockMarketDataService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: RiskRewardService, useValue: mockRiskRewardService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: WatchlistService, useValue: mockWatchlistService },
        { provide: PortfolioService, useValue: mockPortfolioService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: QualityScoringService, useValue: { score: jest.fn() } },
        {
          provide: CreditService,
          useValue: { addCredits: jest.fn(), deductCredits: jest.fn() },
        },
        { provide: TickersService, useValue: mockTickersService },
      ],
    }).compile();

    service = module.get<ResearchService>(ResearchService);
    marketDataService = module.get<MarketDataService>(MarketDataService);
    llmService = module.get<LlmService>(LlmService);
    portfolioService = module.get<PortfolioService>(PortfolioService);
    jest.clearAllMocks();

    // Default mock behavior: User HAS portfolio (Tutorial complete)
    mockPortfolioService.findAll.mockResolvedValue([{ symbol: 'AAPL' }]);
  });

  it('should filter top tickers by impact score', async () => {
    // 1. Mock Watchlist to return 10 tickers
    mockWatchlistService.getUserWatchlists.mockResolvedValue([
      {
        items: [
          { ticker: { symbol: 'AAPL' } },
          { ticker: { symbol: 'MSFT' } },
          { ticker: { symbol: 'NVDA' } },
          { ticker: { symbol: 'TSLA' } },
          { ticker: { symbol: 'GOOGL' } },
          { ticker: { symbol: 'AMZN' } },
          { ticker: { symbol: 'META' } },
          { ticker: { symbol: 'NFLX' } }, // Boring
          { ticker: { symbol: 'INTC' } }, // Boring
          { ticker: { symbol: 'AMD' } }, // Boring
        ],
      },
    ]);

    // 2. Mock Market Data to return rich data with varying changes/news
    mockMarketDataService.getAnalyzerTickers.mockResolvedValue({
      items: [
        {
          ticker: { symbol: 'NVDA' },
          latestPrice: { changePercent: 5.0 },
          counts: { news: 2 },
        }, // Score: 10 + 20 = 30 (Top 1)
        {
          ticker: { symbol: 'TSLA' },
          latestPrice: { changePercent: 3.0 },
          counts: { news: 1 },
        }, // Score: 6 + 10 = 16 (Top 2)
        {
          ticker: { symbol: 'MSFT' },
          latestPrice: { changePercent: 0.1 },
          counts: { news: 10 },
        }, // Score: 0.2 + 100 = 100.2 (Wait, news weighting is 10. So 0.2 + 100 = 100.2. Top 1 actually)
        {
          ticker: { symbol: 'AAPL' },
          latestPrice: { changePercent: -2.0 },
          counts: { news: 0 },
        }, // Score: 4 + 0 = 4 (Passes > 2)
        {
          ticker: { symbol: 'GOOGL' },
          latestPrice: { changePercent: 0.5 },
          counts: { news: 0 },
        }, // Score: 1 + 0 = 1 (Filtered out)
        {
          ticker: { symbol: 'AMZN' },
          latestPrice: { changePercent: 0.0 },
          counts: { news: 0 },
        }, // Score: 0 (Filtered out)
        // Others not returned by analyzer mock (simulating they were boring or not found)
      ],
    });

    // 3. Run Digest
    await service.getOrGenerateDailyDigest('user-1');

    // 4. Verify Filtering
    // Scores:
    // MSFT: 100.2
    // NVDA: 30
    // TSLA: 16
    // AAPL: 4
    // GOOGL: 1 (Filtered < 2)
    // Top 5 slice should include MSFT, NVDA, TSLA, AAPL.

    // Verify LLM call
    expect(mockLlmService.generateResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        tickers: expect.arrayContaining(['MSFT', 'NVDA', 'TSLA', 'AAPL']),
      }),
    );

    // Verify it did NOT include GOOGL or AMZN
    const callArgs = mockLlmService.generateResearch.mock.calls[0][0];
    expect(callArgs.tickers).not.toContain('GOOGL');
    expect(callArgs.tickers).not.toContain('AMZN');

    // Verify Prompt Content
    expect(callArgs.question).toContain('Impact Index');
    expect(callArgs.question).toContain('Sentiment');
    expect(callArgs.question).toContain('SORT stories by Impact Index');
  });

  it('should return null if user has no watchlist tickers (strict mode)', async () => {
    mockWatchlistService.getUserWatchlists.mockResolvedValue([]);
    mockPortfolioService.findAll.mockResolvedValueOnce([]); // Also no portfolio for this test

    // Even if market data has global opportunities, we should NOT use them
    mockMarketDataService.getAnalyzerTickers.mockResolvedValue({
      items: [{ ticker: { symbol: 'HOT1' }, latestPrice: { close: 10 } }],
    });

    const result = await service.getOrGenerateDailyDigest('user-1');

    expect(result).toBeNull();
    expect(mockLlmService.generateResearch).not.toHaveBeenCalled();
  });

  it('should relax filter to top 3 watchlist items if all are boring', async () => {
    mockWatchlistService.getUserWatchlists.mockResolvedValue([
      {
        items: [
          { ticker: { symbol: 'BORING1' } },
          { ticker: { symbol: 'BORING2' } },
          { ticker: { symbol: 'BORING3' } },
        ],
      },
    ]);

    // All scores < 2
    mockMarketDataService.getAnalyzerTickers.mockResolvedValue({
      items: [
        {
          ticker: { symbol: 'BORING1' },
          latestPrice: { changePercent: 0.1 },
          counts: { news: 0 },
        }, // Score 0.2
        {
          ticker: { symbol: 'BORING2' },
          latestPrice: { changePercent: 0.0 },
          counts: { news: 0 },
        }, // Score 0
        {
          ticker: { symbol: 'BORING3' },
          latestPrice: { changePercent: 0.0 },
          counts: { news: 0 },
        }, // Score 0
      ],
    });

    await service.getOrGenerateDailyDigest('user-1');

    // Should included all 3 because it relaxed
    expect(mockLlmService.generateResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        tickers: expect.arrayContaining(['BORING1', 'BORING2', 'BORING3']),
      }),
    );
  });

  it('should return null if user has no portfolio positions (tutorial incomplete)', async () => {
    mockWatchlistService.getUserWatchlists.mockResolvedValue([
      { items: [{ ticker: { symbol: 'AAPL' } }] },
    ]);
    mockPortfolioService.findAll.mockResolvedValueOnce([]); // No positions

    const result = await service.getOrGenerateDailyDigest('user-1');

    expect(result).toBeNull();
    expect(mockLlmService.generateResearch).not.toHaveBeenCalled();
    // Should NOT create pending record? We check before creating.
    expect(mockRepo.create).not.toHaveBeenCalled();
  });
});

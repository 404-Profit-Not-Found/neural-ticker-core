import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JobsService } from './jobs.service';
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { TickersService } from '../tickers/tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { MarketStatusService } from '../market-data/market-status.service';
import { ResearchService } from '../research/research.service';
import { StockTwitsService } from '../stocktwits/stocktwits.service';
import { RequestQueue } from './entities/request-queue.entity';
import { PortfolioService } from '../portfolio/portfolio.service';
import { LlmBudgetService } from '../llm/llm-budget.service';

describe('JobsService', () => {
  let service: JobsService;

  const mockRiskRewardService = {
    evaluateSymbol: jest.fn(),
    getLatestScore: jest.fn(),
    getLastAnalysisAtByTickerId: jest.fn().mockResolvedValue(new Map()),
    deleteOrphanedAnalyses: jest.fn(),
  };

  const mockLlmBudgetService = {
    getRemaining: jest.fn().mockResolvedValue(450),
    hasBudget: jest.fn().mockResolvedValue(true),
    record: jest.fn().mockResolvedValue(undefined),
    getUsageToday: jest.fn().mockResolvedValue(0),
  };

  const mockTickersService = {
    getAllTickers: jest.fn(),
    ensureTicker: jest.fn(),
  };

  const mockMarketDataService = {
    getSnapshot: jest.fn(),
    getHistory: jest.fn().mockResolvedValue([]),
    syncTickerHistory: jest.fn().mockResolvedValue(undefined),
    dedupeAnalystRatings: jest.fn().mockResolvedValue({ removed: 0 }),
    pickStaleSnapshotTickers: jest.fn(),
  };

  const mockResearchService = {
    failStuckTickets: jest.fn(),
    createResearchTicket: jest.fn(),
    processTicket: jest.fn(),
    getOrGenerateDailyDigest: jest.fn(),
    reprocessFinancials: jest.fn(),
    getLastResearchedAtBySymbol: jest.fn().mockResolvedValue(new Map()),
  };

  const mockRequestQueueRepo = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockMarketStatusService = {
    getAllMarketsStatus: jest.fn().mockResolvedValue({
      us: { isOpen: true, session: 'regular' },
      eu: { isOpen: true, session: 'regular' },
    }),
    getMarketStatus: jest
      .fn()
      .mockResolvedValue({ isOpen: true, session: 'regular' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: RiskRewardService, useValue: mockRiskRewardService },
        { provide: TickersService, useValue: mockTickersService },
        { provide: MarketDataService, useValue: mockMarketDataService },
        { provide: MarketStatusService, useValue: mockMarketStatusService },
        { provide: ResearchService, useValue: mockResearchService },
        { provide: StockTwitsService, useValue: {} },

        {
          provide: getRepositoryToken(RequestQueue),
          useValue: mockRequestQueueRepo,
        },
        {
          provide: PortfolioService,
          useValue: {
            updateActivePortfolios: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(24) },
        },
        { provide: LlmBudgetService, useValue: mockLlmBudgetService },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('syncDailyCandles (hourly stale-first batch)', () => {
    it('asks market-data for the stale-first batch and syncs only those', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'TSLA' },
        { symbol: 'MSFT' },
      ]);
      // Picker returns just two of the three — the batch limit in effect.
      mockMarketDataService.pickStaleSnapshotTickers.mockResolvedValue([
        'MSFT',
        'AAPL',
      ]);
      mockMarketDataService.getSnapshot.mockResolvedValue({});

      const result = await service.syncDailyCandles();

      expect(
        mockMarketDataService.pickStaleSnapshotTickers,
      ).toHaveBeenCalledWith(
        ['AAPL', 'TSLA', 'MSFT'],
        JobsService.DAILY_CANDLES_BATCH_SIZE,
      );
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledTimes(2);
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('MSFT');
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('AAPL');
      expect(mockMarketDataService.getSnapshot).not.toHaveBeenCalledWith(
        'TSLA',
      );
      expect(mockMarketDataService.syncTickerHistory).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({ processed: 2, failed: 0, batchSize: 2 });
    });

    it('counts per-ticker errors without aborting the rest of the batch', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'FAIL' },
      ]);
      mockMarketDataService.pickStaleSnapshotTickers.mockResolvedValue([
        'AAPL',
        'FAIL',
      ]);
      mockMarketDataService.getSnapshot
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Sync failed'));

      const result = await service.syncDailyCandles();

      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({ processed: 1, failed: 1, batchSize: 2 });
    });

    it('should handle global errors', async () => {
      mockTickersService.getAllTickers.mockRejectedValue(
        new Error('Global fail'),
      );
      await expect(service.syncDailyCandles()).rejects.toThrow('Global fail');
    });

    it('drops tickers without a symbol before picking the batch', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([{ no_symbol: '?' }]);
      mockMarketDataService.pickStaleSnapshotTickers.mockResolvedValue([]);

      await service.syncDailyCandles();

      expect(
        mockMarketDataService.pickStaleSnapshotTickers,
      ).toHaveBeenCalledWith([], JobsService.DAILY_CANDLES_BATCH_SIZE);
      expect(mockMarketDataService.getSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('syncSnapshots (batched)', () => {
    let sleepSpy: jest.SpyInstance;

    beforeEach(() => {
      sleepSpy = jest
        .spyOn(global, 'setTimeout')
        // Resolve immediately to keep the test fast
        .mockImplementation((callback: any) => {
          callback();
          return {} as NodeJS.Timeout;
        });
    });

    afterEach(() => {
      sleepSpy.mockRestore();
    });

    it('returns skipped:true when all markets are closed', async () => {
      mockMarketStatusService.getAllMarketsStatus.mockResolvedValueOnce({
        us: { isOpen: false, session: 'closed' },
        eu: { isOpen: false, session: 'closed' },
      });

      const result = await service.syncSnapshots();

      expect(result).toMatchObject({ skipped: true });
      expect(
        mockMarketDataService.pickStaleSnapshotTickers,
      ).not.toHaveBeenCalled();
    });

    it('asks market-data for the stale-first batch and syncs only those', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'TSLA' },
        { symbol: 'MSFT' },
      ]);
      // Picker returns just two of the three — the batch limit in effect.
      mockMarketDataService.pickStaleSnapshotTickers.mockResolvedValue([
        'MSFT',
        'AAPL',
      ]);
      mockMarketDataService.getSnapshot.mockResolvedValue({});

      const result = await service.syncSnapshots();

      expect(
        mockMarketDataService.pickStaleSnapshotTickers,
      ).toHaveBeenCalledWith(
        ['AAPL', 'TSLA', 'MSFT'],
        JobsService.SNAPSHOTS_BATCH_SIZE,
      );
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledTimes(2);
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('MSFT');
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('AAPL');
      expect(mockMarketDataService.getSnapshot).not.toHaveBeenCalledWith(
        'TSLA',
      );
      expect(result).toMatchObject({
        success: 2,
        failed: 0,
        batchSize: 2,
        skipped: false,
      });
    });

    it('skips a batch ticker whose own market is closed without failing the batch', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL', exchange: 'US' },
        { symbol: 'SAP', exchange: 'EU' },
      ]);
      mockMarketDataService.pickStaleSnapshotTickers.mockResolvedValue([
        'AAPL',
        'SAP',
      ]);
      mockMarketStatusService.getMarketStatus
        .mockResolvedValueOnce({ isOpen: true, session: 'regular' })
        .mockResolvedValueOnce({ isOpen: false, session: 'closed' });
      mockMarketDataService.getSnapshot.mockResolvedValue({});

      const result = await service.syncSnapshots();

      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledTimes(1);
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('AAPL');
      expect(result).toMatchObject({
        success: 1,
        failed: 0,
        skippedMarketClosed: 1,
        batchSize: 2,
      });
    });

    it('counts per-ticker errors without aborting the rest of the batch', async () => {
      mockTickersService.getAllTickers.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'BAD' },
      ]);
      mockMarketDataService.pickStaleSnapshotTickers.mockResolvedValue([
        'AAPL',
        'BAD',
      ]);
      mockMarketDataService.getSnapshot
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('finnhub 500'));

      const result = await service.syncSnapshots();

      expect(result).toMatchObject({
        success: 1,
        failed: 1,
        batchSize: 2,
      });
    });
  });

  describe('runRiskRewardScanner', () => {
    it('queues a cron-tier ticket only for tickers that are due (stale-first)', async () => {
      const sleepSpy = jest
        .spyOn(global, 'setTimeout')
        // Resolve immediately to keep the test fast
        .mockImplementation((callback: any) => {
          callback();
          return {} as NodeJS.Timeout;
        });

      mockLlmBudgetService.getRemaining.mockResolvedValue(450);
      mockLlmBudgetService.hasBudget.mockResolvedValue(true);
      mockTickersService.getAllTickers.mockResolvedValue([
        { id: '1', symbol: 'AAPL' },
        { id: '2', symbol: 'TSLA' },
      ]);
      // AAPL has never been researched; TSLA was researched moments ago, so only
      // AAPL is due this run.
      mockRiskRewardService.getLastAnalysisAtByTickerId.mockResolvedValue(
        new Map(),
      );
      mockResearchService.getLastResearchedAtBySymbol.mockResolvedValue(
        new Map([['TSLA', Date.now()]]),
      );
      mockResearchService.createResearchTicket.mockResolvedValue({
        id: 'note-1',
      });
      mockResearchService.processTicket.mockResolvedValue(undefined);

      const result = await service.runRiskRewardScanner();

      expect(mockTickersService.getAllTickers).toHaveBeenCalled();
      // Recency is looked up by internal id (analyses) and symbol (notes).
      expect(
        mockRiskRewardService.getLastAnalysisAtByTickerId,
      ).toHaveBeenCalledWith(['1', '2']);
      expect(
        mockResearchService.getLastResearchedAtBySymbol,
      ).toHaveBeenCalledWith(['AAPL', 'TSLA']);
      expect(mockResearchService.createResearchTicket).toHaveBeenCalledTimes(1);
      expect(mockResearchService.createResearchTicket).toHaveBeenCalledWith(
        null,
        ['AAPL'],
        expect.any(String),
        'gemini',
        'cron',
      );
      expect(mockResearchService.processTicket).toHaveBeenCalledWith('note-1');
      expect(result).toMatchObject({ processed: 1, errors: 0, due: 1 });

      sleepSpy.mockRestore();
    });

    // Regression: the reported bug. Forvia (FRVIA.PA) was researched ~12x/day
    // because the gate only read risk_analyses, and that ticker's analysis row
    // was never written (the enrichment that writes it is best-effort and
    // swallows errors). The research_notes record IS written every run, so a
    // ticker researched within the window must never be re-queued — even with
    // zero risk_analyses rows.
    it('does NOT re-queue a ticker researched within the window when it has no risk_analysis row', async () => {
      mockLlmBudgetService.getRemaining.mockResolvedValue(450);
      mockLlmBudgetService.hasBudget.mockResolvedValue(true);
      mockTickersService.getAllTickers.mockResolvedValue([
        { id: '10', symbol: 'FRVIA.PA' },
      ]);
      // No analysis row exists for this ticker (the silent-write-failure case)...
      mockRiskRewardService.getLastAnalysisAtByTickerId.mockResolvedValue(
        new Map(),
      );
      // ...but it was researched moments ago, so the note recency must gate it.
      mockResearchService.getLastResearchedAtBySymbol.mockResolvedValue(
        new Map([['FRVIA.PA', Date.now()]]),
      );

      const result = await service.runRiskRewardScanner();

      expect(mockResearchService.createResearchTicket).not.toHaveBeenCalled();
      expect(mockResearchService.processTicket).not.toHaveBeenCalled();
      expect(result).toMatchObject({ processed: 0, due: 0 });
    });

    it('re-queues a ticker once its last research is older than the window', async () => {
      const sleepSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((callback: any) => {
          callback();
          return {} as NodeJS.Timeout;
        });

      mockLlmBudgetService.getRemaining.mockResolvedValue(450);
      mockLlmBudgetService.hasBudget.mockResolvedValue(true);
      mockTickersService.getAllTickers.mockResolvedValue([
        { id: '10', symbol: 'FRVIA.PA' },
      ]);
      mockRiskRewardService.getLastAnalysisAtByTickerId.mockResolvedValue(
        new Map(),
      );
      // Researched 30 days ago — comfortably past any staleness window.
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      mockResearchService.getLastResearchedAtBySymbol.mockResolvedValue(
        new Map([['FRVIA.PA', thirtyDaysAgo]]),
      );
      mockResearchService.createResearchTicket.mockResolvedValue({
        id: 'note-9',
      });
      mockResearchService.processTicket.mockResolvedValue(undefined);

      const result = await service.runRiskRewardScanner();

      expect(mockResearchService.createResearchTicket).toHaveBeenCalledWith(
        null,
        ['FRVIA.PA'],
        expect.any(String),
        'gemini',
        'cron',
      );
      expect(result).toMatchObject({ processed: 1, due: 1 });

      sleepSpy.mockRestore();
    });

    it('drops tickers without an id or symbol before selecting the batch', async () => {
      mockLlmBudgetService.getRemaining.mockResolvedValue(450);
      mockLlmBudgetService.hasBudget.mockResolvedValue(true);
      mockTickersService.getAllTickers.mockResolvedValue([
        { id: '1', symbol: 'AAPL' },
        { symbol: 'NOID' }, // missing id
        { id: '2' }, // missing symbol
      ]);
      mockRiskRewardService.getLastAnalysisAtByTickerId.mockResolvedValue(
        new Map(),
      );
      mockResearchService.getLastResearchedAtBySymbol.mockResolvedValue(
        new Map(),
      );

      await service.runRiskRewardScanner();

      // Only the fully-formed candidate's id/symbol reach the recency lookups.
      expect(
        mockRiskRewardService.getLastAnalysisAtByTickerId,
      ).toHaveBeenCalledWith(['1']);
      expect(
        mockResearchService.getLastResearchedAtBySymbol,
      ).toHaveBeenCalledWith(['AAPL']);
    });

    it('skips the whole scan when the daily LLM budget is exhausted', async () => {
      mockLlmBudgetService.getRemaining.mockResolvedValue(0);
      mockTickersService.getAllTickers.mockResolvedValue([
        { id: '1', symbol: 'AAPL' },
      ]);

      const result = await service.runRiskRewardScanner();

      expect(result).toMatchObject({ budgetExhausted: true, processed: 0 });
      expect(
        mockRiskRewardService.getLastAnalysisAtByTickerId,
      ).not.toHaveBeenCalled();
      expect(mockResearchService.createResearchTicket).not.toHaveBeenCalled();
    });

    it('stops early when the budget drains mid-scan', async () => {
      const sleepSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((callback: any) => {
          callback();
          return {} as NodeJS.Timeout;
        });

      mockLlmBudgetService.getRemaining.mockResolvedValue(450);
      // Budget available for the first ticket, gone before the second.
      mockLlmBudgetService.hasBudget
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockTickersService.getAllTickers.mockResolvedValue([
        { id: '1', symbol: 'AAPL' },
        { id: '2', symbol: 'MSFT' },
      ]);
      // Both never researched → both due (alphabetical: AAPL, MSFT).
      mockRiskRewardService.getLastAnalysisAtByTickerId.mockResolvedValue(
        new Map(),
      );
      mockResearchService.getLastResearchedAtBySymbol.mockResolvedValue(
        new Map(),
      );
      mockResearchService.createResearchTicket.mockResolvedValue({
        id: 'note-1',
      });
      mockResearchService.processTicket.mockResolvedValue(undefined);

      const result = await service.runRiskRewardScanner();

      expect(mockResearchService.createResearchTicket).toHaveBeenCalledTimes(1);
      expect(mockResearchService.createResearchTicket).toHaveBeenCalledWith(
        null,
        ['AAPL'],
        expect.any(String),
        'gemini',
        'cron',
      );
      expect(result).toMatchObject({ processed: 1, due: 2 });

      sleepSpy.mockRestore();
    });
  });

  describe('selectDueTickers (pure staleness gate)', () => {
    const HOUR = 60 * 60 * 1000;
    const WINDOW = 168 * HOUR; // 7 days
    const NOW = 1_700_000_000_000;

    it('treats a never-researched ticker as due', () => {
      const due = JobsService.selectDueTickers(
        [{ id: '1', symbol: 'AAPL' }],
        new Map(),
        NOW,
        WINDOW,
        5,
      );
      expect(due.map((c) => c.symbol)).toEqual(['AAPL']);
    });

    it('excludes a ticker researched within the window (the core fix)', () => {
      const due = JobsService.selectDueTickers(
        [{ id: '1', symbol: 'FRVIA.PA' }],
        new Map([['1', NOW - 1 * HOUR]]), // researched 1h ago
        NOW,
        WINDOW,
        5,
      );
      expect(due).toEqual([]);
    });

    it('includes a ticker whose last research is older than the window', () => {
      const due = JobsService.selectDueTickers(
        [{ id: '1', symbol: 'FRVIA.PA' }],
        new Map([['1', NOW - 200 * HOUR]]), // researched ~8.3 days ago
        NOW,
        WINDOW,
        5,
      );
      expect(due.map((c) => c.symbol)).toEqual(['FRVIA.PA']);
    });

    it('orders never-researched first (alphabetical), then oldest first', () => {
      const candidates = [
        { id: '1', symbol: 'AAPL' }, // researched 10h ago
        { id: '2', symbol: 'ZZZ' }, // never researched
        { id: '3', symbol: 'MSFT' }, // researched 300h ago (most stale)
        { id: '4', symbol: 'BBB' }, // never researched
      ];
      const map = new Map([
        ['1', NOW - 10 * HOUR],
        ['3', NOW - 300 * HOUR],
      ]);
      const due = JobsService.selectDueTickers(
        candidates,
        map,
        NOW,
        WINDOW,
        10,
      );
      // never-researched (BBB, ZZZ alphabetical) then oldest-first (MSFT before
      // AAPL — but AAPL is within the 7d window so it isn't due at all).
      expect(due.map((c) => c.symbol)).toEqual(['BBB', 'ZZZ', 'MSFT']);
    });

    it('respects the limit', () => {
      const candidates = [
        { id: '1', symbol: 'AAA' },
        { id: '2', symbol: 'BBB' },
        { id: '3', symbol: 'CCC' },
      ];
      const due = JobsService.selectDueTickers(
        candidates,
        new Map(),
        NOW,
        WINDOW,
        2,
      );
      expect(due.map((c) => c.symbol)).toEqual(['AAA', 'BBB']);
    });
  });
});

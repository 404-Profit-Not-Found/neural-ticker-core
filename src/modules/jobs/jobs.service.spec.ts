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
import {
  RequestQueue,
  RequestStatus,
  RequestType,
} from './entities/request-queue.entity';
import { TickerCreationCapException } from '../tickers/tickers.service';
import { currentActor } from '../../common/request-actor/request-actor';
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
    failPendingTicket: jest.fn().mockResolvedValue(undefined),
    getOrGenerateDailyDigest: jest.fn(),
    reprocessFinancials: jest.fn(),
    getLastResearchedAtBySymbol: jest.fn().mockResolvedValue(new Map()),
  };

  const mockScannerLockQuery = jest.fn().mockResolvedValue([]);
  const mockRequestQueueRepo = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    // The scanner claims its batch inside manager.transaction under an
    // advisory lock; run the callback inline with a stub transaction manager.
    manager: {
      transaction: jest.fn((cb: (mgr: any) => Promise<unknown>) =>
        cb({ query: mockScannerLockQuery }),
      ),
    },
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

  // The gate itself and "every @Cron handler is behind it":
  // src/common/background-jobs.spec.ts.
  describe('BACKGROUND_JOBS switch', () => {
    const before = process.env.BACKGROUND_JOBS;
    afterEach(() => {
      if (before === undefined) delete process.env.BACKGROUND_JOBS;
      else process.env.BACKGROUND_JOBS = before;
    });

    it('scheduled handlers do nothing with BACKGROUND_JOBS=off', async () => {
      process.env.BACKGROUND_JOBS = 'off';

      await (service as any).processPendingRequestsCron();
      await (service as any).syncDailyCandlesCron();

      expect(mockRequestQueueRepo.find).not.toHaveBeenCalled();
      expect(mockTickersService.getAllTickers).not.toHaveBeenCalled();
    });

    it('and run as before without it', async () => {
      delete process.env.BACKGROUND_JOBS;

      await (service as any).processPendingRequestsCron();

      expect(mockRequestQueueRepo.find).toHaveBeenCalledTimes(1);
    });

    it('the same work is still available on request (the cron endpoints call these)', async () => {
      process.env.BACKGROUND_JOBS = 'off';

      await service.processPendingRequests();

      expect(mockRequestQueueRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  // The automatic work for a newly created ticker. Nobody paid for it, so it
  // obeys the scanner's rules: needs free budget, never the billed key, once.
  describe('initializeTicker', () => {
    beforeEach(() => {
      mockMarketDataService.getSnapshot.mockResolvedValue({});
      mockLlmBudgetService.hasBudget.mockResolvedValue(true);
      mockResearchService.getLastResearchedAtBySymbol.mockResolvedValue(
        new Map(),
      );
      mockResearchService.createResearchTicket.mockResolvedValue({ id: '501' });
      mockResearchService.processTicket.mockResolvedValue(undefined);
    });

    it('syncs snapshot + history, then runs ONE free-only research ticket', async () => {
      await service.initializeTicker('nvda');

      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('NVDA');
      expect(mockMarketDataService.syncTickerHistory).toHaveBeenCalledWith(
        'NVDA',
        5,
      );
      expect(mockResearchService.createResearchTicket).toHaveBeenCalledTimes(1);
      expect(mockResearchService.createResearchTicket).toHaveBeenCalledWith(
        null,
        ['NVDA'],
        expect.stringContaining('initial analysis for NVDA'),
        'gemini',
        'low',
      );
      // free-only: the research call and every enrichment call after it
      expect(mockResearchService.processTicket).toHaveBeenCalledTimes(1);
      expect(mockResearchService.processTicket).toHaveBeenCalledWith('501', {
        freeOnly: true,
      });
    });

    it('with no free LLM budget left: snapshot and history still run, the research is skipped cleanly (no ticket)', async () => {
      mockLlmBudgetService.hasBudget.mockResolvedValue(false);

      await service.initializeTicker('NVDA');

      expect(mockLlmBudgetService.hasBudget).toHaveBeenCalledWith(
        JobsService.RISK_SCANNER_CALLS_PER_TICKET,
      );
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalled();
      expect(mockMarketDataService.syncTickerHistory).toHaveBeenCalled();
      expect(mockRequestQueueRepo.manager.transaction).not.toHaveBeenCalled();
      expect(mockResearchService.createResearchTicket).not.toHaveBeenCalled();
      expect(mockResearchService.processTicket).not.toHaveBeenCalled();
    });

    it('claims the ticker under the scanner’s advisory lock, so the scanner and a second instance cannot research it too', async () => {
      await service.initializeTicker('NVDA');

      expect(mockScannerLockQuery).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['risk-reward-scanner'],
      );
      // lock → look for existing system research → create the ticket
      const lock = mockScannerLockQuery.mock.invocationCallOrder[0];
      const check =
        mockResearchService.getLastResearchedAtBySymbol.mock
          .invocationCallOrder[0];
      const create =
        mockResearchService.createResearchTicket.mock.invocationCallOrder[0];
      expect(lock).toBeLessThan(check);
      expect(check).toBeLessThan(create);
      expect(
        mockResearchService.getLastResearchedAtBySymbol,
      ).toHaveBeenCalledWith(['NVDA']);
    });

    it('does nothing when the ticker already has system research (another instance, or the scanner, got there first)', async () => {
      mockResearchService.getLastResearchedAtBySymbol.mockResolvedValue(
        new Map([['NVDA', Date.now() - 1000]]),
      );

      await service.initializeTicker('NVDA');

      expect(mockResearchService.createResearchTicket).not.toHaveBeenCalled();
      expect(mockResearchService.processTicket).not.toHaveBeenCalled();
    });

    it('a second call for a ticker that is still being initialised returns at once', async () => {
      let release: () => void = () => undefined;
      mockMarketDataService.getSnapshot.mockReturnValue(
        new Promise<void>((resolve) => (release = () => resolve())),
      );

      const first = service.initializeTicker('NVDA');
      await service.initializeTicker('nvda'); // same ticker, while the first runs
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledTimes(1);

      release();
      await first;
      expect(mockResearchService.processTicket).toHaveBeenCalledTimes(1);

      // …and once it has finished, the ticker can be initialised again.
      mockMarketDataService.getSnapshot.mockResolvedValue({});
      await service.initializeTicker('NVDA');
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledTimes(2);
    });

    it('never throws into its caller (it runs unawaited)', async () => {
      mockMarketDataService.getSnapshot.mockRejectedValue(new Error('down'));

      await expect(service.initializeTicker('NVDA')).resolves.toBeUndefined();

      // and the in-progress marker is cleared
      mockMarketDataService.getSnapshot.mockResolvedValue({});
      await service.initializeTicker('NVDA');
      expect(mockResearchService.processTicket).toHaveBeenCalledTimes(1);
    });
  });

  describe('ADD_TICKER queue', () => {
    const openRowQuery = (existing: unknown) => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existing),
      };
      const manager: any = {
        query: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn(() => qb),
        create: jest.fn((_entity: unknown, row: unknown) => row),
        save: jest.fn((row: any) => Promise.resolve({ id: 'q-new', ...row })),
      };
      mockRequestQueueRepo.manager.transaction.mockImplementationOnce(
        (cb: (m: any) => Promise<unknown>) => cb(manager),
      );
      return { qb, manager };
    };

    describe('queueRequest is idempotent per symbol', () => {
      it('inserts a row when none is open, under an advisory lock keyed by the symbol', async () => {
        const { manager, qb } = openRowQuery(null);

        const row = await service.queueRequest(RequestType.ADD_TICKER, {
          symbol: 'nvda',
          requested_by: 'user-1',
        });

        expect(manager.query).toHaveBeenCalledWith(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          ['add-ticker:NVDA'],
        );
        expect(qb.andWhere).toHaveBeenCalledWith(
          "q.payload ->> 'symbol' = :symbol",
          { symbol: 'NVDA' },
        );
        expect(manager.save).toHaveBeenCalledWith({
          type: RequestType.ADD_TICKER,
          payload: { symbol: 'NVDA', requested_by: 'user-1' },
          status: RequestStatus.PENDING,
          attempts: 0,
        });
        expect(row).toMatchObject({ id: 'q-new' });
      });

      it('returns the open row instead of adding a second one', async () => {
        const open = { id: 'q-1', payload: { symbol: 'NVDA' } };
        const { manager } = openRowQuery(open);

        const row = await service.queueRequest(RequestType.ADD_TICKER, {
          symbol: 'NVDA',
        });

        expect(row).toBe(open);
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('"open" = PENDING, or PROCESSING that is not stale (a crashed worker must not block the symbol for ever)', async () => {
        const { qb } = openRowQuery(null);
        const before = Date.now();

        await service.queueRequest(RequestType.ADD_TICKER, { symbol: 'NVDA' });

        const [sql, params] = qb.andWhere.mock.calls.find(([text]: [string]) =>
          text.includes('q.status = :pending'),
        );
        expect(sql).toBe(
          '(q.status = :pending OR (q.status = :processing AND q.updated_at > :fresh))',
        );
        expect(params.pending).toBe(RequestStatus.PENDING);
        expect(params.processing).toBe(RequestStatus.PROCESSING);
        expect(before - params.fresh.getTime()).toBeGreaterThanOrEqual(
          JobsService.REQUEST_PROCESSING_STALE_MS - 50,
        );
      });
    });

    describe('processPendingRequests', () => {
      const pending = (payload: Record<string, unknown>, attempts = 0) => ({
        id: 'q-1',
        type: RequestType.ADD_TICKER,
        payload,
        status: RequestStatus.PENDING,
        attempts,
      });
      const lastUpdate = () =>
        mockRequestQueueRepo.update.mock.calls[
          mockRequestQueueRepo.update.mock.calls.length - 1
        ];

      it('claims the row with one conditional UPDATE and skips it when another worker already has', async () => {
        mockRequestQueueRepo.find.mockResolvedValue([
          pending({ symbol: 'NVDA' }),
        ]);
        mockRequestQueueRepo.update.mockResolvedValue({ affected: 0 });

        await service.processPendingRequests();

        expect(mockRequestQueueRepo.update).toHaveBeenCalledTimes(1);
        expect(mockRequestQueueRepo.update).toHaveBeenCalledWith(
          { id: 'q-1', status: RequestStatus.PENDING },
          { status: RequestStatus.PROCESSING },
        );
        expect(mockTickersService.ensureTicker).not.toHaveBeenCalled();
      });

      it('creates the ticker and completes the request', async () => {
        mockRequestQueueRepo.find.mockResolvedValue([
          pending({ symbol: 'NVDA' }),
        ]);
        mockRequestQueueRepo.update.mockResolvedValue({ affected: 1 });
        mockTickersService.ensureTicker.mockImplementation(() =>
          Promise.resolve(currentActor()),
        );

        await service.processPendingRequests();

        expect(mockTickersService.ensureTicker).toHaveBeenCalledWith('NVDA');
        // queued by a system job / an admin: created on nobody's behalf
        await expect(
          mockTickersService.ensureTicker.mock.results[0].value,
        ).resolves.toBeNull();
        expect(lastUpdate()[1]).toMatchObject({
          status: RequestStatus.COMPLETED,
        });
      });

      it('a request queued for a user is created ON THEIR BEHALF, so it counts against their daily cap', async () => {
        mockRequestQueueRepo.find.mockResolvedValue([
          pending({ symbol: 'NVDA', requested_by: 'user-1' }),
        ]);
        mockRequestQueueRepo.update.mockResolvedValue({ affected: 1 });
        mockTickersService.ensureTicker.mockImplementation(() =>
          Promise.resolve(currentActor()),
        );

        await service.processPendingRequests();

        await expect(
          mockTickersService.ensureTicker.mock.results[0].value,
        ).resolves.toEqual({ userId: 'user-1', role: 'user' });
      });

      it('the requester’s cap is final: the request fails at once instead of being retried ten times', async () => {
        mockRequestQueueRepo.find.mockResolvedValue([
          pending({ symbol: 'NVDA', requested_by: 'user-1' }),
        ]);
        mockRequestQueueRepo.update.mockResolvedValue({ affected: 1 });
        mockTickersService.ensureTicker.mockRejectedValue(
          new TickerCreationCapException(10),
        );

        await service.processPendingRequests();

        expect(lastUpdate()[1]).toMatchObject({
          status: RequestStatus.FAILED,
          attempts: 1,
        });
      });

      it('any other failure is retried with backoff, as before', async () => {
        mockRequestQueueRepo.find.mockResolvedValue([
          pending({ symbol: 'NVDA' }),
        ]);
        mockRequestQueueRepo.update.mockResolvedValue({ affected: 1 });
        mockTickersService.ensureTicker.mockRejectedValue(
          new Error('Yahoo rate limited'),
        );

        await service.processPendingRequests();

        expect(lastUpdate()[1]).toMatchObject({
          status: RequestStatus.PENDING,
          attempts: 1,
        });
        expect(lastUpdate()[1].next_attempt.getTime()).toBeGreaterThan(
          Date.now() + 20000,
        );
      });
    });
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

    // Audit H4: a research note only proves we tried. A ticker whose research
    // completed but left no risk analysis (the enrichment swallows its errors)
    // used to hide behind the weekly throttle with a blank overview.
    it('re-queues a ticker with no risk analysis once its last research is past the retry window', async () => {
      const sleepSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((callback: any) => {
          callback();
          return {} as NodeJS.Timeout;
        });

      // A realistic 7-day staleness window, so the 24h retry window is the
      // only thing that can make a 2-day-old attempt due.
      ((service as any).configService.get as jest.Mock).mockReturnValue(168);
      mockLlmBudgetService.getRemaining.mockResolvedValue(450);
      mockLlmBudgetService.hasBudget.mockResolvedValue(true);
      mockTickersService.getAllTickers.mockResolvedValue([
        { id: '226', symbol: 'HELP' }, // researched 2 days ago, no analysis
        { id: '20', symbol: 'AAPL' }, // researched 2 days ago, analysis landed
      ]);
      const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
      mockRiskRewardService.getLastAnalysisAtByTickerId.mockResolvedValue(
        new Map([['20', twoDaysAgo]]),
      );
      mockResearchService.getLastResearchedAtBySymbol.mockResolvedValue(
        new Map([
          ['HELP', twoDaysAgo],
          ['AAPL', twoDaysAgo],
        ]),
      );
      mockResearchService.createResearchTicket.mockResolvedValue({
        id: 'note-h',
      });
      mockResearchService.processTicket.mockResolvedValue(undefined);

      const result = await service.runRiskRewardScanner();

      expect(mockResearchService.createResearchTicket).toHaveBeenCalledTimes(1);
      expect(mockResearchService.createResearchTicket).toHaveBeenCalledWith(
        null,
        ['HELP'],
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

      mockResearchService.createResearchTicket
        .mockResolvedValueOnce({ id: 'note-1' })
        .mockResolvedValueOnce({ id: 'note-2' });

      const result = await service.runRiskRewardScanner();

      // Both due tickers are claimed up front (under the lock), but only the
      // first is processed; the second is released rather than left PENDING.
      expect(mockResearchService.createResearchTicket).toHaveBeenCalledTimes(2);
      expect(mockResearchService.processTicket).toHaveBeenCalledTimes(1);
      expect(mockResearchService.processTicket).toHaveBeenCalledWith('note-1');
      expect(mockResearchService.failPendingTicket).toHaveBeenCalledTimes(1);
      expect(mockResearchService.failPendingTicket).toHaveBeenCalledWith(
        'note-2',
        expect.stringContaining('budget'),
      );
      expect(result).toMatchObject({ processed: 1, due: 2 });

      sleepSpy.mockRestore();
    });

    // The scan runs inside the triggering HTTP request (Cloud Run starves
    // background work), so it must stop before the request timeout.
    it('stops starting tickets once the run has used its time budget', async () => {
      const sleepSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((callback: any) => {
          callback();
          return {} as NodeJS.Timeout;
        });
      let now = 1_800_000_000_000;
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

      mockLlmBudgetService.getRemaining.mockResolvedValue(450);
      mockLlmBudgetService.hasBudget.mockResolvedValue(true);
      mockTickersService.getAllTickers.mockResolvedValue([
        { id: '1', symbol: 'AAPL' },
        { id: '2', symbol: 'MSFT' },
      ]);
      mockRiskRewardService.getLastAnalysisAtByTickerId.mockResolvedValue(
        new Map(),
      );
      mockResearchService.getLastResearchedAtBySymbol.mockResolvedValue(
        new Map(),
      );
      mockResearchService.createResearchTicket
        .mockResolvedValueOnce({ id: 'note-1' })
        .mockResolvedValueOnce({ id: 'note-2' });
      // The first ticket alone takes longer than the whole time budget.
      mockResearchService.processTicket.mockImplementation(() => {
        now += JobsService.RISK_SCANNER_TIME_BUDGET_MS + 1_000;
        return Promise.resolve();
      });

      const result = await service.runRiskRewardScanner();

      expect(mockResearchService.processTicket).toHaveBeenCalledTimes(1);
      expect(mockResearchService.failPendingTicket).toHaveBeenCalledWith(
        'note-2',
        expect.stringContaining('time budget'),
      );
      expect(result).toMatchObject({ processed: 1, due: 2 });

      nowSpy.mockRestore();
      sleepSpy.mockRestore();
      mockResearchService.processTicket.mockReset();
    });

    // Audit H9: overlapping runs used to pick the same due tickers because
    // neither had written a note yet when the other read the throttle.
    it('selects and claims its batch under the scanner advisory lock', async () => {
      const sleepSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((callback: any) => {
          callback();
          return {} as NodeJS.Timeout;
        });

      mockLlmBudgetService.getRemaining.mockResolvedValue(450);
      mockLlmBudgetService.hasBudget.mockResolvedValue(true);
      mockTickersService.getAllTickers.mockResolvedValue([
        { id: '1', symbol: 'AAPL' },
      ]);
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

      await service.runRiskRewardScanner();

      expect(mockRequestQueueRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(mockScannerLockQuery).toHaveBeenCalledWith(
        expect.stringContaining('pg_advisory_xact_lock'),
        ['risk-reward-scanner'],
      );
      // Lock first, then the throttle reads, then the claim — all before any
      // slow processing starts.
      const order = (fn: jest.Mock) => fn.mock.invocationCallOrder[0];
      expect(order(mockScannerLockQuery)).toBeLessThan(
        order(mockResearchService.getLastResearchedAtBySymbol),
      );
      expect(
        order(mockResearchService.getLastResearchedAtBySymbol),
      ).toBeLessThan(order(mockResearchService.createResearchTicket));
      expect(order(mockResearchService.createResearchTicket)).toBeLessThan(
        order(mockResearchService.processTicket),
      );

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

    describe('selfHeal (audit H4)', () => {
      const RETRY = 24 * HOUR;
      const select = (
        attemptHoursAgo: number,
        analysisHoursAgo: number | null,
      ) =>
        JobsService.selectDueTickers(
          [{ id: '1', symbol: 'HELP' }],
          new Map([['1', NOW - attemptHoursAgo * HOUR]]),
          NOW,
          WINDOW,
          5,
          {
            lastAnalysisAtById:
              analysisHoursAgo === null
                ? new Map()
                : new Map([['1', NOW - analysisHoursAgo * HOUR]]),
            retryAfterMs: RETRY,
          },
        ).map((c) => c.symbol);

      it('retries a ticker with no analysis once the attempt is past the retry window', () => {
        expect(select(25, null)).toEqual(['HELP']);
      });

      it('does not retry inside the retry window (bounds a failing ticker to one attempt per window)', () => {
        expect(select(2, null)).toEqual([]);
      });

      it('retries when the only analysis is itself older than the staleness window', () => {
        expect(select(30, 2000)).toEqual(['HELP']);
      });

      it('leaves a ticker with a fresh analysis alone', () => {
        expect(select(30, 30)).toEqual([]);
      });

      it('orders plainly stale tickers ahead of retries, so retries cannot starve them', () => {
        const due = JobsService.selectDueTickers(
          [
            { id: '1', symbol: 'RETRY' }, // attempted 30h ago, no analysis
            { id: '2', symbol: 'STALE' }, // last touched 200h ago
          ],
          new Map([
            ['1', NOW - 30 * HOUR],
            ['2', NOW - 200 * HOUR],
          ]),
          NOW,
          WINDOW,
          5,
          {
            lastAnalysisAtById: new Map([['2', NOW - 200 * HOUR]]),
            retryAfterMs: RETRY,
          },
        );
        expect(due.map((c) => c.symbol)).toEqual(['STALE', 'RETRY']);
      });
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

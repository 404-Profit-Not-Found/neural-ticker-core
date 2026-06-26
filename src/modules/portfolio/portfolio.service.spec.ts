import { Test, TestingModule } from '@nestjs/testing';
import { PortfolioService } from './portfolio.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PortfolioPosition } from './entities/portfolio-position.entity';
import { PortfolioAnalysis } from './entities/portfolio-analysis.entity';
import { PortfolioTrade } from './entities/portfolio-trade.entity';
import { PortfolioCashBalance } from './entities/portfolio-cash-balance.entity';
import { PortfolioPendingOrder } from './entities/portfolio-pending-order.entity';
import { MarketDataService } from '../market-data/market-data.service';
import { MarketStatusService } from '../market-data/market-status.service';
import { LlmService } from '../llm/llm.service';
import { TickersService } from '../tickers/tickers.service';
import { CreditService } from '../users/credit.service';
import { CurrencyService } from '../currency/currency.service';
import { QuotaService } from '../../common/quota/quota.service';

const mockPosition = {
  id: 'uuid-1',
  user_id: 'user-1',
  symbol: 'NVDA',
  shares: 10,
  buy_price: 100,
  buy_date: '2024-01-01',
};

const mockAnalysis = {
  id: 'analysis-1',
  userId: 'user-1',
  response: 'Suggested Analysis: Hold NVDA.',
  createdAt: new Date(),
};

const mockPositionRepo: any = {
  create: jest.fn().mockReturnValue(mockPosition),
  save: jest.fn().mockResolvedValue(mockPosition),
  find: jest.fn().mockResolvedValue([mockPosition]),
  findOne: jest.fn().mockResolvedValue(mockPosition),
  remove: jest.fn().mockResolvedValue(true),
  count: jest.fn().mockResolvedValue(0),
};

// Cash balance repo. Default: a well-funded USD balance so strict buys pass.
// Returns a fresh copy each call so the helper's in-place mutation of `amount`
// doesn't leak between tests.
const mockCashRow = {
  id: 'cash-1',
  user_id: 'user-1',
  currency: 'USD',
  amount: 100000,
};
const mockCashRepo: any = {
  findOne: jest
    .fn()
    .mockImplementation(() => Promise.resolve({ ...mockCashRow })),
  create: jest.fn((d: any) => ({ ...d })),
  save: jest.fn().mockImplementation((r: any) => Promise.resolve(r)),
  find: jest.fn().mockResolvedValue([{ ...mockCashRow }]),
};

// Append-only trade ledger repo. Echoes back what it's told to save.
const mockTradeRepo: any = {
  create: jest.fn((d: any) => ({ id: 'trade-1', ...d })),
  save: jest.fn().mockImplementation((r: any) => Promise.resolve(r)),
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockResolvedValue([]),
};

// Pending-orders repo (market-hours-queued buys/sells). Echoes saves back.
const mockPendingRepo: any = {
  create: jest.fn((d: any) => ({ id: 'pending-1', ...d })),
  save: jest.fn().mockImplementation((r: any) => Promise.resolve(r)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
};

// create()/sell()/etc. run inside positionRepo.manager.transaction (advisory
// lock + count-based quota + cash read-modify-write). The tx manager hands back
// the repo mock matching the requested entity.
const mockPositionTxManager = {
  getRepository: jest.fn((entity: any) => {
    if (entity === PortfolioCashBalance) return mockCashRepo;
    if (entity === PortfolioTrade) return mockTradeRepo;
    if (entity === PortfolioPendingOrder) return mockPendingRepo;
    return mockPositionRepo;
  }),
  query: jest.fn().mockResolvedValue(undefined),
};

mockPositionRepo.manager = {
  transaction: jest.fn((cb: (m: typeof mockPositionTxManager) => unknown) =>
    Promise.resolve(cb(mockPositionTxManager)),
  ),
  getRepository: jest.fn((entity: any) => {
    if (entity === PortfolioCashBalance) return mockCashRepo;
    if (entity === PortfolioTrade) return mockTradeRepo;
    return mockPositionRepo;
  }),
};

const mockQuotaService = { assertWithinLimit: jest.fn() };

const mockAnalysisRepo = {
  create: jest.fn().mockReturnValue(mockAnalysis),
  save: jest.fn().mockResolvedValue(mockAnalysis),
  find: jest.fn().mockResolvedValue([mockAnalysis]),
};

const mockMarketDataService = {
  getSnapshots: jest.fn().mockResolvedValue([
    {
      ticker: { symbol: 'NVDA', name: 'Nvidia' },
      latestPrice: { close: 150, prevClose: 100 },
    },
  ]),
  getSnapshot: jest.fn().mockResolvedValue({
    ticker: { symbol: 'NVDA', name: 'Nvidia' },
    latestPrice: { close: 150, prevClose: 100 },
  }),
};

// Default: the market is OPEN, so buy()/sell() execute synchronously. Tests
// that exercise the pending path override this per-call.
const mockMarketStatusService = {
  getMarketStatus: jest.fn().mockResolvedValue({
    isOpen: true,
    session: 'regular',
    timezone: 'America/New_York',
    exchange: 'US',
    region: 'US',
  }),
  getAllMarketsStatus: jest.fn().mockResolvedValue({
    us: { isOpen: true, session: 'regular', region: 'US' },
    eu: { isOpen: true, session: 'regular', region: 'EU' },
  }),
};

const mockLlmService = {
  generateText: jest.fn().mockResolvedValue('Suggested Analysis: Hold NVDA.'),
};

const mockTickersService = {
  findOneBySymbol: jest
    .fn()
    .mockResolvedValue({ symbol: 'NVDA', currency: 'USD' }),
};

const mockCreditService = {
  getModelCost: jest.fn().mockReturnValue(1),
  deductCredits: jest.fn().mockResolvedValue({}),
};

const mockCurrencyService = {
  convert: jest.fn().mockImplementation((amount: number) => amount),
  getRate: jest.fn().mockResolvedValue(1),
};

describe('PortfolioService', () => {
  let service: PortfolioService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        {
          provide: getRepositoryToken(PortfolioPosition),
          useValue: mockPositionRepo,
        },
        {
          provide: getRepositoryToken(PortfolioAnalysis),
          useValue: mockAnalysisRepo,
        },
        {
          provide: getRepositoryToken(PortfolioPendingOrder),
          useValue: mockPendingRepo,
        },
        {
          provide: MarketDataService,
          useValue: mockMarketDataService,
        },
        {
          provide: MarketStatusService,
          useValue: mockMarketStatusService,
        },
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
        {
          provide: TickersService,
          useValue: mockTickersService,
        },
        {
          provide: CreditService,
          useValue: mockCreditService,
        },
        {
          provide: CurrencyService,
          useValue: mockCurrencyService,
        },
        {
          provide: QuotaService,
          useValue: mockQuotaService,
        },
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a position when cash covers the cost', async () => {
      const dto = {
        symbol: 'NVDA',
        shares: 10,
        buy_price: 100,
        buy_date: '2024-01-01',
      };
      const result = await service.create('user-1', dto);
      expect(result).toEqual(mockPosition);
      expect(mockPositionRepo.save).toHaveBeenCalled();
      // Strict simulator: cash is debited and a BUY trade is recorded.
      expect(mockCashRepo.save).toHaveBeenCalled();
      expect(mockTradeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ side: 'buy', symbol: 'NVDA' }),
      );
    });

    it('should reject a buy when cash is insufficient', async () => {
      // Zero balance (no cash row) for this call only.
      mockCashRepo.findOne.mockResolvedValueOnce(null);
      const dto = {
        symbol: 'NVDA',
        shares: 10,
        buy_price: 100,
        buy_date: '2024-01-01',
      };
      await expect(service.create('user-1', dto)).rejects.toThrow(
        /Insufficient/,
      );
    });
  });

  describe('sell', () => {
    it('should book realized P&L and credit proceeds to cash', async () => {
      // Sell 5 of 10 NVDA @ 150 (bought @ 100): proceeds 750, P&L +250.
      // sell() reads the lot twice: once to resolve the symbol for the
      // market-status check, then again under the per-user lock inside the tx.
      const lot = {
        ...mockPosition,
        shares: 10,
        buy_price: 100,
        currency: 'USD',
      };
      mockPositionRepo.findOne
        .mockResolvedValueOnce(lot) // pre-lock market-status read
        .mockResolvedValueOnce(lot); // locked authoritative read
      const result = await service.sell('user-1', 'uuid-1', {
        shares: 5,
        price: 150,
      });
      // Market is open (default mock) → the sell executes immediately.
      if (result.status !== 'executed') {
        throw new Error('expected an executed sell, got a pending order');
      }
      expect(result.proceeds).toBe(750);
      expect(result.realized_pnl).toBe(250);
      expect(result.cash_balance.amount).toBe(100750); // 100000 + 750
      expect(mockTradeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ side: 'sell' }),
      );
    });

    it('should reject selling more shares than held', async () => {
      const lot = { ...mockPosition, shares: 3 };
      mockPositionRepo.findOne
        .mockResolvedValueOnce(lot) // pre-lock market-status read
        .mockResolvedValueOnce(lot); // locked authoritative read
      await expect(
        service.sell('user-1', 'uuid-1', { shares: 5, price: 150 }),
      ).rejects.toThrow(/Cannot sell/);
    });
  });

  describe('findAll', () => {
    it('should return enriched positions', async () => {
      const result = await service.findAll('user-1');
      expect(result.length).toBe(1);
      expect(result[0].current_price).toBe(150);
      expect(result[0].current_value).toBe(1500); // 10 * 150
      expect(result[0].gain_loss).toBe(500); // 1500 - 1000
      expect(result[0].change_percent).toBe(50); // (150-100)/100 * 100
    });
  });

  describe('analyzePortfolio', () => {
    it('should return analysis text and deduct credits', async () => {
      const result = await service.analyzePortfolio('user-1', 'medium');
      expect(result).toContain('Suggested Analysis');
      expect(mockLlmService.generateText).toHaveBeenCalled();
      expect(mockCreditService.deductCredits).toHaveBeenCalled();
      expect(mockAnalysisRepo.save).toHaveBeenCalled();
    });
  });
});

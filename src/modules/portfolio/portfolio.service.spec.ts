import { Test, TestingModule } from '@nestjs/testing';
import { PortfolioService } from './portfolio.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PortfolioPosition } from './entities/portfolio-position.entity';
import { PortfolioAnalysis } from './entities/portfolio-analysis.entity';
import { MarketDataService } from '../market-data/market-data.service';
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

// create() serializes per-user inserts inside positionRepo.manager.transaction
// (advisory lock + count-based quota check). The tx manager delegates back to
// the same repo mock so create/save/count expectations are unchanged.
const mockPositionTxManager = {
  getRepository: jest.fn(() => mockPositionRepo),
  query: jest.fn().mockResolvedValue(undefined),
};

mockPositionRepo.manager = {
  transaction: jest.fn((cb: (m: typeof mockPositionTxManager) => unknown) =>
    Promise.resolve(cb(mockPositionTxManager)),
  ),
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
          provide: MarketDataService,
          useValue: mockMarketDataService,
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
    it('should create a position', async () => {
      const dto = {
        symbol: 'NVDA',
        shares: 10,
        buy_price: 100,
        buy_date: '2024-01-01',
      };
      const result = await service.create('user-1', dto);
      expect(result).toEqual(mockPosition);
      expect(mockPositionRepo.save).toHaveBeenCalled();
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

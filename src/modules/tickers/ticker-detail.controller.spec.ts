import { Test, TestingModule } from '@nestjs/testing';
import { TickerDetailController } from './ticker-detail.controller';
import { TickersService } from './tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { ResearchService } from '../research/research.service';
import { NotFoundException } from '@nestjs/common';

describe('TickerDetailController', () => {
  let controller: TickerDetailController;
  let tickersService: TickersService;
  let marketDataService: MarketDataService;
  let riskRewardService: RiskRewardService;
  let researchService: ResearchService;

  const mockTickersService = {
    ensureTicker: jest.fn(),
  };

  const mockMarketDataService = {
    getSnapshot: jest.fn(),
    getHistory: jest.fn(),
    getAnalystRatings: jest.fn(),
  };

  const mockRiskRewardService = {
    getLatestAnalysis: jest.fn(),
  };

  const mockResearchService = {
    getLatestNoteForTicker: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TickerDetailController],
      providers: [
        { provide: TickersService, useValue: mockTickersService },
        { provide: MarketDataService, useValue: mockMarketDataService },
        { provide: RiskRewardService, useValue: mockRiskRewardService },
        { provide: ResearchService, useValue: mockResearchService },
      ],
    }).compile();

    controller = module.get<TickerDetailController>(TickerDetailController);
    tickersService = module.get<TickersService>(TickersService);
    marketDataService = module.get<MarketDataService>(MarketDataService);
    riskRewardService = module.get<RiskRewardService>(RiskRewardService);
    researchService = module.get<ResearchService>(ResearchService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCompositeData', () => {
    it('should return composite data when ticker exists', async () => {
      const mockTicker = { id: '1', symbol: 'AAPL', name: 'Apple Inc' };
      const mockSnapshot = {
        ticker: mockTicker,
        latestPrice: {
          close: 150,
          prevClose: 145,
          volume: 1000,
          ts: new Date(),
        },
        fundamentals: {
          market_cap: 2000000000,
          revenue_ttm: 100000000,
          gross_margin: 0.4,
          net_profit_margin: 0.2,
          operating_margin: 0.25,
          roe: 0.15,
          roa: 0.1,
          price_to_book: 5,
          book_value_per_share: 10,
          free_cash_flow_ttm: 50000000,
          earnings_growth_yoy: 0.1,
          current_ratio: 1.5,
          quick_ratio: 1.0,
          interest_coverage: 10,
          debt_to_equity: 0.5,
          debt_to_assets: 0.2, // This one wasn't in list but prompt asked for it, entity check needed? prompt asked for it, entity missing it? Let's check entity later.
        },
      };
      const mockRisk = { overall_score: 8.5 };
      const mockResearch = { id: 'note1', answer_markdown: 'Analysis' };
      const mockHistory = [{ time: '2023-01-01', close: 100 }];
      const mockRatings = [{ firm: 'Firm', rating: 'buy' }];

      mockMarketDataService.getSnapshot.mockResolvedValue(mockSnapshot);
      mockMarketDataService.getHistory.mockResolvedValue(mockHistory);
      mockRiskRewardService.getLatestAnalysis.mockResolvedValue(mockRisk);
      mockResearchService.getLatestNoteForTicker.mockResolvedValue(
        mockResearch,
      );
      mockMarketDataService.getAnalystRatings.mockResolvedValue(mockRatings);

      const result = await controller.getCompositeData('AAPL');

      expect(result.profile.symbol).toBe('AAPL');
      expect(result.market_data.price).toBe(150);
      expect(result.market_data.history).toEqual(mockHistory);
      expect(result.risk_analysis?.overall_score).toBe(8.5);
      expect(result.notes).toEqual([mockResearch]);
      expect(result.ratings).toEqual(mockRatings);
    });

    it('should throw Error if marketDataService throws (Ticker not found)', async () => {
      mockMarketDataService.getSnapshot.mockRejectedValue(
        new Error('Ticker not found'),
      );

      await expect(controller.getCompositeData('INVALID')).rejects.toThrow(
        Error,
      );
    });

    it('should handle missing risk/research gracefully', async () => {
      const mockTicker = { id: '1', symbol: 'AAPL' };
      const mockSnapshot = {
        ticker: mockTicker,
        latestPrice: null,
        fundamentals: null,
      };

      mockMarketDataService.getSnapshot.mockResolvedValue(mockSnapshot);
      mockMarketDataService.getHistory.mockResolvedValue([]);
      mockRiskRewardService.getLatestAnalysis.mockResolvedValue(null);
      mockResearchService.getLatestNoteForTicker.mockResolvedValue(null);
      mockMarketDataService.getAnalystRatings.mockResolvedValue([]);

      const result = await controller.getCompositeData('AAPL');

      expect(result.profile.symbol).toBe('AAPL');
      expect(result.market_data.price).toBe(0); // Default
      expect(result.risk_analysis).toBeNull();
      expect(result.notes).toEqual([]);
      expect(result.ratings).toEqual([]);
    });
  });
});

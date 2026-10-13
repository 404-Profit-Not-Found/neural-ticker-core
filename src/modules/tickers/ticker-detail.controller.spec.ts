import { Test, TestingModule } from '@nestjs/testing';
import { TickerDetailController } from './ticker-detail.controller';
import { TickersService } from './tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { ResearchService } from '../research/research.service';
import { NotFoundException } from '@nestjs/common';
import { User } from '../users/entities/user.entity';

describe('TickerDetailController', () => {
  let controller: TickerDetailController;
  let tickersService: TickersService;
  let marketDataService: MarketDataService;
  let riskRewardService: RiskRewardService;
  let researchService: ResearchService;

  const mockTickersService = {
    ensureTicker: jest.fn(),
    assertPublicReadAllowed: jest.fn().mockResolvedValue(undefined),
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

    // The server's AI rating: computed once, by the snapshot, with the same
    // derivation the analyzer filters by — the composite passes it on.
    it('returns risk_analysis.rating and rating_score from the snapshot', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1', symbol: 'AAPL', name: 'Apple Inc' },
        latestPrice: { close: 150, prevClose: 145, volume: 1, ts: new Date() },
        fundamentals: { revenue_ttm: 100 },
        aiAnalysis: { rating: 'Strong Buy', rating_score: 84.5 },
      });
      mockMarketDataService.getHistory.mockResolvedValue([]);
      mockMarketDataService.getAnalystRatings.mockResolvedValue([]);
      mockResearchService.getLatestNoteForTicker.mockResolvedValue(null);
      mockRiskRewardService.getLatestAnalysis.mockResolvedValue({
        overall_score: 8.5,
        financial_risk: 3,
      });

      const result = await controller.getCompositeData('AAPL');

      expect(result.risk_analysis).toMatchObject({
        rating: 'Strong Buy',
        rating_score: 84.5,
      });
      // …and the revenue the clients need as a rating input.
      expect(result.fundamentals.revenue_ttm).toBe(100);
    });

    it('a ticker without an analysis has no risk_analysis, hence no rating', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1', symbol: 'AAPL', name: 'Apple Inc' },
        latestPrice: { close: 150, prevClose: 145, volume: 1, ts: new Date() },
        fundamentals: null,
        aiAnalysis: null,
      });
      mockMarketDataService.getHistory.mockResolvedValue([]);
      mockMarketDataService.getAnalystRatings.mockResolvedValue([]);
      mockResearchService.getLatestNoteForTicker.mockResolvedValue(null);
      mockRiskRewardService.getLatestAnalysis.mockResolvedValue(null);

      const result = await controller.getCompositeData('AAPL');

      expect(result.risk_analysis).toBeNull();
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

    it("never serializes the note author's private row — this endpoint is PUBLIC (unauthenticated)", async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue({
        ticker: { id: '1', symbol: 'AAPL' },
        latestPrice: null,
        fundamentals: null,
      });
      mockMarketDataService.getHistory.mockResolvedValue([]);
      mockRiskRewardService.getLatestAnalysis.mockResolvedValue(null);
      mockMarketDataService.getAnalystRatings.mockResolvedValue([]);
      // ResearchService.getLatestNoteForTicker hands back a summary without
      // any author. Worst case — a fully loaded entity reaches this handler
      // anyway (a future join, a different loader): the User entity itself
      // still serializes as the public view.
      mockResearchService.getLatestNoteForTicker.mockResolvedValue({
        id: 'note1',
        answer_markdown: 'Analysis',
        user: Object.assign(new User(), {
          id: '3f9a1c2e-0000-4000-8000-000000000001',
          email: 'alice.private@example.com',
          google_id: 'google-sub-1234567890',
          full_name: 'Alice Private',
          credits_balance: 4242,
          nickname: 'FunnyPanda123',
          avatar_url: null,
          tier: 'pro',
          preferences: { gemini_api_key: 'SECRET' },
        }),
      });

      const result = await controller.getCompositeData('AAPL');
      const json = JSON.stringify(result);

      expect(JSON.parse(json).notes[0].user).toEqual({
        id: '3f9a1c2e-0000-4000-8000-000000000001',
        nickname: 'FunnyPanda123',
        avatar_url: null,
        tier: 'pro',
      });
      for (const secret of [
        'SECRET',
        'alice.private',
        'google-sub-1234567890',
        'Alice Private',
        '4242',
      ]) {
        expect(json).not.toContain(secret);
      }
    });
  });

  describe('native currency resolution', () => {
    const buildSnapshot = (ticker: Record<string, unknown>) => ({
      ticker,
      latestPrice: { close: 41.3, prevClose: 40, volume: 1, ts: new Date() },
      fundamentals: null,
    });

    beforeEach(() => {
      mockMarketDataService.getHistory.mockResolvedValue([]);
      mockMarketDataService.getAnalystRatings.mockResolvedValue([]);
      mockRiskRewardService.getLatestAnalysis.mockResolvedValue(null);
      mockResearchService.getLatestNoteForTicker.mockResolvedValue(null);
    });

    it('returns the stored native currency when it is a real non-USD value', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue(
        buildSnapshot({
          id: '1',
          symbol: 'EKT.DE',
          exchange: 'XETRA',
          currency: 'EUR',
        }),
      );

      const result = await controller.getCompositeData('EKT.DE');

      expect(result.profile.currency).toBe('EUR');
    });

    it('infers EUR for a .DE ticker carrying a stale USD default', async () => {
      // Rows created before currency inference existed can still hold the 'USD'
      // fallback. The detail page must not render such a ticker in dollars.
      mockMarketDataService.getSnapshot.mockResolvedValue(
        buildSnapshot({
          id: '1',
          symbol: 'EKT.DE',
          exchange: 'XETRA',
          currency: 'USD',
        }),
      );

      const result = await controller.getCompositeData('EKT.DE');

      expect(result.profile.currency).toBe('EUR');
    });

    it('infers currency from the symbol suffix when stored currency is empty', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue(
        buildSnapshot({
          id: '1',
          symbol: 'BARC.L',
          exchange: '',
          currency: '',
        }),
      );

      const result = await controller.getCompositeData('BARC.L');

      expect(result.profile.currency).toBe('GBP');
    });

    it('keeps USD for a genuine US-listed ticker', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue(
        buildSnapshot({
          id: '1',
          symbol: 'AAPL',
          exchange: 'NASDAQ',
          currency: 'USD',
        }),
      );

      const result = await controller.getCompositeData('AAPL');

      expect(result.profile.currency).toBe('USD');
    });

    it('does not mislabel a dotted US symbol (e.g. BRK.B) as foreign', async () => {
      mockMarketDataService.getSnapshot.mockResolvedValue(
        buildSnapshot({
          id: '1',
          symbol: 'BRK.B',
          exchange: 'NYSE',
          currency: 'USD',
        }),
      );

      const result = await controller.getCompositeData('BRK.B');

      expect(result.profile.currency).toBe('USD');
    });
  });
});

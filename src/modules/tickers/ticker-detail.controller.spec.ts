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
        fundamentals: { market_cap: 2000000000 },
      };
      const mockRisk = { overall_score: 8.5 };
      const mockResearch = { id: 'note1', answer_markdown: 'Analysis' };

      mockMarketDataService.getSnapshot.mockResolvedValue(mockSnapshot);
      mockRiskRewardService.getLatestAnalysis.mockResolvedValue(mockRisk);
      mockResearchService.getLatestNoteForTicker.mockResolvedValue(
        mockResearch,
      );

      const result = await controller.getCompositeData('AAPL');

      expect(result.profile.symbol).toBe('AAPL');
      expect(result.market_data.price).toBe(150);
      expect(result.risk_analysis.overall_score).toBe(8.5);
      expect(result.research.content).toBe('Analysis');
    });

    it('should throw NotFoundException if marketDataService throws (Ticker not found)', async () => {
      mockMarketDataService.getSnapshot.mockRejectedValue(
        new Error('Ticker not found'),
      );

      await expect(controller.getCompositeData('INVALID')).rejects.toThrow(
        NotFoundException,
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
      mockRiskRewardService.getLatestAnalysis.mockResolvedValue(null);
      mockResearchService.getLatestNoteForTicker.mockResolvedValue(null);

      const result = await controller.getCompositeData('AAPL');

      expect(result.profile.symbol).toBe('AAPL');
      expect(result.market_data.price).toBe(0); // Default
      expect(result.risk_analysis).toBeNull();
      expect(result.research).toBeNull();
    });
  });
});

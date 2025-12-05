import { Test, TestingModule } from '@nestjs/testing';
import { JobsService } from './jobs.service';
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { TickersService } from '../tickers/tickers.service';
import { MarketDataService } from '../market-data/market-data.service';

describe('JobsService', () => {
  let service: JobsService;

  const mockRiskRewardService = {
    evaluateSymbol: jest.fn(),
  };

  const mockTickersService = {
    getAllTickers: jest.fn(),
  };

  const mockMarketDataService = {
    getSnapshot: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: RiskRewardService, useValue: mockRiskRewardService },
        { provide: TickersService, useValue: mockTickersService },
        { provide: MarketDataService, useValue: mockMarketDataService },
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

  describe('syncDailyCandles', () => {
    it('should iterate tickers and sync candles', async () => {
      const tickers = [{ symbol: 'AAPL' }, { symbol: 'TSLA' }];
      mockTickersService.getAllTickers.mockResolvedValue(tickers);
      mockMarketDataService.getSnapshot.mockResolvedValue({});

      await service.syncDailyCandles();

      expect(mockTickersService.getAllTickers).toHaveBeenCalled();
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledTimes(2);
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('AAPL');
      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledWith('TSLA');
    });

    it('should handle errors gracefully for individual symbols', async () => {
      const tickers = [{ symbol: 'AAPL' }, { symbol: 'FAIL' }];
      mockTickersService.getAllTickers.mockResolvedValue(tickers);
      mockMarketDataService.getSnapshot.mockResolvedValueOnce({});
      mockMarketDataService.getSnapshot.mockRejectedValueOnce(
        new Error('Sync failed'),
      );

      await service.syncDailyCandles();

      expect(mockMarketDataService.getSnapshot).toHaveBeenCalledTimes(2);
      // Should not throw
    });

    it('should handle global errors', async () => {
      mockTickersService.getAllTickers.mockRejectedValue(
        new Error('Global fail'),
      );
      await service.syncDailyCandles();
      // Should catch and log
    });

    it('should skip tickers without symbol', async () => {
      const tickers = [{ no_symbol: '?' }];
      mockTickersService.getAllTickers.mockResolvedValue(tickers);
      await service.syncDailyCandles();
      expect(mockMarketDataService.getSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('runRiskRewardScanner', () => {
    it('should iterate tickers and evaluate symbols', async () => {
      const tickers = [{ symbol: 'AAPL' }];
      mockTickersService.getAllTickers.mockResolvedValue(tickers);
      mockRiskRewardService.evaluateSymbol.mockResolvedValue({});

      await service.runRiskRewardScanner();

      expect(mockRiskRewardService.evaluateSymbol).toHaveBeenCalledWith('AAPL');
    });

    it('should handle errors gracefully', async () => {
      const tickers = [{ symbol: 'ERR' }];
      mockTickersService.getAllTickers.mockResolvedValue(tickers);
      mockRiskRewardService.evaluateSymbol.mockRejectedValue(
        new Error('Eval Error'),
      );

      await service.runRiskRewardScanner();

      expect(mockRiskRewardService.evaluateSymbol).toHaveBeenCalledWith('ERR');
    });

    it('should handle global scanner errors', async () => {
      mockTickersService.getAllTickers.mockRejectedValue(
        new Error('Global fail'),
      );
      await service.runRiskRewardScanner();
      // Should catch and log
    });

    it('should skip tickers without symbol', async () => {
      const tickers = [{ no_symbol: '?' }];
      mockTickersService.getAllTickers.mockResolvedValue(tickers);
      await service.runRiskRewardScanner();
      expect(mockRiskRewardService.evaluateSymbol).not.toHaveBeenCalled();
    });
  });
});

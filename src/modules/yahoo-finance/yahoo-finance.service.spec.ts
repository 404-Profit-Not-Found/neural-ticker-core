import { Test, TestingModule } from '@nestjs/testing';
import { YahooFinanceService } from './yahoo-finance.service';
const mockYahooInstance = {
  quote: jest.fn(),
  quoteSummary: jest.fn(),
  historical: jest.fn(),
  search: jest.fn(),
  _env: { suppressNotices: [] },
};

jest.mock('yahoo-finance2', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockYahooInstance),
  };
});

import YahooFinance from 'yahoo-finance2';

describe('YahooFinanceService', () => {
  let service: YahooFinanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [YahooFinanceService],
    }).compile();

    service = module.get<YahooFinanceService>(YahooFinanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getQuote', () => {
    it('should return quote data on success', async () => {
      const mockResult = { symbol: 'AAPL', regularMarketPrice: 150 };
      (mockYahooInstance.quote as unknown as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.getQuote('AAPL');
      expect(result).toEqual(mockResult);
      expect(mockYahooInstance.quote).toHaveBeenCalledWith('AAPL');
    });

    it('should throw error on failure', async () => {
      (mockYahooInstance.quote as unknown as jest.Mock).mockRejectedValue(new Error('API Error'));

      await expect(service.getQuote('AAPL')).rejects.toThrow('API Error');
    });
  });

  describe('getSummary', () => {
    it('should return summary data on success', async () => {
      const mockResult = { summaryProfile: { sector: 'Tech' } };
      (mockYahooInstance.quoteSummary as unknown as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.getSummary('AAPL');
      expect(result).toEqual(mockResult);
      expect(mockYahooInstance.quoteSummary).toHaveBeenCalledWith('AAPL', expect.any(Object));
    });
  });

  describe('getHistorical', () => {
    it('should return historical data on success', async () => {
      const mockResult = [{ date: new Date(), close: 150 }];
      (mockYahooInstance.historical as unknown as jest.Mock).mockResolvedValue(mockResult);

      const from = new Date('2024-01-01');
      const to = new Date('2024-01-02');
      const result = await service.getHistorical('AAPL', from, to);
      expect(result).toEqual(mockResult);
      expect(mockYahooInstance.historical).toHaveBeenCalledWith('AAPL', {
        period1: from,
        period2: to,
        interval: '1d',
      });
    });
  });

  describe('search', () => {
    it('should return search results on success', async () => {
      const mockResult = { news: [{ title: 'Headline' }] };
      (mockYahooInstance.search as unknown as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.search('AAPL');
      expect(result).toEqual(mockResult);
      expect(mockYahooInstance.search).toHaveBeenCalledWith('AAPL');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { YahooFinanceService } from './yahoo-finance.service';
const mockYahooInstance = {
  quote: jest.fn(),
  quoteSummary: jest.fn(),
  historical: jest.fn(),
  chart: jest.fn(),
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
      (mockYahooInstance.quote as unknown as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await service.getQuote('AAPL');
      expect(result).toEqual(mockResult);
      expect(mockYahooInstance.quote).toHaveBeenCalledWith('AAPL');
    });

    it('should throw error on failure', async () => {
      (mockYahooInstance.quote as unknown as jest.Mock).mockRejectedValue(
        new Error('API Error'),
      );

      await expect(service.getQuote('AAPL')).rejects.toThrow('API Error');
    });
  });

  describe('getSummary', () => {
    it('should return summary data on success', async () => {
      const mockResult = { summaryProfile: { sector: 'Tech' } };
      (
        mockYahooInstance.quoteSummary as unknown as jest.Mock
      ).mockResolvedValue(mockResult);

      const result = await service.getSummary('AAPL');
      expect(result).toEqual(mockResult);
      expect(mockYahooInstance.quoteSummary).toHaveBeenCalledWith(
        'AAPL',
        expect.any(Object),
      );
    });
  });

  describe('getHistorical', () => {
    it('should return the chart quotes array on success', async () => {
      // Backed by chart() (not the deprecated, all-or-nothing historical()).
      const quotes = [
        { date: new Date('2024-01-01'), close: 150 },
        { date: new Date('2024-01-02'), close: 151 },
      ];
      (mockYahooInstance.chart as unknown as jest.Mock).mockResolvedValue({
        meta: { symbol: 'AAPL' },
        quotes,
      });

      const from = new Date('2024-01-01');
      const to = new Date('2024-01-02');
      const result = await service.getHistorical('AAPL', from, to);
      expect(result).toEqual(quotes);
      expect(mockYahooInstance.chart).toHaveBeenCalledWith('AAPL', {
        period1: from,
        period2: to,
        interval: '1d',
      });
    });

    it('drops incomplete (null-close) bars instead of throwing', async () => {
      // Yahoo routinely returns an unfinalized current-day bar with a null
      // close. The deprecated historical() threw the whole result away on such
      // partial rows, killing the daily-candle sync. chart() + a central filter
      // keeps the good bars and silently discards the in-progress one.
      (mockYahooInstance.chart as unknown as jest.Mock).mockResolvedValue({
        quotes: [
          { date: new Date('2024-01-01'), close: 150 },
          { date: new Date('2024-01-02'), close: null, adjclose: null },
          { date: new Date('2024-01-03'), close: undefined },
        ],
      });

      const result = await service.getHistorical(
        'CPRI',
        new Date('2024-01-01'),
      );

      expect(result).toEqual([{ date: new Date('2024-01-01'), close: 150 }]);
    });

    it('returns an empty array when chart yields no quotes', async () => {
      (mockYahooInstance.chart as unknown as jest.Mock).mockResolvedValue({
        meta: { symbol: 'AAPL' },
      });

      const result = await service.getHistorical('AAPL', new Date());
      expect(result).toEqual([]);
    });

    it('throws when the chart fetch fails', async () => {
      (mockYahooInstance.chart as unknown as jest.Mock).mockRejectedValue(
        new Error('Network down'),
      );

      await expect(
        service.getHistorical('AAPL', new Date()),
      ).rejects.toThrow('Network down');
    });
  });

  describe('search', () => {
    it('should return search results on success', async () => {
      const mockResult = { news: [{ title: 'Headline' }] };
      (mockYahooInstance.search as unknown as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await service.search('AAPL');
      expect(result).toEqual(mockResult);
    });

    it('runs with validateResult:false so schema drift does not throw', async () => {
      // Yahoo keeps adding fields the strict schema rejects; validation must be
      // off or search() throws and we lose the news array entirely.
      (mockYahooInstance.search as unknown as jest.Mock).mockResolvedValue({
        news: [],
      });

      await service.search('EKT.DE');

      expect(mockYahooInstance.search).toHaveBeenCalledWith(
        'EKT.DE',
        {},
        { validateResult: false },
      );
    });
  });
});

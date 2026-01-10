import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FinnhubService } from './finnhub.service';

// Mock the finnhub library
const mockFinnhubClient = {
  companyProfile2: jest.fn(),
  quote: jest.fn(),
  companyNews: jest.fn(),
  marketNews: jest.fn(),
  companyBasicFinancials: jest.fn(),
  marketStatus: jest.fn(),
};

jest.mock('finnhub', () => ({
  DefaultApi: jest.fn().mockImplementation(() => mockFinnhubClient),
}));

describe('FinnhubService', () => {
  let service: FinnhubService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-api-key'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinnhubService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<FinnhubService>(FinnhubService);
    configService = module.get<ConfigService>(ConfigService);
    service.onModuleInit();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCompanyProfile', () => {
    it('should return company profile', async () => {
      const mockData = { name: 'Apple Inc', ticker: 'AAPL' };
      mockFinnhubClient.companyProfile2.mockImplementation(
        (params: any, cb: any) => cb(null, mockData),
      );

      const result = await service.getCompanyProfile('AAPL');
      expect(result).toEqual(mockData);
      expect(mockFinnhubClient.companyProfile2).toHaveBeenCalledWith(
        { symbol: 'AAPL' },
        expect.any(Function),
      );
    });

    it('should handle API error', async () => {
      const error = new Error('API Error');
      mockFinnhubClient.companyProfile2.mockImplementation(
        (params: any, cb: any) => cb(error),
      );

      await expect(service.getCompanyProfile('AAPL')).rejects.toThrow(
        'API Error',
      );
    });
  });

  describe('getQuote', () => {
    it('should return quote data', async () => {
      const mockData = { c: 150.0, d: 2.0, dp: 1.5 };
      mockFinnhubClient.quote.mockImplementation((symbol: any, cb: any) =>
        cb(null, mockData),
      );

      const result = await service.getQuote('AAPL');
      expect(result).toEqual(mockData);
      expect(mockFinnhubClient.quote).toHaveBeenCalledWith(
        'AAPL',
        expect.any(Function),
      );
    });
  });

  describe('getCompanyNews', () => {
    it('should return company news', async () => {
      const mockData = [{ headline: 'News 1' }, { headline: 'News 2' }];
      mockFinnhubClient.companyNews.mockImplementation(
        (symbol: any, from: any, to: any, cb: any) => cb(null, mockData),
      );

      const result = await service.getCompanyNews(
        'AAPL',
        '2023-01-01',
        '2023-12-31',
      );
      expect(result).toEqual(mockData);
      expect(mockFinnhubClient.companyNews).toHaveBeenCalledWith(
        'AAPL',
        '2023-01-01',
        '2023-12-31',
        expect.any(Function),
      );
    });
  });

  describe('getMarketStatus', () => {
    it('should return market status and cache it', async () => {
      const mockData = { exchange: 'US', isOpen: true };
      mockFinnhubClient.marketStatus = jest
        .fn()
        .mockImplementation((params: any, cb: any) => cb(null, mockData));

      const result = await service.getMarketStatus('US');
      expect(result).toEqual(mockData);
      expect(mockFinnhubClient.marketStatus).toHaveBeenCalledTimes(1);

      // Call again, should use cache
      const cachedResult = await service.getMarketStatus('US');
      expect(cachedResult).toEqual(mockData);
      expect(mockFinnhubClient.marketStatus).toHaveBeenCalledTimes(1);
    });

    it('should handle API error gracefully for market status', async () => {
      mockFinnhubClient.marketStatus = jest
        .fn()
        .mockImplementation((params: any, cb: any) =>
          cb(new Error('Forbidden')),
        );

      const result = await service.getMarketStatus('US');
      expect(result).toBeNull();
    });
  });
});

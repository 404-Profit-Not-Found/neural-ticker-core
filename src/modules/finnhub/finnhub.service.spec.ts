import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { FinnhubService } from './finnhub.service';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';

describe('FinnhubService', () => {
  let service: FinnhubService;
  let httpService: HttpService;

  const mockHttpService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinnhubService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<FinnhubService>(FinnhubService);
    httpService = module.get<HttpService>(HttpService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCompanyProfile', () => {
    it('should return company profile', async () => {
      const mockData = { name: 'Apple Inc', ticker: 'AAPL' };
      mockHttpService.get.mockReturnValue(of({ data: mockData }));

      const result = await service.getCompanyProfile('AAPL');
      expect(result).toEqual(mockData);
      expect(httpService.get).toHaveBeenCalledWith('/stock/profile2', {
        params: { symbol: 'AAPL' },
      });
    });

    it('should handle API error', async () => {
      const axiosError = { response: { status: 500, data: 'Server error' } };
      mockHttpService.get.mockReturnValue(throwError(() => axiosError));

      await expect(service.getCompanyProfile('AAPL')).rejects.toEqual(
        axiosError,
      );
    });
  });

  describe('getQuote', () => {
    it('should return quote data', async () => {
      const mockData = { c: 150.0, d: 2.0, dp: 1.5 };
      mockHttpService.get.mockReturnValue(of({ data: mockData }));

      const result = await service.getQuote('AAPL');
      expect(result).toEqual(mockData);
      expect(httpService.get).toHaveBeenCalledWith('/quote', {
        params: { symbol: 'AAPL' },
      });
    });

    it('should handle API error', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(service.getQuote('AAPL')).rejects.toThrow('Network error');
    });
  });

  describe('getCompanyNews', () => {
    it('should return company news', async () => {
      const mockData = [{ headline: 'News 1' }, { headline: 'News 2' }];
      mockHttpService.get.mockReturnValue(of({ data: mockData }));

      const result = await service.getCompanyNews(
        'AAPL',
        '2023-01-01',
        '2023-12-31',
      );
      expect(result).toEqual(mockData);
      expect(httpService.get).toHaveBeenCalledWith('/company-news', {
        params: { symbol: 'AAPL', from: '2023-01-01', to: '2023-12-31' },
      });
    });

    it('should handle API error', async () => {
      const axiosError = new AxiosError('Request failed');
      (axiosError as any).response = { status: 403, data: 'Forbidden' };
      mockHttpService.get.mockReturnValue(throwError(() => axiosError));

      await expect(
        service.getCompanyNews('AAPL', '2023-01-01', '2023-12-31'),
      ).rejects.toBeInstanceOf(AxiosError);
    });
  });
});

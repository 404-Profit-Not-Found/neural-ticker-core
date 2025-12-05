import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { FinnhubService } from './finnhub.service';
import { of } from 'rxjs';

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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCompanyProfile', () => {
    it('should verify connection on init', async () => {
      const mockData = { name: 'Apple Inc', ticker: 'AAPL' };
      mockHttpService.get.mockReturnValue(of({ data: mockData }));

      const result = await service.getCompanyProfile('AAPL');
      expect(result).toEqual(mockData);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(httpService.get).toHaveBeenCalledWith('/stock/profile2', {
        params: { symbol: 'AAPL' },
      });
    });
  });

  describe('getQuote', () => {
    it('should return quote data', async () => {
      const mockData = { c: 150.0, d: 2.0, dp: 1.5 };
      mockHttpService.get.mockReturnValue(of({ data: mockData }));

      const result = await service.getQuote('AAPL');
      expect(result).toEqual(mockData);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(httpService.get).toHaveBeenCalledWith('/quote', {
        params: { symbol: 'AAPL' },
      });
    });
  });
});

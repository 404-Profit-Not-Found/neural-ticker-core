import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TickersService } from './tickers.service';
import { TickerEntity } from './entities/ticker.entity';
import { TickerLogoEntity } from './entities/ticker-logo.entity';
import { FinnhubService } from '../finnhub/finnhub.service';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';
import { NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { JobsService } from '../jobs/jobs.service';

import { PriceOhlcv } from '../market-data/entities/price-ohlcv.entity';

describe('TickersService', () => {
  let service: TickersService;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
  };

  const mockTickerRepo = {
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockLogoRepo = {
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
  };

  const mockOhlcvRepo = {
    find: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    count: jest.fn(),
  };

  const mockFinnhubService = {
    getCompanyProfile: jest.fn(),
    searchSymbols: jest.fn(),
  };
  const mockYahooService = {
    getSummary: jest.fn(),
    search: jest.fn(),
  };

  const mockHttpService = {
    get: jest.fn().mockReturnValue(of({ data: Buffer.from('') })),
  };

  const mockJobsService = {
    queueRequest: jest.fn(),
    initializeTicker: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TickersService,
        {
          provide: getRepositoryToken(TickerEntity),
          useValue: mockTickerRepo,
        },
        {
          provide: getRepositoryToken(TickerLogoEntity),
          useValue: mockLogoRepo,
        },
        {
          provide: getRepositoryToken(PriceOhlcv),
          useValue: mockOhlcvRepo,
        },
        {
          provide: FinnhubService,
          useValue: mockFinnhubService,
        },
        {
          provide: YahooFinanceService,
          useValue: mockYahooService,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: JobsService,
          useValue: mockJobsService,
        },
      ],
    }).compile();

    service = module.get<TickersService>(TickersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTicker', () => {
    it('should return ticker if found', async () => {
      const mockTicker = { symbol: 'AAPL' };
      mockTickerRepo.findOne.mockResolvedValue(mockTicker);
      expect(await service.getTicker('AAPL')).toEqual(mockTicker);
    });

    it('should throw NotFoundException if not found and finnhub fails', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);
      mockFinnhubService.getCompanyProfile.mockRejectedValue(
        new Error('API error'),
      );
      await expect(service.getTicker('UNKNOWN')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('awaitEnsureTicker', () => {
    it('should be an alias for ensureTicker', async () => {
      const mockTicker = { symbol: 'AAPL' };
      mockTickerRepo.findOne.mockResolvedValue(mockTicker);
      expect(await service.awaitEnsureTicker('AAPL')).toEqual(mockTicker);
    });
  });

  describe('ensureTicker', () => {
    it('should return existing ticker if found', async () => {
      const mockTicker = { symbol: 'AAPL' };
      mockTickerRepo.findOne.mockResolvedValue(mockTicker);
      expect(await service.ensureTicker('AAPL')).toEqual(mockTicker);
      expect(mockFinnhubService.getCompanyProfile).not.toHaveBeenCalled();
    });

    it('should trigger logo download for existing ticker with logo_url', async () => {
      const mockTicker = {
        id: '1',
        symbol: 'AAPL',
        logo_url: 'https://logo.com/aapl.png',
      };
      mockTickerRepo.findOne.mockResolvedValue(mockTicker);
      mockLogoRepo.findOne.mockResolvedValue(null);

      await service.ensureTicker('AAPL');
      expect(mockLogoRepo.findOne).toHaveBeenCalled();
    });

    it('should fetch and create ticker if not found', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);
      const mockProfile = {
        name: 'Apple Inc',
        currency: 'USD',
        exchange: 'NASDAQ',
      };
      mockFinnhubService.getCompanyProfile.mockResolvedValue(mockProfile);
      const newTicker = { id: '1', symbol: 'AAPL', ...mockProfile };
      mockTickerRepo.create.mockReturnValue(newTicker);
      mockTickerRepo.save.mockResolvedValue(newTicker);

      const result = await service.ensureTicker('AAPL');
      expect(result).toEqual(newTicker);
      expect(mockFinnhubService.getCompanyProfile).toHaveBeenCalledWith('AAPL');
      expect(mockTickerRepo.save).toHaveBeenCalled();
    });

    it('should convert symbol to uppercase', async () => {
      const mockTicker = { symbol: 'AAPL' };
      mockTickerRepo.findOne.mockResolvedValue(mockTicker);
      await service.ensureTicker('aapl');
      expect(mockTickerRepo.findOne).toHaveBeenCalledWith({
        where: { symbol: 'AAPL' },
      });
    });

    it('should throw NotFoundException if Finnhub returns empty', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);
      mockFinnhubService.getCompanyProfile.mockResolvedValue({});
      await expect(service.ensureTicker('BAD')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with rate limit message', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);
      const rateLimitError = { response: { status: 429 } };
      mockFinnhubService.getCompanyProfile.mockRejectedValue(rateLimitError);
      await expect(service.ensureTicker('TEST')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException on generic API error', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);
      mockFinnhubService.getCompanyProfile.mockRejectedValue(
        new Error('Network error'),
      );
      await expect(service.ensureTicker('TEST')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('downloadAndSaveLogo', () => {
    it('should download and save logo', async () => {
      const mockResponse = {
        data: Buffer.from('imagedata'),
        headers: { 'content-type': 'image/png' },
      };
      mockHttpService.get.mockReturnValue(of(mockResponse));
      mockLogoRepo.save.mockResolvedValue({});

      await service.downloadAndSaveLogo(
        'ticker-1',
        'https://logo.com/test.png',
      );

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://logo.com/test.png',
        {
          responseType: 'arraybuffer',
        },
      );
      expect(mockLogoRepo.create).toHaveBeenCalled();
      expect(mockLogoRepo.save).toHaveBeenCalled();
    });

    it('should handle download failure gracefully', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      // Should not throw, just log error
      await expect(
        service.downloadAndSaveLogo('ticker-1', 'https://bad.com'),
      ).resolves.toBeUndefined();
    });

    it('should return early if no URL provided', async () => {
      await service.downloadAndSaveLogo('ticker-1', '');
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });
  });

  describe('getLogo', () => {
    it('should return logo if found', async () => {
      const ticker = { id: 'ticker-1', symbol: 'AAPL' };
      const logo = { symbol_id: 'ticker-1', image_data: Buffer.from('data') };
      mockTickerRepo.findOne.mockResolvedValue(ticker);
      mockLogoRepo.findOne.mockResolvedValue(logo);

      const result = await service.getLogo('AAPL');
      expect(result).toEqual(logo);
    });

    it('should return null if ticker not found', async () => {
      mockTickerRepo.findOne.mockResolvedValue(null);

      const result = await service.getLogo('UNKNOWN');
      expect(result).toBeNull();
    });

    it('should return null if logo not found for ticker', async () => {
      const ticker = { id: 'ticker-1', symbol: 'AAPL' };
      mockTickerRepo.findOne.mockResolvedValue(ticker);
      mockLogoRepo.findOne.mockResolvedValue(null);

      const result = await service.getLogo('AAPL');
      expect(result).toBeNull();
    });
  });

  describe('getAllTickers', () => {
    it('should return all tickers', async () => {
      const tickers = [{ symbol: 'AAPL' }, { symbol: 'GOOGL' }];
      mockTickerRepo.find.mockResolvedValue(tickers);

      const result = await service.getAllTickers();
      expect(result).toEqual(tickers);
      expect(mockTickerRepo.find).toHaveBeenCalledWith({
        select: ['symbol', 'name', 'exchange'],
        where: { is_hidden: false },
        order: { symbol: 'ASC' },
      });
    });
  });

  describe('searchTickers', () => {
    it('should return all tickers when no search query', async () => {
      const tickers = [{ symbol: 'AAPL' }];
      mockTickerRepo.find.mockResolvedValue(tickers);

      const result = await service.searchTickers();
      expect(result).toEqual([{ symbol: 'AAPL', is_locally_tracked: true }]);
    });

    it('should return all tickers for empty search', async () => {
      const tickers = [{ symbol: 'AAPL' }];
      mockTickerRepo.find.mockResolvedValue(tickers);

      const result = await service.searchTickers('   ');
      expect(result).toEqual([{ symbol: 'AAPL', is_locally_tracked: true }]);
    });

    it('should search with query pattern', async () => {
      await service.searchTickers('AAP');
      expect(mockTickerRepo.createQueryBuilder).toHaveBeenCalledWith('ticker');
    });
  });
  describe('getUniqueSectors', () => {
    it('should return sectors from finnhub_industry if sector column is empty', async () => {
      const mockRawResults = [
        { sector: 'Technology' },
        { sector: 'Healthcare' },
      ];
      const qb = mockTickerRepo.createQueryBuilder();
      qb.getRawMany.mockResolvedValue(mockRawResults);

      const result = await service.getUniqueSectors();

      expect(result).toEqual(['Technology', 'Healthcare']);
      expect(qb.select).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE'),
        'sector',
      );
    });

    it('should filter out empty sectors', async () => {
      const mockRawResults = [
        { sector: 'Technology' },
        { sector: '' },
        { sector: null },
      ];
      const qb = mockTickerRepo.createQueryBuilder();
      qb.getRawMany.mockResolvedValue(mockRawResults);

      const result = await service.getUniqueSectors();
      expect(result).toEqual(['Technology']);
    });
  });
});

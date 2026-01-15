import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TickersService } from './tickers.service';
import { TickerEntity } from './entities/ticker.entity';
import { TickerLogoEntity } from './entities/ticker-logo.entity';
import { TickerRequestEntity } from '../ticker-requests/entities/ticker-request.entity';
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

  const mockRequestRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    count: jest.fn(),
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
        {
          provide: getRepositoryToken(TickerRequestEntity),
          useValue: mockRequestRepo,
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
    let mockOhlcvQueryBuilder: any;

    beforeEach(() => {
      // Setup ohlcv query builder mock for sparkline batch query
      mockOhlcvQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockOhlcvRepo.createQueryBuilder = jest.fn(() => mockOhlcvQueryBuilder);
    });

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

    it('should batch fetch sparklines for all results in a single query', async () => {
      const dbResults = [
        { id: '1', symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ' },
        { id: '2', symbol: 'GOOGL', name: 'Google', exchange: 'NASDAQ' },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(dbResults);
      mockRequestRepo.find.mockResolvedValue([]);

      const priceData = [
        { symbol_id: '1', close: 150, ts: new Date('2026-01-14') },
        { symbol_id: '1', close: 149, ts: new Date('2026-01-13') },
        { symbol_id: '2', close: 200, ts: new Date('2026-01-14') },
        { symbol_id: '2', close: 199, ts: new Date('2026-01-13') },
      ];
      mockOhlcvQueryBuilder.getMany.mockResolvedValue(priceData);

      const result = await service.searchTickers('A');

      // Verify batch query was used
      expect(mockOhlcvRepo.createQueryBuilder).toHaveBeenCalledWith('ohlcv');
      expect(mockOhlcvQueryBuilder.where).toHaveBeenCalledWith(
        'ohlcv.symbol_id IN (:...symbolIds)',
        { symbolIds: ['1', '2'] },
      );

      // Verify sparklines are attached correctly
      expect(result[0].sparkline).toEqual([149, 150]); // reversed for chronological order
      expect(result[1].sparkline).toEqual([199, 200]);
    });

    it('should handle sparkline fetch failure gracefully', async () => {
      const dbResults = [
        { id: '1', symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ' },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(dbResults);
      mockRequestRepo.find.mockResolvedValue([]);

      // Simulate database error (like 42P01 - table not found)
      mockOhlcvQueryBuilder.getMany.mockRejectedValue(
        new Error('relation "price_ohlcv" does not exist'),
      );

      // Should NOT throw - graceful degradation
      const result = await service.searchTickers('A');

      // Should still return results, just without sparklines
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('AAPL');
      expect(result[0].sparkline).toEqual([]); // Empty array, not undefined
    });

    it('should handle local database failure gracefully by returning external results', async () => {
      // Force local DB to fail ONCE to avoid bleeding into other tests
      mockTickerRepo.createQueryBuilder.mockImplementationOnce(() => {
        throw new Error('Relation "tickers" does not exist');
      });

      // Mock external results to ensure we still get something
      mockFinnhubService.searchSymbols.mockResolvedValue({
        result: [{ symbol: 'EXT', description: 'External Co', type: 'Common' }],
      });
      mockYahooService.search.mockResolvedValue({ quotes: [] });

      const result = await service.searchTickers('EXT', true);

      // Should not throw, and should contain external result
      expect(result).toContainEqual(
        expect.objectContaining({ symbol: 'EXT', is_locally_tracked: false }),
      );
    });

    it('should return empty sparklines for tickers with no price data', async () => {
      const dbResults = [
        { id: '1', symbol: 'NEW', name: 'New Stock', exchange: 'NYSE' },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(dbResults);
      mockRequestRepo.find.mockResolvedValue([]);
      mockOhlcvQueryBuilder.getMany.mockResolvedValue([]); // No price data

      const result = await service.searchTickers('NEW');

      expect(result[0].sparkline).toEqual([]);
    });

    it('should include pending requests in search results', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockRequestRepo.find.mockResolvedValue([
        { symbol: 'PENDING', status: 'PENDING' },
      ]);

      const result = await service.searchTickers('PEN');

      const pendingResult = result.find((r) => r.symbol === 'PENDING');
      expect(pendingResult).toBeDefined();
      expect(pendingResult?.is_locally_tracked).toBe(false);
      expect(pendingResult?.is_queued).toBe(true);
    });

    it('should deduplicate pending requests that match existing tickers', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([
        { id: '1', symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ' },
      ]);
      mockRequestRepo.find.mockResolvedValue([
        { symbol: 'AAPL', status: 'PENDING' },
      ]);

      const result = await service.searchTickers('AAP');

      // Should only have one AAPL entry
      const aaplResults = result.filter(
        (r) => r.symbol?.toUpperCase() === 'AAPL',
      );
      expect(aaplResults).toHaveLength(1);
      expect(aaplResults[0].is_locally_tracked).toBe(true);
    });

    it('should include external results when includeExternal is true', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockRequestRepo.find.mockResolvedValue([]);

      mockFinnhubService.searchSymbols.mockResolvedValue({
        result: [{ symbol: 'EXTFIN', description: 'External from Finnhub' }],
      });
      mockYahooService.search.mockResolvedValue({
        quotes: [{ symbol: 'EXTYAH', shortname: 'External from Yahoo' }],
      });

      const result = await service.searchTickers('EXT', true);

      expect(mockFinnhubService.searchSymbols).toHaveBeenCalledWith('EXT');
      expect(mockYahooService.search).toHaveBeenCalledWith('EXT');

      const finnhubResult = result.find((r) => r.symbol === 'EXTFIN');
      const yahooResult = result.find((r) => r.symbol === 'EXTYAH');
      expect(finnhubResult).toBeDefined();
      expect(yahooResult).toBeDefined();
      expect(finnhubResult?.is_locally_tracked).toBe(false);
    });

    it('should handle external API failures gracefully', async () => {
      const dbResults = [
        { id: '1', symbol: 'LOCAL', name: 'Local Stock', exchange: 'NYSE' },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(dbResults);
      mockRequestRepo.find.mockResolvedValue([]);

      mockFinnhubService.searchSymbols.mockRejectedValue(
        new Error('API rate limit'),
      );
      mockYahooService.search.mockRejectedValue(new Error('API error'));

      // Should NOT throw - should return local results
      const result = await service.searchTickers('LOC', true);

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('LOCAL');
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

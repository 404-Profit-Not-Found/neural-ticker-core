import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TickersService } from './tickers.service';
import { TickerEntity } from './entities/ticker.entity';
import { TickerLogoEntity } from './entities/ticker-logo.entity';
import { FinnhubService } from '../finnhub/finnhub.service';
import { NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

describe('TickersService', () => {
  let service: TickersService;
  let repo: any;
  let logoRepo: any;
  let finnhub: any;
  let httpService: any;

  const mockTickerRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
    find: jest.fn(),
  };

  const mockLogoRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockFinnhubService = {
    getCompanyProfile: jest.fn(),
  };

  const mockHttpService = {
    get: jest.fn(),
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
          provide: FinnhubService,
          useValue: mockFinnhubService,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<TickersService>(TickersService);
    repo = module.get(getRepositoryToken(TickerEntity));
    logoRepo = module.get(getRepositoryToken(TickerLogoEntity));
    finnhub = module.get(FinnhubService);
    httpService = module.get(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTicker', () => {
    it('should return ticker if found', async () => {
      const mockTicker = { symbol: 'AAPL' };
      repo.findOne.mockResolvedValue(mockTicker);
      expect(await service.getTicker('AAPL')).toEqual(mockTicker);
    });

    it('should throw NotFoundException if not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getTicker('UNKNOWN')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('ensureTicker', () => {
    it('should return existing ticker if found', async () => {
      const mockTicker = { symbol: 'AAPL' };
      repo.findOne.mockResolvedValue(mockTicker);
      expect(await service.ensureTicker('AAPL')).toEqual(mockTicker);
      expect(finnhub.getCompanyProfile).not.toHaveBeenCalled();
    });

    it('should fetch and create ticker if not found', async () => {
      repo.findOne.mockResolvedValue(null);
      const mockProfile = { name: 'Apple Inc', currency: 'USD' };
      finnhub.getCompanyProfile.mockResolvedValue(mockProfile);
      const newTicker = { symbol: 'AAPL', ...mockProfile };
      repo.create.mockReturnValue(newTicker);
      repo.save.mockResolvedValue(newTicker);

      const result = await service.ensureTicker('AAPL');
      expect(result).toEqual(newTicker);
      expect(finnhub.getCompanyProfile).toHaveBeenCalledWith('AAPL');
      expect(repo.save).toHaveBeenCalled();
    });

    it('should throw EntityNotFound if Finnhub returns empty', async () => {
      repo.findOne.mockResolvedValue(null);
      finnhub.getCompanyProfile.mockResolvedValue({});
      await expect(service.ensureTicker('BAD')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

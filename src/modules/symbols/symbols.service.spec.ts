import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SymbolsService } from './symbols.service';
import { SymbolEntity } from './entities/symbol.entity';
import { FinnhubService } from '../finnhub/finnhub.service';
import { NotFoundException } from '@nestjs/common';

describe('SymbolsService', () => {
  let service: SymbolsService;
  let repo: any;
  let finnhub: any;

  const mockSymbolRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockFinnhubService = {
    getCompanyProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SymbolsService,
        {
          provide: getRepositoryToken(SymbolEntity),
          useValue: mockSymbolRepo,
        },
        {
          provide: FinnhubService,
          useValue: mockFinnhubService,
        },
      ],
    }).compile();

    service = module.get<SymbolsService>(SymbolsService);
    repo = module.get(getRepositoryToken(SymbolEntity));
    finnhub = module.get(FinnhubService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSymbol', () => {
    it('should return symbol if found', async () => {
      const mockSymbol = { symbol: 'AAPL' };
      repo.findOne.mockResolvedValue(mockSymbol);
      expect(await service.getSymbol('AAPL')).toEqual(mockSymbol);
    });

    it('should throw NotFoundException if not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getSymbol('UNKNOWN')).rejects.toThrow(NotFoundException);
    });
  });

  describe('ensureSymbol', () => {
    it('should return existing symbol if found', async () => {
      const mockSymbol = { symbol: 'AAPL' };
      repo.findOne.mockResolvedValue(mockSymbol);
      expect(await service.ensureSymbol('AAPL')).toEqual(mockSymbol);
      expect(finnhub.getCompanyProfile).not.toHaveBeenCalled();
    });

    it('should fetch and create symbol if not found', async () => {
      repo.findOne.mockResolvedValue(null);
      const mockProfile = { name: 'Apple Inc', currency: 'USD' };
      finnhub.getCompanyProfile.mockResolvedValue(mockProfile);
      const newSymbol = { symbol: 'AAPL', ...mockProfile };
      repo.create.mockReturnValue(newSymbol);
      repo.save.mockResolvedValue(newSymbol);

      const result = await service.ensureSymbol('AAPL');
      expect(result).toEqual(newSymbol);
      expect(finnhub.getCompanyProfile).toHaveBeenCalledWith('AAPL');
      expect(repo.save).toHaveBeenCalled();
    });

    it('should throw EntityNotFound if Finnhub returns empty', async () => {
        repo.findOne.mockResolvedValue(null);
        finnhub.getCompanyProfile.mockResolvedValue({});
        await expect(service.ensureSymbol('BAD')).rejects.toThrow(NotFoundException);
    });
  });
});

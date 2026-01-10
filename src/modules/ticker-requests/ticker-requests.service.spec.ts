import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TickerRequestsService } from './ticker-requests.service';
import { TickerRequestEntity } from './entities/ticker-request.entity';
import { TickersService } from '../tickers/tickers.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TickerRequestsService', () => {
  let service: TickerRequestsService;
  let requestRepo: any;
  let tickersService: any;

  const mockRequestRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockTickersService = {
    findOneBySymbol: jest.fn(),
    ensureTicker: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TickerRequestsService,
        {
          provide: getRepositoryToken(TickerRequestEntity),
          useValue: mockRequestRepo,
        },
        {
          provide: TickersService,
          useValue: mockTickersService,
        },
      ],
    }).compile();

    service = module.get<TickerRequestsService>(TickerRequestsService);
    requestRepo = module.get(getRepositoryToken(TickerRequestEntity));
    tickersService = module.get<TickersService>(TickersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRequest', () => {
    const userId = 'user-123';
    const symbol = 'AAPL';

    it('should throw BadRequestException if ticker is already tracked', async () => {
      tickersService.findOneBySymbol.mockResolvedValue({ id: 1, symbol: 'AAPL' });
      await expect(service.createRequest(userId, symbol)).rejects.toThrow(BadRequestException);
    });

    it('should return existing request if it is already pending', async () => {
      tickersService.findOneBySymbol.mockResolvedValue(null);
      const existingRequest = { id: 'req-1', symbol: 'AAPL', status: 'PENDING' };
      requestRepo.findOne.mockResolvedValue(existingRequest);

      const result = await service.createRequest(userId, symbol);
      expect(result).toEqual(existingRequest);
      expect(requestRepo.create).not.toHaveBeenCalled();
    });

    it('should create and save a new request', async () => {
      tickersService.findOneBySymbol.mockResolvedValue(null);
      requestRepo.findOne.mockResolvedValue(null);
      const newRequest = { user_id: userId, symbol: 'AAPL', status: 'PENDING' };
      requestRepo.create.mockReturnValue(newRequest);
      requestRepo.save.mockResolvedValue({ id: 'new-id', ...newRequest });

      const result = await service.createRequest(userId, symbol);
      expect(result.id).toBe('new-id');
      expect(requestRepo.save).toHaveBeenCalledWith(newRequest);
    });
  });

  describe('approveRequest', () => {
    it('should throw NotFoundException if request does not exist', async () => {
      requestRepo.findOne.mockResolvedValue(null);
      await expect(service.approveRequest('none')).rejects.toThrow(NotFoundException);
    });

    it('should return request if already approved', async () => {
      const approvedRepo = { id: '1', status: 'APPROVED' };
      requestRepo.findOne.mockResolvedValue(approvedRepo);
      const result = await service.approveRequest('1');
      expect(result).toEqual(approvedRepo);
    });

    it('should approve and ensure ticker', async () => {
      const pendingRequest = { id: '1', symbol: 'AAPL', status: 'PENDING' };
      requestRepo.findOne.mockResolvedValue(pendingRequest);
      tickersService.ensureTicker.mockResolvedValue({ id: 1, symbol: 'AAPL' });
      requestRepo.save.mockImplementation(r => Promise.resolve(r));

      const result = await service.approveRequest('1');
      expect(result.status).toBe('APPROVED');
      expect(tickersService.ensureTicker).toHaveBeenCalledWith('AAPL');
    });

    it('should throw BadRequestException if ensureTicker fails', async () => {
      const pendingRequest = { id: '1', symbol: 'INVALID', status: 'PENDING' };
      requestRepo.findOne.mockResolvedValue(pendingRequest);
      tickersService.ensureTicker.mockRejectedValue(new Error('Invalid symbol'));

      await expect(service.approveRequest('1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectRequest', () => {
    it('should set status to REJECTED', async () => {
      const request = { id: '1', symbol: 'AAPL', status: 'PENDING' };
      requestRepo.findOne.mockResolvedValue(request);
      requestRepo.save.mockImplementation(r => Promise.resolve(r));

      const result = await service.rejectRequest('1');
      expect(result.status).toBe('REJECTED');
    });
  });
});

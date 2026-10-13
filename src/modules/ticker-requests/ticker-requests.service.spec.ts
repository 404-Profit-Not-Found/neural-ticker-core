import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TickerRequestsService } from './ticker-requests.service';
import { TickerRequestEntity } from './entities/ticker-request.entity';
import { TickersService } from '../tickers/tickers.service';
import { User } from '../users/entities/user.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TickerRequestsService', () => {
  let service: TickerRequestsService;
  let requestRepo: any;
  let tickersService: any;

  const mockRequestRepo: any = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  };

  // createRequest() now serializes per-user work inside
  // requestRepo.manager.transaction(tx => ...), taking an advisory lock and
  // using the transactional repository. The tx manager delegates back to the
  // same repo mock so existing findOne/create/save expectations still apply.
  const mockTxManager = {
    getRepository: jest.fn(() => mockRequestRepo),
    query: jest.fn().mockResolvedValue(undefined),
  };

  mockRequestRepo.manager = {
    transaction: jest.fn((cb: (m: typeof mockTxManager) => unknown) =>
      Promise.resolve(cb(mockTxManager)),
    ),
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
      tickersService.findOneBySymbol.mockResolvedValue({
        id: 1,
        symbol: 'AAPL',
      });
      await expect(service.createRequest(userId, symbol)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should return the caller's own request if it is already pending", async () => {
      tickersService.findOneBySymbol.mockResolvedValue(null);
      const existingRequest = {
        id: 'req-1',
        symbol: 'AAPL',
        status: 'PENDING',
        user_id: userId,
      };
      requestRepo.findOne.mockResolvedValue(existingRequest);

      const result = await service.createRequest(userId, symbol);
      expect(result).toEqual(existingRequest);
      expect(requestRepo.create).not.toHaveBeenCalled();
    });

    it("never returns ANOTHER user's pending request row — only that the symbol is already requested", async () => {
      tickersService.findOneBySymbol.mockResolvedValue(null);
      requestRepo.findOne.mockResolvedValue({
        id: 'req-of-someone-else',
        symbol: 'AAPL',
        status: 'PENDING',
        user_id: 'other-user-uuid',
        created_at: new Date('2026-10-01T10:00:00Z'),
        updated_at: new Date('2026-10-01T10:00:00Z'),
      });

      const result = await service.createRequest(userId, symbol);

      expect(result).toEqual({ symbol: 'AAPL', status: 'PENDING' });
      const json = JSON.stringify(result);
      expect(json).not.toContain('other-user-uuid');
      expect(json).not.toContain('req-of-someone-else');
      // Still de-duplicated: no second row for the same symbol.
      expect(requestRepo.create).not.toHaveBeenCalled();
      expect(requestRepo.save).not.toHaveBeenCalled();
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
      await expect(service.approveRequest('none')).rejects.toThrow(
        NotFoundException,
      );
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
      requestRepo.save.mockImplementation((r: TickerRequestEntity) =>
        Promise.resolve(r),
      );

      const result = await service.approveRequest('1');
      expect(result.status).toBe('APPROVED');
      expect(tickersService.ensureTicker).toHaveBeenCalledWith('AAPL');
    });

    it('should throw BadRequestException if ensureTicker fails', async () => {
      const pendingRequest = { id: '1', symbol: 'INVALID', status: 'PENDING' };
      requestRepo.findOne.mockResolvedValue(pendingRequest);
      tickersService.ensureTicker.mockRejectedValue(
        new Error('Invalid symbol'),
      );

      await expect(service.approveRequest('1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('rejectRequest', () => {
    it('should set status to REJECTED', async () => {
      const request = { id: '1', symbol: 'AAPL', status: 'PENDING' };
      requestRepo.findOne.mockResolvedValue(request);
      requestRepo.save.mockImplementation((r: TickerRequestEntity) =>
        Promise.resolve(r),
      );

      const result = await service.rejectRequest('1');
      expect(result.status).toBe('REJECTED');
    });
  });

  describe('getRequests (admin listing)', () => {
    const mockListQuery = (rows: any[]) => {
      const qb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      mockRequestRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      return qb;
    };

    it('joins the requester with the admin-summary columns only', async () => {
      const qb = mockListQuery([]);

      await service.getRequests();

      expect(qb.leftJoin).toHaveBeenCalledWith('request.user', 'user');
      expect(qb.addSelect).toHaveBeenCalledWith([
        'user.id',
        'user.nickname',
        'user.avatar_url',
        'user.tier',
        'user.email',
        'user.full_name',
      ]);
      expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('request.created_at', 'DESC');
    });

    it("gives an admin the requester's contact summary but never the row's secrets", async () => {
      // A fully loaded requester, to pin the projection on its own.
      mockListQuery([
        {
          id: 'r1',
          symbol: 'VWS.CO',
          status: 'PENDING',
          user_id: 'u1',
          user: Object.assign(new User(), {
            id: 'u1',
            email: 'alice.private@example.com',
            google_id: 'google-sub-1234567890',
            full_name: 'Alice Private',
            credits_balance: 4242,
            nickname: 'FunnyPanda123',
            avatar_url: null,
            tier: 'pro',
            preferences: { gemini_api_key: 'SECRET' },
          }),
        },
      ]);

      const result = await service.getRequests();

      expect(result).toEqual([
        {
          id: 'r1',
          symbol: 'VWS.CO',
          status: 'PENDING',
          user_id: 'u1',
          // What the admin panel (tier, avatar, nickname, email) and the MCP
          // list_ticker_requests serializer (full_name, email) read.
          user: {
            id: 'u1',
            nickname: 'FunnyPanda123',
            avatar_url: null,
            tier: 'pro',
            email: 'alice.private@example.com',
            full_name: 'Alice Private',
          },
        },
      ]);
      const json = JSON.stringify(result);
      expect(json).not.toContain('SECRET');
      expect(json).not.toContain('google-sub-1234567890');
      expect(json).not.toContain('4242');
    });
  });
});

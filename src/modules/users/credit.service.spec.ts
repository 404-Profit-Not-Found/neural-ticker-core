import { Test, TestingModule } from '@nestjs/testing';
import { CreditService } from './credit.service';
import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { CreditTransaction } from './entities/credit-transaction.entity';
import { BadRequestException } from '@nestjs/common';

const mockUser = {
  id: 'user-1',
  credits_balance: 10,
} as User;

const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    getRepository: jest.fn(),
  },
};

const mockDataSource = {
  getRepository: jest.fn(),
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockUserRepo = {
  findOneBy: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  })),
};

const mockTxRepo = {
  create: jest.fn(),
  save: jest.fn(),
};

describe('CreditService', () => {
  let service: CreditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<CreditService>(CreditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getBalance', () => {
    it('should return user balance', async () => {
      mockDataSource.getRepository.mockReturnValue({
        findOneBy: jest.fn().mockResolvedValue(mockUser),
      });

      const balance = await service.getBalance('user-1');
      expect(balance).toBe(10);
    });

    it('should return 0 if user not found', async () => {
      mockDataSource.getRepository.mockReturnValue({
        findOneBy: jest.fn().mockResolvedValue(null),
      });

      const balance = await service.getBalance('user-1');
      expect(balance).toBe(0);
    });
  });

  describe('getResearchCost', () => {
    it('charges 5 for the premium deep / ensemble paths', () => {
      expect(service.getResearchCost('gemini', 'deep')).toBe(5);
      expect(service.getResearchCost('ensemble', 'medium')).toBe(5);
      expect(service.getResearchCost('ENSEMBLE', 'DEEP')).toBe(5);
    });

    it('charges 1 for standard paths and missing params', () => {
      expect(service.getResearchCost('gemini', 'medium')).toBe(1);
      expect(service.getResearchCost('openai', 'low')).toBe(1);
      expect(service.getResearchCost(undefined, undefined)).toBe(1);
    });
  });

  describe('addCredits', () => {
    it('rejects non-positive amounts', async () => {
      await expect(
        service.addCredits('user-1', 0, 'admin_gift'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.addCredits('user-1', -5, 'admin_gift'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should add credits transactionally', async () => {
      mockQueryRunner.manager.getRepository.mockImplementation((entity) => {
        if (entity === User) return mockUserRepo;
        if (entity === CreditTransaction) return mockTxRepo;
        return null;
      });

      mockUserRepo.findOneBy.mockResolvedValue({ ...mockUser });
      mockTxRepo.create.mockReturnValue({});

      await service.addCredits('user-1', 5, 'manual_contribution');

      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ credits_balance: 15 }),
      );
      expect(mockTxRepo.save).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('deductCredits', () => {
    it('rejects non-positive amounts (prevents negative-amount credit minting)', async () => {
      await expect(
        service.deductCredits('user-1', -5, 'research_spend'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.deductCredits('user-1', 0, 'research_spend'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should deduct credits if sufficient balance', async () => {
      mockQueryRunner.manager.getRepository.mockImplementation((entity) => {
        if (entity === User) return mockUserRepo;
        if (entity === CreditTransaction) return mockTxRepo;
        return null;
      });

      // Mock createQueryBuilder for pessimistic lock
      const mockQb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest
          .fn()
          .mockResolvedValue({ ...mockUser, credits_balance: 10 }),
      };
      mockUserRepo.createQueryBuilder.mockReturnValue(mockQb);

      mockTxRepo.create.mockReturnValue({});

      await service.deductCredits('user-1', 5, 'research_spend');

      expect(mockUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ credits_balance: 5 }),
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if insufficient credits', async () => {
      mockQueryRunner.manager.getRepository.mockImplementation((entity) => {
        if (entity === User) return mockUserRepo;
        if (entity === CreditTransaction) return mockTxRepo;
        return null;
      });

      const mockQb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest
          .fn()
          .mockResolvedValue({ ...mockUser, credits_balance: 0 }),
      };
      mockUserRepo.createQueryBuilder.mockReturnValue(mockQb);

      await expect(
        service.deductCredits('user-1', 5, 'research_spend'),
      ).rejects.toThrow(BadRequestException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });
});

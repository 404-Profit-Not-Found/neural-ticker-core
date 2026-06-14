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
  createQueryBuilder: jest.fn(),
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

  describe('addContributionCredits', () => {
    // Wire the locked-user read + the in-transaction 24h SUM query.
    const setup = (opts: { earned: number; user: any }) => {
      mockQueryRunner.manager.getRepository.mockImplementation((entity) => {
        if (entity === User) return mockUserRepo;
        if (entity === CreditTransaction) return mockTxRepo;
        return null;
      });
      const userQb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(opts.user),
      };
      mockUserRepo.createQueryBuilder.mockReturnValue(userQb);
      const txQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ sum: String(opts.earned) }),
      };
      mockTxRepo.createQueryBuilder.mockReturnValue(txQb);
      mockTxRepo.create.mockReturnValue({});
      return { userQb, txQb };
    };

    it('rejects non-positive / non-finite amounts before opening a transaction', async () => {
      await expect(
        service.addContributionCredits('user-1', 0, 50),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.addContributionCredits('user-1', -5, 50),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.addContributionCredits('user-1', NaN, 50),
      ).rejects.toThrow(BadRequestException);
      // Guard runs before any DB work.
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('grants the full reward when well under the cap, and locks the row', async () => {
      const { userQb } = setup({ earned: 0, user: { ...mockUser } });

      const granted = await service.addContributionCredits('user-1', 10, 50);

      expect(granted).toBe(10);
      // The user row must be locked FOR UPDATE so the cap check is atomic.
      expect(userQb.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(mockUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ credits_balance: 20 }),
      );
      expect(mockTxRepo.save).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('clamps the grant to the remaining daily-cap headroom (M8)', async () => {
      setup({ earned: 48, user: { ...mockUser } });

      // Reward is 10 but only 2 of the 50/day cap remain.
      const granted = await service.addContributionCredits('user-1', 10, 50);

      expect(granted).toBe(2);
      expect(mockTxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 2, reason: 'manual_contribution' }),
      );
      expect(mockUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ credits_balance: 12 }),
      );
    });

    it('grants nothing once the cap is reached but still commits (no writes)', async () => {
      setup({ earned: 50, user: { ...mockUser } });

      const granted = await service.addContributionCredits('user-1', 10, 50);

      expect(granted).toBe(0);
      expect(mockUserRepo.save).not.toHaveBeenCalled();
      expect(mockTxRepo.save).not.toHaveBeenCalled();
      // Commit (not rollback) so the row lock releases cleanly.
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('rolls back and throws when the user is not found', async () => {
      setup({ earned: 0, user: null });

      await expect(
        service.addContributionCredits('ghost', 10, 50),
      ).rejects.toThrow(BadRequestException);

      expect(mockUserRepo.save).not.toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('rolls back on a downstream write failure', async () => {
      setup({ earned: 0, user: { ...mockUser } });
      mockTxRepo.save.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.addContributionCredits('user-1', 10, 50),
      ).rejects.toThrow('db down');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
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

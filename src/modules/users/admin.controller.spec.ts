import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreditService } from './credit.service';
import { WatchlistService } from '../watchlist/watchlist.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { ResearchService } from '../research/research.service';

describe('AdminController', () => {
  let controller: AdminController;

  const mockUsersService = {
    findAll: jest.fn(),
    getAllowedUsers: jest.fn(),
    getUnifiedIdentities: jest.fn(),
    allowEmail: jest.fn(),
    revokeEmail: jest.fn(),
    deleteWaitlistUser: jest.fn(),
    updateTier: jest.fn(), // Added
  };

  const mockCreditService = {
    addCredits: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: CreditService,
          useValue: mockCreditService,
        },
        {
          provide: WatchlistService,
          useValue: {},
        },
        {
          provide: PortfolioService,
          useValue: {},
        },
        {
          provide: ResearchService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AdminController>(AdminController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUsers', () => {
    it('should return all users', async () => {
      const users = [{ id: '1', email: 'test@example.com' }];
      mockUsersService.findAll.mockResolvedValue(users);

      const result = await controller.getUsers();

      expect(result).toEqual(users);
    });
  });

  describe('getUserlist', () => {
    it('should return allowed users', async () => {
      const allowed = [{ email: 'test@example.com' }];
      mockUsersService.getAllowedUsers.mockResolvedValue(allowed);

      const result = await controller.getUserlist();

      expect(result).toEqual(allowed);
    });
  });

  describe('getIdentities', () => {
    it('should return unified identities', async () => {
      const identities = [{ email: 'test@example.com', status: 'ACTIVE' }];
      mockUsersService.getUnifiedIdentities.mockResolvedValue(identities);

      const result = await controller.getIdentities();

      expect(result).toEqual(identities);
    });
  });

  describe('addToUserlist', () => {
    it('should add email to userlist', async () => {
      const allowed = { email: 'new@example.com', added_by: 'admin' };
      mockUsersService.allowEmail.mockResolvedValue(allowed);

      const result = await controller.addToUserlist({
        email: 'new@example.com',
      });

      expect(result).toEqual(allowed);
      expect(mockUsersService.allowEmail).toHaveBeenCalledWith(
        'new@example.com',
        'admin',
      );
    });

    it('should use provided addedBy', async () => {
      mockUsersService.allowEmail.mockResolvedValue({});

      await controller.addToUserlist({
        email: 'new@example.com',
        addedBy: 'John',
      });

      expect(mockUsersService.allowEmail).toHaveBeenCalledWith(
        'new@example.com',
        'John',
      );
    });

    it('should throw if email missing (400 — a 401 makes the clients sign the admin out)', async () => {
      await expect(controller.addToUserlist({ email: '' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('revokeAccess', () => {
    it('should revoke email access', async () => {
      mockUsersService.revokeEmail.mockResolvedValue(undefined);
      const req = { user: { id: '1', email: 'admin@example.com' } };

      await controller.revokeAccess('test@example.com', req);

      expect(mockUsersService.revokeEmail).toHaveBeenCalledWith(
        'test@example.com',
        req.user,
      );
    });
  });

  describe('rejectWaitlistUser', () => {
    it('should delete waitlist user', async () => {
      mockUsersService.deleteWaitlistUser.mockResolvedValue(undefined);

      await controller.rejectWaitlistUser('test@example.com');

      expect(mockUsersService.deleteWaitlistUser).toHaveBeenCalledWith(
        'test@example.com',
      );
    });
  });

  describe('giftCredits', () => {
    it("returns the account without the user's secret preference values", async () => {
      // CreditService hands back the full row it just updated.
      mockCreditService.addCredits.mockResolvedValue(
        Object.assign(new User(), {
          id: 'u1',
          email: 'alice.private@example.com',
          credits_balance: 4242,
          preferences: { gemini_api_key: 'SECRET', language: 'sk' },
        }),
      );

      const result = await controller.giftCredits('u1', { amount: 10 });

      expect(mockCreditService.addCredits).toHaveBeenCalledWith(
        'u1',
        10,
        'admin_gift',
        { gifted_by: 'admin' },
      );

      // The body's reason is a note, never the ledger reason: a gift must not
      // be bookable as e.g. a contribution (which counts against a daily cap).
      await controller.giftCredits('u1', {
        amount: 5,
        reason: 'manual_contribution',
      });
      expect(mockCreditService.addCredits).toHaveBeenLastCalledWith(
        'u1',
        5,
        'admin_gift',
        { gifted_by: 'admin', note: 'manual_contribution' },
      );
      const json = JSON.parse(JSON.stringify(result));
      expect(json.email).toBe('alice.private@example.com');
      expect(json.credits_balance).toBe(4242);
      expect(json.preferences).toEqual({
        gemini_api_key_set: true,
        language: 'sk',
      });
      expect(JSON.stringify(result)).not.toContain('SECRET');
    });
  });
});

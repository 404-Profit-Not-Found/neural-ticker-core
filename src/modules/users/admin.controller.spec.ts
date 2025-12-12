import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { UsersService } from './users.service';

describe('AdminController', () => {
  let controller: AdminController;

  const mockUsersService = {
    findAll: jest.fn(),
    getAllowedUsers: jest.fn(),
    getUnifiedIdentities: jest.fn(),
    allowEmail: jest.fn(),
    revokeEmail: jest.fn(),
    deleteWaitlistUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

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

      const result = await controller.addToUserlist({ email: 'new@example.com' });

      expect(result).toEqual(allowed);
      expect(mockUsersService.allowEmail).toHaveBeenCalledWith('new@example.com', 'admin');
    });

    it('should use provided addedBy', async () => {
      mockUsersService.allowEmail.mockResolvedValue({});

      await controller.addToUserlist({ email: 'new@example.com', addedBy: 'John' });

      expect(mockUsersService.allowEmail).toHaveBeenCalledWith('new@example.com', 'John');
    });

    it('should throw if email missing', async () => {
      await expect(controller.addToUserlist({ email: '' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('revokeAccess', () => {
    it('should revoke email access', async () => {
      mockUsersService.revokeEmail.mockResolvedValue(undefined);
      const req = { user: { id: '1', email: 'admin@example.com' } };

      await controller.revokeAccess('test@example.com', req);

      expect(mockUsersService.revokeEmail).toHaveBeenCalledWith('test@example.com', req.user);
    });
  });

  describe('rejectWaitlistUser', () => {
    it('should delete waitlist user', async () => {
      mockUsersService.deleteWaitlistUser.mockResolvedValue(undefined);

      await controller.rejectWaitlistUser('test@example.com');

      expect(mockUsersService.deleteWaitlistUser).toHaveBeenCalledWith('test@example.com');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;
  let authService: AuthService;

  const mockUsersService = {
    updatePreferences: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    updateRole: jest.fn(),
    updateProfile: jest.fn(),
  };

  const mockAuthService = {
    getAuthLogs: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
    authService = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllUsers', () => {
    it('should call service.findAll', async () => {
      const mockUsers = [{ id: 'user-id', email: 'test@example.com' }];
      mockUsersService.findAll.mockResolvedValue(mockUsers);

      const result = await controller.getAllUsers();

      expect(result).toEqual(mockUsers);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('getAuthLogs', () => {
    it('should call authService.getAuthLogs with filter', async () => {
      const filter = { userId: 'user-1', limit: 50 };
      const logs = [{ id: '1', userId: 'user-1' }];
      mockAuthService.getAuthLogs.mockResolvedValue(logs);

      const result = await controller.getAuthLogs(filter);

      expect(result).toEqual(logs);
      expect(authService.getAuthLogs).toHaveBeenCalledWith(filter);
    });
  });

  describe('updateUserRole', () => {
    it('should update role for valid role', async () => {
      const user = { id: 'user-1', role: 'admin' };
      mockUsersService.updateRole.mockResolvedValue(user);

      const result = await controller.updateUserRole('user-1', 'admin');

      expect(result).toEqual(user);
      expect(service.updateRole).toHaveBeenCalledWith('user-1', 'admin');
    });

    it('should throw UnauthorizedException for invalid role', async () => {
      await expect(
        controller.updateUserRole('user-1', 'superadmin'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept user role', async () => {
      const user = { id: 'user-1', role: 'user' };
      mockUsersService.updateRole.mockResolvedValue(user);

      const result = await controller.updateUserRole('user-1', 'user');

      expect(result).toEqual(user);
    });
  });

  describe('updatePreferences', () => {
    it('should call service.updatePreferences', async () => {
      const mockBody = { gemini_api_key: 'new-key' };
      const mockReq = { user: { id: 'user-id' } };

      await controller.updatePreferences(mockReq, mockBody);

      expect(service.updatePreferences).toHaveBeenCalledWith(
        'user-id',
        mockBody,
      );
    });
  });

  describe('updateProfile', () => {
    it('should call service.updateProfile with profile data', async () => {
      const mockReq = { user: { id: 'user-id' } };
      const profileData = { nickname: 'SuperTrader', view_mode: 'KISS', theme: 'g10' };
      const updatedUser = { id: 'user-id', nickname: 'SuperTrader' };
      mockUsersService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile(mockReq, profileData);

      expect(result).toEqual(updatedUser);
      expect(service.updateProfile).toHaveBeenCalledWith('user-id', profileData);
    });

    it('should handle partial profile update', async () => {
      const mockReq = { user: { id: 'user-id' } };
      const profileData = { nickname: 'NewNick' };
      mockUsersService.updateProfile.mockResolvedValue({ id: 'user-id', nickname: 'NewNick' });

      await controller.updateProfile(mockReq, profileData);

      expect(service.updateProfile).toHaveBeenCalledWith('user-id', profileData);
    });
  });
});

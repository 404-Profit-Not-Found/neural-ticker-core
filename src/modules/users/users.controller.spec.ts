import { Test, TestingModule } from '@nestjs/testing';
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

  describe('updatePreferences', () => {
    it('should call service.updatePreferences', async () => {
      const mockBody = { gemini_api_key: 'new-key' };
      const mockReq = { user: { id: 'user-id' } }; // property is 'id' not 'sub' in controller usage

      await controller.updatePreferences(mockReq, mockBody);

      expect(service.updatePreferences).toHaveBeenCalledWith(
        'user-id',
        mockBody,
      );
    });
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
});

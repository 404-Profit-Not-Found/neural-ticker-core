import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';

describe('AuthController', () => {
  let controller: AuthController;

  const mockUser: User = {
    id: '123',
    email: 'test@example.com',
    full_name: 'Test User',
    avatar_url: 'http://picture.url',
    google_id: '1234567890',
    last_login: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockAuthService = {
    login: jest.fn(),
    loginWithFirebase: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('googleAuth', () => {
    it('should be defined', async () => {
      expect(await controller.googleAuth()).toBeUndefined();
    });
  });

  describe('googleAuthRedirect', () => {
    it('should return login result', async () => {
      const mockResult = { access_token: 'jwt-token', user: mockUser };
      mockAuthService.login.mockResolvedValue(mockResult);

      const req = { user: mockUser };
      const res = { json: jest.fn() };

      await controller.googleAuthRedirect(req as any, res as any);

      expect(mockAuthService.login).toHaveBeenCalledWith(mockUser);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Login successful',
        ...mockResult,
      });
    });
  });

  describe('getProfile', () => {
    it('should return req.user', () => {
      const req = { user: mockUser };
      expect(controller.getProfile(req as any)).toEqual(mockUser);
    });
  });

  describe('firebaseLogin', () => {
    it('should login with firebase', async () => {
      const mockResult = { access_token: 'jwt-token', user: mockUser };
      mockAuthService.loginWithFirebase.mockResolvedValue(mockUser);
      mockAuthService.login.mockResolvedValue(mockResult);

      const body = { token: 'firebase-token' };
      const result = await controller.firebaseLogin(body);

      expect(mockAuthService.loginWithFirebase).toHaveBeenCalledWith(
        body.token,
      );
      expect(mockAuthService.login).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(mockResult);
    });

    it('should throw if token missing', async () => {
      const body = { token: '' };
      await expect(controller.firebaseLogin(body)).rejects.toThrow(
        'Token required',
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { UnauthorizedException } from '@nestjs/common';

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
    role: 'user',
    tier: 'free',
    credits_balance: 100,
    credits_reset_at: new Date(),
    credit_transactions: [],
    watchlists: [],
    preferences: {},
    nickname: 'TestNickname',
    view_mode: 'PRO',
    theme: 'dark',
  };

  const mockAuthService = {
    login: jest.fn(),
    loginWithFirebase: jest.fn(),
    localDevLogin: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('http://localhost:3000'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
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
      const res = {
        cookie: jest.fn().mockReturnThis(),
        redirect: jest.fn(),
      };

      await controller.googleAuthRedirect(req as any, res as any);

      expect(mockAuthService.login).toHaveBeenCalledWith(mockUser);
      expect(res.cookie).toHaveBeenCalledWith(
        'authentication',
        'jwt-token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
        }),
      );
      expect(res.redirect).toHaveBeenCalled();
    });

    it('should redirect to access-denied for new waitlist users', async () => {
      const waitlistUser = { ...mockUser, isNewWaitlist: true };
      const req = { user: waitlistUser };
      const res = {
        redirect: jest.fn(),
      };

      await controller.googleAuthRedirect(req as any, res as any);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/access-denied?error=waitlist_joined',
      );
      expect(mockAuthService.login).not.toHaveBeenCalled();
    });

    it('should redirect to access-denied for pending waitlist users', async () => {
      const waitlistUser = { ...mockUser, role: 'waitlist' };
      const req = { user: waitlistUser };
      const res = {
        redirect: jest.fn(),
      };

      await controller.googleAuthRedirect(req as any, res as any);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/access-denied?error=waitlist_pending',
      );
      expect(mockAuthService.login).not.toHaveBeenCalled();
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

  describe('devLogin', () => {
    it('should return token for valid email', async () => {
      const mockResult = { access_token: 'dev-token' };
      mockAuthService.localDevLogin.mockResolvedValue(mockResult);

      const body = { email: 'dev@test.com' };
      const res = {
        cookie: jest.fn().mockReturnThis(),
      };
      const result = await controller.devLogin(body, res as any);

      expect(mockAuthService.localDevLogin).toHaveBeenCalledWith(
        'dev@test.com',
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'authentication',
        'dev-token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
        }),
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw if email missing', async () => {
      const body = { email: '' };
      const res = {
        cookie: jest.fn().mockReturnThis(),
      };
      await expect(controller.devLogin(body, res as any)).rejects.toThrow(
        'Email required',
      );
    });
  });

  describe('logout', () => {
    it('should clear authentication cookie', () => {
      const res = {
        clearCookie: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      controller.logout(res as any);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'authentication',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith({ success: true });
    });
  });
});

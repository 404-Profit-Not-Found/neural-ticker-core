import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { FirebaseService } from '../firebase/firebase.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthLog } from './entities/auth-log.entity';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;
  let firebaseService: FirebaseService;

  const mockAuthLogRepo = {
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
    createOrUpdateGoogleUser: jest.fn(),
    isEmailAllowed: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockFirebaseService = {
    verifyIdToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: FirebaseService,
          useValue: mockFirebaseService,
        },
        {
          provide: getRepositoryToken(AuthLog),
          useValue: mockAuthLogRepo,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
    firebaseService = module.get<FirebaseService>(FirebaseService);

    jest.clearAllMocks();
    mockAuthLogRepo.save.mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateOAuthLogin', () => {
    const profile = {
      id: '123',
      emails: [{ value: 'test@example.com' }],
      photos: [{ value: 'url' }],
      displayName: 'Test',
    };

    it('should return user for allowed email', async () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        full_name: 'Test',
        avatar_url: 'url',
        role: 'user',
      };
      mockUsersService.isEmailAllowed.mockResolvedValue(true);
      mockUsersService.createOrUpdateGoogleUser.mockResolvedValue(user);

      const result = await service.validateOAuthLogin(profile as any);

      expect(result).toEqual(user);
      expect(usersService.createOrUpdateGoogleUser).toHaveBeenCalledWith({
        googleId: '123',
        email: 'test@example.com',
        fullName: 'Test',
        avatarUrl: 'url',
      });
    });

    it('should add user to waitlist if not allowed and intent is waitlist', async () => {
      const waitlistUser = {
        id: '1',
        email: 'test@example.com',
        role: 'waitlist',
      };
      mockUsersService.isEmailAllowed.mockResolvedValue(false);
      mockUsersService.createOrUpdateGoogleUser.mockResolvedValue(waitlistUser);

      const result = await service.validateOAuthLogin(
        profile as any,
        'waitlist',
      );

      expect(result.isNewWaitlist).toBe(true);
      expect(usersService.createOrUpdateGoogleUser).toHaveBeenCalledWith(
        expect.any(Object),
        'waitlist',
      );
    });

    it('should return existing waitlist user if not allowed', async () => {
      const existingWaitlist = {
        id: '1',
        email: 'test@example.com',
        role: 'waitlist',
      };
      mockUsersService.isEmailAllowed.mockResolvedValue(false);
      mockUsersService.findByEmail.mockResolvedValue(existingWaitlist);

      const result = await service.validateOAuthLogin(profile as any);

      expect(result).toEqual(existingWaitlist);
    });

    it('should throw UnauthorizedException for non-allowed email', async () => {
      mockUsersService.isEmailAllowed.mockResolvedValue(false);
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.validateOAuthLogin(profile as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('loginWithFirebase', () => {
    it('should login with valid firebase token', async () => {
      const decoded = {
        email: 'test@example.com',
        uid: 'firebase-uid',
        name: 'Test User',
        picture: 'http://avatar.url',
      };
      const user = { id: '1', email: 'test@example.com' };
      mockFirebaseService.verifyIdToken.mockResolvedValue(decoded);
      mockUsersService.createOrUpdateGoogleUser.mockResolvedValue(user);

      const result = await service.loginWithFirebase('valid-token');

      expect(result).toEqual(user);
      expect(firebaseService.verifyIdToken).toHaveBeenCalledWith('valid-token');
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockFirebaseService.verifyIdToken.mockRejectedValue(
        new Error('Invalid token'),
      );

      await expect(service.loginWithFirebase('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if no email in token', async () => {
      mockFirebaseService.verifyIdToken.mockResolvedValue({ uid: '123' });

      await expect(service.loginWithFirebase('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('localDevLogin', () => {
    it('should create dev user and return token', async () => {
      const user = { id: '1', email: 'dev@test.com', full_name: 'Dev User' };
      mockUsersService.createOrUpdateGoogleUser.mockResolvedValue(user);
      mockJwtService.sign.mockReturnValue('dev-token');

      const result = await service.localDevLogin('dev@test.com');

      expect(result.access_token).toBe('dev-token');
      expect(usersService.createOrUpdateGoogleUser).toHaveBeenCalledWith({
        email: 'dev@test.com',
        googleId: 'dev-dev@test.com',
        fullName: 'Dev User',
        avatarUrl: '',
      });
    });
  });

  describe('login', () => {
    it('should return access token', async () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        full_name: 'Test User',
        avatar_url: 'http://avatar',
        role: 'user',
      };
      mockJwtService.sign.mockReturnValue('token');

      const result = await service.login(user as any);

      expect(jwtService.sign).toHaveBeenCalledWith({
        email: user.email,
        sub: user.id,
      });
      expect(result).toEqual({
        access_token: 'token',
        user: {
          id: user.id,
          email: user.email,
          name: user.full_name,
          avatar: user.avatar_url,
          role: user.role,
        },
      });
    });
  });

  describe('getAuthLogs', () => {
    it('should return auth logs with filters', async () => {
      const logs = [{ id: '1', userId: 'user1' }];
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(logs),
      };
      mockAuthLogRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getAuthLogs({
        startDate: new Date(),
        endDate: new Date(),
        userId: 'user1',
        provider: 'google',
        limit: 50,
        offset: 0,
      });

      expect(result).toEqual(logs);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });

    it('should return logs without filters', async () => {
      const logs = [{ id: '1' }];
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(logs),
      };
      mockAuthLogRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getAuthLogs({});

      expect(result).toEqual(logs);
    });
  });
});

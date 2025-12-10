import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { FirebaseService } from '../firebase/firebase.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthLog } from './entities/auth-log.entity';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;
  const mockAuthLogRepo = {
    save: jest.fn(),
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
    createOrUpdateGoogleUser: jest.fn(),
    isEmailAllowed: jest.fn().mockResolvedValue(true),
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

    jest.clearAllMocks();
    mockAuthLogRepo.save.mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateOAuthLogin', () => {
    it('should return user from UsersService', async () => {
      const profile = {
        id: '123',
        emails: [{ value: 'test@example.com' }],
        photos: [{ value: 'url' }],
        displayName: 'Test',
      };
      const user = {
        id: '1',
        email: 'test@example.com',
        full_name: 'Test',
        avatar_url: 'url',
        role: 'user',
      };
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
  });

  describe('login', () => {
    it('should returning access token', async () => {
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
});

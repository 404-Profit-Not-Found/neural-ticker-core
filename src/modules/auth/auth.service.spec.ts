import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    createOrUpdateGoogleUser: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);

    jest.clearAllMocks();
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
      const user = { id: 1, email: 'test@example.com' };
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
      const user = { id: 1, email: 'test@example.com', role: 'user' };
      mockJwtService.sign.mockReturnValue('token');

      const result = await service.login(user as any);

      expect(result).toEqual({ access_token: 'token', user });
      expect(jwtService.sign).toHaveBeenCalledWith(
        { email: user.email, sub: user.id, role: user.role },
        expect.anything(), // options (expiresIn vs default)
      );
    });
  });
});

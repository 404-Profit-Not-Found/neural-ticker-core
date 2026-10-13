import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { AllowedUser } from './entities/allowed-user.entity';
import { Repository } from 'typeorm';
import { NicknameGeneratorService } from './nickname-generator.service';
import { SecretBox } from './secret-box.service';
import { toAccountUser } from './public-user';
import { randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let secretKeys: string | undefined;

  const mockUserRepo = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      // "is this nickname taken?" — no, unless a test says otherwise
      getCount: jest.fn().mockResolvedValue(0),
    })),
  };

  const mockAllowedUserRepo = {
    count: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockNicknameGenerator = {
    generate: jest.fn().mockReturnValue('TestNickname'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: NicknameGeneratorService,
          useValue: mockNicknameGenerator,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: getRepositoryToken(AllowedUser),
          useValue: mockAllowedUserRepo,
        },
        // The real SecretBox. `secretKeys` is USER_SECRETS_KEYS: undefined
        // (the default here) = encryption at rest not configured, i.e. every
        // test above and below this line that does not set it shows the
        // behaviour is exactly what it was.
        {
          provide: SecretBox,
          useFactory: () =>
            new SecretBox({
              get: (name: string) =>
                name === 'userSecrets.keys' ? secretKeys : undefined,
            } as any),
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  /** Rebuilds the service with USER_SECRETS_KEYS set to `keys`. */
  const withSecretKeys = async (keys: string | undefined) => {
    secretKeys = keys;
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: NicknameGeneratorService, useValue: mockNicknameGenerator },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        {
          provide: getRepositoryToken(AllowedUser),
          useValue: mockAllowedUserRepo,
        },
        {
          provide: SecretBox,
          useFactory: () =>
            new SecretBox({
              get: (name: string) =>
                name === 'userSecrets.keys' ? secretKeys : undefined,
            } as any),
        },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
    return module.get(SecretBox);
  };

  afterEach(() => {
    secretKeys = undefined;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isEmailAllowed', () => {
    it('should return true for default admins', async () => {
      const result = await service.isEmailAllowed('branislavlang@gmail.com');
      expect(result).toBe(true);
      expect(mockAllowedUserRepo.count).not.toHaveBeenCalled();
    });

    it('should return true if email in allowed list', async () => {
      mockAllowedUserRepo.count.mockResolvedValue(1);
      const result = await service.isEmailAllowed('test@example.com');
      expect(result).toBe(true);
    });

    it('should return false if email not in allowed list', async () => {
      mockAllowedUserRepo.count.mockResolvedValue(0);
      const result = await service.isEmailAllowed('unknown@example.com');
      expect(result).toBe(false);
    });
  });

  describe('allowEmail', () => {
    it('should return existing allowed user if already exists', async () => {
      const existing = { email: 'test@example.com', added_by: 'admin' };
      mockAllowedUserRepo.findOne.mockResolvedValue(existing);

      const result = await service.allowEmail('test@example.com', 'admin');
      expect(result).toEqual(existing);
      expect(mockAllowedUserRepo.create).not.toHaveBeenCalled();
    });

    it('should create new allowed user if not exists', async () => {
      mockAllowedUserRepo.findOne.mockResolvedValue(null);
      const newAllowed = { email: 'new@example.com', added_by: 'admin' };
      mockAllowedUserRepo.save.mockResolvedValue(newAllowed);

      const result = await service.allowEmail('new@example.com', 'admin');
      expect(mockAllowedUserRepo.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        added_by: 'admin',
      });
      expect(mockAllowedUserRepo.save).toHaveBeenCalled();
    });
  });

  describe('deleteWaitlistUser', () => {
    it('should delete waitlist user', async () => {
      const user = { id: '1', email: 'test@example.com', role: 'waitlist' };
      mockUserRepo.findOne.mockResolvedValue(user);

      await service.deleteWaitlistUser('test@example.com');
      expect(mockUserRepo.delete).toHaveBeenCalledWith({ id: '1' });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(
        service.deleteWaitlistUser('unknown@example.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not waitlist', async () => {
      const user = { id: '1', email: 'test@example.com', role: 'user' };
      mockUserRepo.findOne.mockResolvedValue(user);
      await expect(
        service.deleteWaitlistUser('test@example.com'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('revokeEmail', () => {
    it('should revoke email access', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await service.revokeEmail('test@example.com');
      expect(mockAllowedUserRepo.delete).toHaveBeenCalledWith({
        email: 'test@example.com',
      });
    });

    it('should throw ForbiddenException if revoking own access', async () => {
      const requester = { email: 'test@example.com' } as User;
      await expect(
        service.revokeEmail('test@example.com', requester),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if target is admin', async () => {
      const admin = { id: '1', email: 'admin@example.com', role: 'admin' };
      mockUserRepo.findOne.mockResolvedValue(admin);
      await expect(service.revokeEmail('admin@example.com')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getAllowedUsers', () => {
    it('should return all allowed users', async () => {
      const users = [{ email: 'a@example.com' }, { email: 'b@example.com' }];
      mockAllowedUserRepo.find.mockResolvedValue(users);

      const result = await service.getAllowedUsers();
      expect(result).toEqual(users);
      expect(mockAllowedUserRepo.find).toHaveBeenCalledWith({
        order: { created_at: 'DESC' },
      });
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      const user = { id: '1', email: 'test@example.com' };
      mockUserRepo.findOne.mockResolvedValue(user);

      const result = await service.findByEmail('test@example.com');
      expect(result).toEqual(user);
    });
  });

  describe('findByGoogleId', () => {
    it('should return user by google id', async () => {
      const user = { id: '1', google_id: '123' };
      mockUserRepo.findOne.mockResolvedValue(user);

      const result = await service.findByGoogleId('123');
      expect(result).toEqual(user);
    });
  });

  describe('createOrUpdateGoogleUser', () => {
    const profile = {
      email: 'test@example.com',
      googleId: '123',
      fullName: 'Test User',
      avatarUrl: 'http://avatar.url',
    };

    it('should update existing user found by googleId', async () => {
      const existingUser = { id: '1', google_id: '123', nickname: 'existing' };
      mockUserRepo.findOne.mockResolvedValue(existingUser);
      mockUserRepo.save.mockResolvedValue({ ...existingUser, ...profile });

      await service.createOrUpdateGoogleUser(profile);
      expect(mockUserRepo.save).toHaveBeenCalled();
    });

    it('should generate nickname for existing user without one', async () => {
      const existingUser = { id: '1', google_id: '123', nickname: null };
      mockUserRepo.findOne.mockResolvedValue(existingUser);
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));

      await service.createOrUpdateGoogleUser(profile);
      expect(mockNicknameGenerator.generate).toHaveBeenCalled();
    });

    it('should create new user if not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      mockUserRepo.save.mockImplementation((u) =>
        Promise.resolve({ id: 'new', ...u }),
      );

      await service.createOrUpdateGoogleUser(profile);
      expect(mockUserRepo.create).toHaveBeenCalled();
      expect(mockNicknameGenerator.generate).toHaveBeenCalled();
    });

    it('should set admin role for default admin emails', async () => {
      const adminProfile = { ...profile, email: 'branislavlang@gmail.com' };
      mockUserRepo.findOne.mockResolvedValue(null);
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));

      await service.createOrUpdateGoogleUser(adminProfile);
      expect(mockUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' }),
      );
    });
  });

  describe('updateProfile', () => {
    // Query behind the "is this nickname taken by someone else" check.
    const mockNicknameLookup = (taken: number) => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(taken),
      };
      mockUserRepo.createQueryBuilder.mockReturnValue(qb as any);
      return qb;
    };

    beforeEach(() => {
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));
    });

    it('should update user profile', async () => {
      const user = { id: '1', nickname: 'old' };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockNicknameLookup(0);

      const result = await service.updateProfile('1', { nickname: 'new' });
      expect(result.nickname).toBe('new');
    });

    it('trims a new nickname and checks it against OTHER accounts, ignoring case', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: '1', nickname: 'old' });
      const qb = mockNicknameLookup(0);

      const result = await service.updateProfile('1', {
        nickname: '  Super.Trader_7  ',
      });

      expect(result.nickname).toBe('Super.Trader_7');
      expect(qb.where).toHaveBeenCalledWith(
        'LOWER(user.nickname) = LOWER(:nickname)',
        { nickname: 'Super.Trader_7' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('user.id != :userId', {
        userId: '1',
      });
    });

    it('answers 409 when another account already uses the nickname', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: '1', nickname: 'old' });
      mockNicknameLookup(1);

      const error = await service
        .updateProfile('1', { nickname: 'funnypanda123' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getStatus()).toBe(409);
      expect(error.message).toBe('This nickname is already taken.');
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });

    it.each([
      ['too short', 'ab'],
      ['too long', 'a'.repeat(25)],
      ['whitespace inside', 'Super Trader'],
      ['leading punctuation', '_trader'],
      ['trailing punctuation', 'trader.'],
      ['a look-alike (non-ASCII) letter', 'Аdmin2000x'], // Cyrillic "А"
      ['markup', '<b>bold</b>'],
      ['an @', 'me@example'],
      ['reserved: admin', 'Admin'],
      ['reserved: admin with digits', 'admin_2024'],
      ['reserved: support', 'Sup.port'],
      ['reserved: the brand', 'NeuralTicker-Team'],
      ['reserved: moderator', 'MODERATOR'],
      ['reserved: the "no author" label', 'Anonymous'],
      ['reserved: a generated fallback handle', 'Trader-3f9a1c'],
    ])(
      'rejects a nickname with %s (400) and saves nothing',
      async (_l, nickname) => {
        mockUserRepo.findOne.mockResolvedValue({ id: '1', nickname: 'old' });
        const qb = mockNicknameLookup(0);

        const error = await service
          .updateProfile('1', { nickname })
          .catch((e) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect(qb.getCount).not.toHaveBeenCalled();
        expect(mockUserRepo.save).not.toHaveBeenCalled();
      },
    );

    it('keeps a legacy nickname that breaks the rules working until it is changed', async () => {
      // Both clients resend the current nickname with every theme save.
      const legacy = 'Old School Name!! (2019)';
      mockUserRepo.findOne.mockResolvedValue({
        id: '1',
        nickname: legacy,
        theme: 'dark',
      });
      const qb = mockNicknameLookup(1); // even a duplicate is left alone

      const result = await service.updateProfile('1', {
        nickname: legacy,
        theme: 'light',
      });

      expect(result.nickname).toBe(legacy);
      expect(result.theme).toBe('light');
      expect(qb.getCount).not.toHaveBeenCalled();
    });

    it('lets a user change only the case of their own nickname', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: '1', nickname: 'panda7' });
      const qb = mockNicknameLookup(0);

      const result = await service.updateProfile('1', { nickname: 'Panda7' });

      expect(result.nickname).toBe('Panda7');
      // Their own row is excluded from the lookup.
      expect(qb.andWhere).toHaveBeenCalledWith('user.id != :userId', {
        userId: '1',
      });
    });

    it.each(['', '   '])(
      'ignores an empty nickname (%p) — an account without one can still save its theme',
      async (nickname) => {
        mockUserRepo.findOne.mockResolvedValue({ id: '1', nickname: null });
        const qb = mockNicknameLookup(0);

        const result = await service.updateProfile('1', {
          nickname,
          theme: 'light',
        });

        expect(result.nickname).toBeNull();
        expect(result.theme).toBe('light');
        expect(qb.getCount).not.toHaveBeenCalled();
      },
    );

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(service.updateProfile('999', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateRole', () => {
    it('should update user role', async () => {
      const user = { id: '1', role: 'user' };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));

      const result = await service.updateRole('1', 'admin');
      expect(result.role).toBe('admin');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(service.updateRole('999', 'admin')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updatePreferences', () => {
    it('should update preferences JSON', async () => {
      const user = { id: '1', preferences: { theme: 'light' } };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));

      const result = await service.updatePreferences('1', {
        displayCurrency: 'EUR',
      });
      expect(result.preferences).toEqual({
        theme: 'light',
        displayCurrency: 'EUR',
      });
    });

    it('ignores non-whitelisted keys (mass-assignment guard)', async () => {
      const user = { id: '1', preferences: {} };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));

      const result = await service.updatePreferences('1', {
        role: 'admin',
        credits_balance: 9999,
        displayCurrency: 'USD',
      });
      expect(result.preferences).toEqual({ displayCurrency: 'USD' });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(service.updatePreferences('999', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('approveUser', () => {
    it('should approve waitlist user', async () => {
      const user = { id: '1', email: 'test@example.com', role: 'waitlist' };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));
      mockAllowedUserRepo.findOne.mockResolvedValue(null);
      mockAllowedUserRepo.save.mockResolvedValue({});

      const result = await service.approveUser('1');
      expect(result.role).toBe('user');
      expect(mockAllowedUserRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(service.approveUser('999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUnifiedIdentities', () => {
    it('should return unified identity list', async () => {
      mockUserRepo.find.mockResolvedValue([
        {
          id: '1',
          email: 'user@example.com',
          role: 'user',
          created_at: new Date(),
        },
      ]);
      mockAllowedUserRepo.find.mockResolvedValue([
        { email: 'invited@example.com', created_at: new Date() },
      ]);

      const result = await service.getUnifiedIdentities();
      expect(result.length).toBe(2);
    });
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      const users = [{ id: '1' }, { id: '2' }];
      mockUserRepo.find.mockResolvedValue(users);

      const result = await service.findAll();
      expect(result).toEqual(users);
    });
  });

  describe('searchUsers', () => {
    const mockSearch = (rows: any[] = []) => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      mockUserRepo.createQueryBuilder.mockReturnValue(qb as any);
      return qb;
    };

    it('matches on the nickname prefix ONLY — never on the email (enumeration oracle)', async () => {
      const qb = mockSearch();

      await service.searchUsers('alice.pri');

      const clauses = [...qb.where.mock.calls, ...qb.andWhere.mock.calls].map(
        ([sql]) => String(sql),
      );
      expect(clauses.some((sql) => sql.toLowerCase().includes('email'))).toBe(
        false,
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        "user.nickname ILIKE :q ESCAPE '\\'",
        { q: 'alice.pri%' },
      );
      expect(qb.select).toHaveBeenCalledWith([
        'user.id',
        'user.nickname',
        'user.avatar_url',
        'user.tier',
      ]);
    });

    it('escapes LIKE wildcards and caps the query length', async () => {
      const qb = mockSearch();

      await service.searchUsers('a%_b');
      expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), {
        q: 'a\\%\\_b%',
      });

      await service.searchUsers('x'.repeat(500));
      const { q } = qb.andWhere.mock.calls.pop()[1];
      expect(q).toHaveLength(51); // 50 chars + the trailing %
    });

    it('returns nothing for an empty or non-string query without querying', async () => {
      mockUserRepo.createQueryBuilder.mockClear();

      expect(await service.searchUsers('')).toEqual([]);
      expect(await service.searchUsers(['a', 'b'] as any)).toEqual([]);
      expect(mockUserRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // Every method whose result a controller returns to the account's owner or
  // to an admin. The row is a real entity instance, as TypeORM hydrates it.
  describe('account views never carry secret preference values', () => {
    const makeUser = (): User =>
      Object.assign(new User(), {
        id: '3f9a1c2e-0000-4000-8000-000000000001',
        email: 'alice.private@example.com',
        google_id: 'google-sub-1234567890',
        full_name: 'Alice Private',
        role: 'waitlist',
        tier: 'free',
        credits_balance: 4242,
        nickname: 'FunnyPanda123',
        preferences: { gemini_api_key: 'SECRET', language: 'sk' },
      });

    const expectAccountView = (result: unknown) => {
      const json = JSON.stringify(result);
      expect(json).not.toContain('SECRET');
      // Still the account, not the public projection: the owner/admin UI
      // reads these.
      const parsed = JSON.parse(json);
      const row = Array.isArray(parsed) ? parsed[0] : parsed;
      expect(row.email).toBe('alice.private@example.com');
      expect(row.credits_balance).toBe(4242);
      expect(row.preferences.gemini_api_key).toBeUndefined();
      expect(row.preferences.gemini_api_key_set).toBe(true);
      expect(row.preferences.language).toBe('sk');
    };

    beforeEach(() => {
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      mockUserRepo.find.mockResolvedValue([makeUser()]);
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));
      mockAllowedUserRepo.findOne.mockResolvedValue({});
    });

    it('getProfile', async () => {
      expectAccountView(await service.getProfile('1'));
    });

    it('getProfile returns null for an unknown user', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      expect(await service.getProfile('999')).toBeNull();
    });

    it('findAll (admin listing)', async () => {
      expectAccountView(await service.findAll());
    });

    it('updateProfile', async () => {
      expectAccountView(await service.updateProfile('1', { theme: 'g10' }));
    });

    it('updatePreferences — not even the key that was just submitted', async () => {
      const result = await service.updatePreferences('1', {
        gemini_api_key: 'SECRET-NEW',
        language: 'sk',
      });

      expectAccountView(result);
      expect(JSON.stringify(result)).not.toContain('SECRET-NEW');
      // ...while the stored row keeps the real value for the pipeline.
      expect(mockUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: { gemini_api_key: 'SECRET-NEW', language: 'sk' },
        }),
      );
    });

    it('updateRole (admin)', async () => {
      expectAccountView(await service.updateRole('1', 'admin'));
    });

    it('updateTier (admin)', async () => {
      expectAccountView(await service.updateTier('1', 'pro'));
    });

    it('approveUser (admin)', async () => {
      expectAccountView(await service.approveUser('1'));
    });

    it('findById still hands the SERVER the full row', async () => {
      const user = await service.findById('1');

      expect(user?.preferences.gemini_api_key).toBe('SECRET');
    });
  });

  describe('findPublicByIds', () => {
    it('loads the public columns only and returns public views', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          Object.assign(new User(), {
            id: 'u1',
            nickname: 'FunnyPanda123',
            avatar_url: null,
            tier: 'pro',
            // Defense in depth: even if the row came back fully loaded...
            email: 'alice.private@example.com',
            preferences: { gemini_api_key: 'SECRET' },
          }),
        ]),
      };
      mockUserRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.findPublicByIds([
        '3f9a1c2e-0000-4000-8000-000000000001',
      ]);

      expect(qb.select).toHaveBeenCalledWith([
        'user.id',
        'user.nickname',
        'user.avatar_url',
        'user.tier',
      ]);
      expect(result).toEqual([
        { id: 'u1', nickname: 'FunnyPanda123', avatar_url: null, tier: 'pro' },
      ]);
      expect(JSON.stringify(result)).not.toContain('SECRET');
      expect(JSON.stringify(result)).not.toContain('alice.private');
    });

    it('does not query for an empty id list', async () => {
      mockUserRepo.createQueryBuilder.mockClear();

      expect(await service.findPublicByIds([])).toEqual([]);
      expect(mockUserRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('drops ids that are not UUIDs instead of sending them to Postgres', async () => {
      // `<@...>` mention tokens are user-written: 36 chars of [a-f0-9-] pass
      // the token regex without being a UUID, and a non-UUID bound to a uuid
      // column fails the whole query (a 500 on the public comment feed).
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockUserRepo.createQueryBuilder.mockReturnValue(qb as any);
      const valid = '3f9a1c2e-0000-4000-8000-000000000001';

      await service.findPublicByIds([
        '------------------------------------',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        valid,
      ]);

      expect(qb.where).toHaveBeenCalledWith('user.id IN (:...ids)', {
        ids: [valid],
      });

      mockUserRepo.createQueryBuilder.mockClear();
      expect(await service.findPublicByIds(['not-a-uuid'])).toEqual([]);
      expect(mockUserRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
  // Nicknames are unique case-insensitively, and the database enforces it
  // (unique index on LOWER(nickname)). A GENERATED nickname must therefore
  // never be the reason a sign-up or login fails. On PostgreSQL:
  // test/db/users.db-spec.ts.
  describe('generated nicknames and the unique index', () => {
    const profile = {
      email: 'new@example.test',
      googleId: 'g-1',
      fullName: 'New User',
      avatarUrl: 'a',
    };
    const nicknameConflict = () =>
      Object.assign(new Error('duplicate key value'), {
        code: '23505',
        constraint: 'uq_users_nickname_lower',
      });
    /** createQueryBuilder: the email lookup finds nobody; nickname checks answer `taken` in turn. */
    const lookups = (...taken: boolean[]) => {
      const answers = [...taken];
      mockUserRepo.createQueryBuilder.mockImplementation(
        () =>
          ({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(null),
            getCount: jest
              .fn()
              .mockImplementation(() =>
                Promise.resolve(answers.shift() ? 1 : 0),
              ),
          }) as any,
      );
    };
    beforeEach(() => {
      mockUserRepo.findOne.mockResolvedValue(null);
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));
      mockNicknameGenerator.generate
        .mockReset()
        .mockReturnValueOnce('TakenOne1')
        .mockReturnValueOnce('TakenTwo2')
        .mockReturnValue('FreeName3');
    });
    afterEach(() => {
      mockNicknameGenerator.generate
        .mockReset()
        .mockReturnValue('TestNickname');
    });

    it('a new account gets a generated nickname nobody has yet', async () => {
      lookups(true, true, false);

      const user = await service.createOrUpdateGoogleUser(profile);

      expect(user.nickname).toBe('FreeName3');
      expect(mockNicknameGenerator.generate).toHaveBeenCalledTimes(3);
    });

    it('after five taken picks it stops looking and adds a random suffix', async () => {
      lookups(true, true, true, true, true);

      const user = await service.createOrUpdateGoogleUser(profile);

      expect(user.nickname).toMatch(/^FreeName3[0-9a-f]{6}$/);
    });

    it('losing the race for a nickname (unique violation on insert) retries with a suffixed one — the sign-up succeeds', async () => {
      lookups(false);
      mockUserRepo.save
        .mockRejectedValueOnce(nicknameConflict())
        .mockImplementation((u) => Promise.resolve(u));

      const user = await service.createOrUpdateGoogleUser(profile);

      expect(mockUserRepo.save).toHaveBeenCalledTimes(2);
      expect(user.nickname).toMatch(/^[A-Za-z0-9]+[0-9a-f]{6}$/);
      expect(user.email).toBe('new@example.test');
    });

    it('a duplicate EMAIL on insert is still handled as before (the race winner is used)', async () => {
      const winner = { id: 'w', email: 'new@example.test' };
      mockUserRepo.createQueryBuilder.mockImplementation(
        () =>
          ({
            where: jest.fn().mockReturnThis(),
            getCount: jest.fn().mockResolvedValue(0),
            getOne: jest
              .fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValue(winner),
          }) as any,
      );
      const lookup = {
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getOne: jest.fn(),
      };
      lookup.getOne.mockResolvedValueOnce(null).mockResolvedValue(winner);
      mockUserRepo.createQueryBuilder.mockReturnValue(lookup as any);
      mockUserRepo.save
        .mockRejectedValueOnce(
          Object.assign(new Error('duplicate key value'), {
            code: '23505',
            constraint: 'UQ_97672ac88f789774dd47f7c8be3',
          }),
        )
        .mockImplementation((u) => Promise.resolve(u));

      const user = await service.createOrUpdateGoogleUser(profile);

      expect(user).toMatchObject({ id: 'w', google_id: 'g-1' });
    });

    it('an existing account without a nickname gets an available one at login', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: '1',
        email: 'old@example.test',
        nickname: null,
        role: 'user',
        tier: 'free',
      });
      lookups(true, false);

      const user = await service.createOrUpdateGoogleUser(profile);

      expect(user.nickname).toBe('TakenTwo2');
    });

    it('changing to a nickname that someone takes in the same instant is a 409, not a 500', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: '1', nickname: 'Before' });
      lookups(false);
      mockUserRepo.save.mockRejectedValue(nicknameConflict());

      await expect(
        service.updateProfile('1', { nickname: 'Wanted' }),
      ).rejects.toThrow(ConflictException);
    });

    it('any other save failure on a profile update is not turned into a 409', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: '1', nickname: 'Before' });
      lookups(false);
      const failure = new Error('connection lost');
      mockUserRepo.save.mockRejectedValue(failure);

      await expect(
        service.updateProfile('1', { nickname: 'Wanted' }),
      ).rejects.toBe(failure);
    });
  });

  // A user's personal Gemini API key at rest. On PostgreSQL (the backfill's
  // SQL, two instances at once, rotation): test/db/user-secrets.db-spec.ts.
  describe('personal API key at rest', () => {
    const K1 = randomBytes(32).toString('base64');
    const K2 = randomBytes(32).toString('base64');
    const KEY = 'AIza-not-a-real-key-0123456789';
    const ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const OTHER = 'b1ffcd00-1d2c-4f09-8c7e-7cc0ce491b22';

    const stored = (row: Record<string, any>) => {
      mockUserRepo.findOne.mockResolvedValue({ id: ID, ...row });
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));
    };
    const saved = (): any => mockUserRepo.save.mock.calls[0][0];
    let warn: jest.SpyInstance;
    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      jest.spyOn(Logger.prototype, 'log').mockImplementation();
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      (mockUserRepo as any).query = jest.fn().mockResolvedValue([]);
    });
    afterEach(() => jest.restoreAllMocks());
    const logged = () =>
      [
        ...warn.mock.calls,
        ...(Logger.prototype.log as jest.Mock).mock.calls,
        ...(Logger.prototype.error as jest.Mock).mock.calls,
      ]
        .flat()
        .map(String)
        .join('\n');

    describe('USER_SECRETS_KEYS not set — exactly as before', () => {
      it('a saved key stays in preferences in clear text; the encrypted column stays empty', async () => {
        stored({ preferences: { language: 'en' } });

        const view = await service.updatePreferences(ID, {
          gemini_api_key: KEY,
        });

        expect(saved().preferences).toEqual({
          language: 'en',
          gemini_api_key: KEY,
        });
        expect(saved().gemini_api_key_enc).toBeNull();
        expect(view.preferences).toEqual({
          language: 'en',
          gemini_api_key_set: true,
        });
      });

      it('the key is read from preferences', async () => {
        stored({ preferences: { gemini_api_key: KEY } });
        await expect(service.getUserLlmKey(ID)).resolves.toBe(KEY);
      });

      it('says so ONCE when the application starts, touches no data, and does not stop the start', async () => {
        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('USER_SECRETS_KEYS is not set');
        expect(warn.mock.calls[0][0]).toContain('UNENCRYPTED');
        expect((mockUserRepo as any).query).not.toHaveBeenCalled();
      });

      it('an encrypted key left from when keys WERE configured cannot be read: "no personal key", a warning with the user id only', async () => {
        const token = (await withSecretKeys(`k1:${K1}`)).encrypt(KEY, ID);
        await withSecretKeys(undefined);
        stored({ preferences: {}, gemini_api_key_enc: token });

        await expect(service.getUserLlmKey(ID)).resolves.toBeNull();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain(ID);
        expect(logged()).not.toContain(token);
      });

      it('…and saving a key then drops that stale ciphertext, so it cannot come back later', async () => {
        const token = (await withSecretKeys(`k1:${K1}`)).encrypt('OLD', ID);
        await withSecretKeys(undefined);
        stored({ preferences: {}, gemini_api_key_enc: token });

        await service.updatePreferences(ID, { gemini_api_key: KEY });

        expect(saved().gemini_api_key_enc).toBeNull();
        expect(saved().preferences.gemini_api_key).toBe(KEY);
      });
    });

    describe('USER_SECRETS_KEYS set', () => {
      let box: SecretBox;
      beforeEach(async () => {
        box = await withSecretKeys(`k1:${K1}`);
      });

      it('a saved key is stored as ciphertext bound to the user, and the clear text leaves preferences', async () => {
        stored({
          preferences: { language: 'en', gemini_api_key: 'OLD-PLAINTEXT' },
        });

        await service.updatePreferences(ID, { gemini_api_key: KEY });

        const row = saved();
        expect(row.preferences).toEqual({ language: 'en' });
        expect(row.gemini_api_key_enc).toMatch(/^v1:k1:[^:]+:[^:]+:[^:]+$/);
        expect(JSON.stringify(row)).not.toContain(KEY);
        expect(JSON.stringify(row)).not.toContain('OLD-PLAINTEXT');
        expect(box.decrypt(row.gemini_api_key_enc, ID)).toBe(KEY);
        expect(() => box.decrypt(row.gemini_api_key_enc, OTHER)).toThrow();
      });

      it('the response says the key is set and contains neither the key nor the ciphertext', async () => {
        stored({ preferences: { language: 'en' } });

        const view = await service.updatePreferences(ID, {
          gemini_api_key: KEY,
        });

        expect(view.preferences).toEqual({
          language: 'en',
          gemini_api_key_set: true,
        });
        expect(view).not.toHaveProperty('gemini_api_key_enc');
        const json = JSON.stringify(view);
        expect(json).not.toContain(KEY);
        expect(json).not.toContain('v1:k1:');
      });

      it.each([
        ['an empty string', ''],
        ['null', null],
      ])(
        'saving %s removes the key from both places',
        async (_label, value) => {
          stored({
            preferences: { language: 'en', gemini_api_key: 'OLD' },
            gemini_api_key_enc: box.encrypt('OLD', ID),
          });

          const view = await service.updatePreferences(ID, {
            gemini_api_key: value,
          });

          expect(saved().gemini_api_key_enc).toBeNull();
          expect(saved().preferences).toEqual({ language: 'en' });
          expect(view.preferences).toEqual({ language: 'en' });
        },
      );

      it('saving other preferences leaves the stored key alone', async () => {
        const token = box.encrypt(KEY, ID);
        stored({ preferences: {}, gemini_api_key_enc: token });

        const view = await service.updatePreferences(ID, { language: 'sk' });

        expect(saved().gemini_api_key_enc).toBe(token);
        expect(view.preferences).toEqual({
          language: 'sk',
          gemini_api_key_set: true,
        });
      });

      it.each([
        ['a number', 12345],
        ['an object', { key: KEY }],
        ['an array', [KEY]],
        ['more than 512 characters', 'k'.repeat(513)],
      ])(
        'rejects %s as a key (400) and stores nothing',
        async (_label, value) => {
          stored({ preferences: {} });

          await expect(
            service.updatePreferences(ID, { gemini_api_key: value }),
          ).rejects.toThrow(BadRequestException);
          expect(mockUserRepo.save).not.toHaveBeenCalled();
        },
      );

      describe('getUserLlmKey — the one reader', () => {
        it('reads only what it needs', async () => {
          stored({ preferences: {} });
          await service.getUserLlmKey(ID);
          expect(mockUserRepo.findOne).toHaveBeenCalledWith({
            where: { id: ID },
            select: ['id', 'preferences', 'gemini_api_key_enc'],
          });
        });

        it('prefers the encrypted column', async () => {
          stored({
            preferences: { gemini_api_key: 'STALE-PLAINTEXT' },
            gemini_api_key_enc: box.encrypt(KEY, ID),
          });
          await expect(service.getUserLlmKey(ID)).resolves.toBe(KEY);
        });

        it('falls back to the clear text while a row has not been moved yet', async () => {
          stored({
            preferences: { gemini_api_key: KEY },
            gemini_api_key_enc: null,
          });
          await expect(service.getUserLlmKey(ID)).resolves.toBe(KEY);
        });

        it.each([
          ['no key at all', { preferences: { language: 'en' } }],
          [
            'an empty clear-text value',
            { preferences: { gemini_api_key: '' } },
          ],
          ['no preferences', { preferences: null }],
        ])('%s → null', async (_label, row) => {
          stored(row);
          await expect(service.getUserLlmKey(ID)).resolves.toBeNull();
          expect(warn).not.toHaveBeenCalled();
        });

        it('an unknown user → null', async () => {
          mockUserRepo.findOne.mockResolvedValue(null);
          await expect(service.getUserLlmKey('ghost')).resolves.toBeNull();
        });

        it.each([
          [
            'encrypted with a key that is no longer configured (lost key)',
            () =>
              new SecretBox({ get: () => `gone:${K2}` } as any).encrypt(
                KEY,
                ID,
              ),
          ],
          ['copied from another user', () => box.encrypt(KEY, OTHER)],
          [
            'tampered with',
            () =>
              box
                .encrypt(KEY, ID)
                .replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')),
          ],
          ['not in the stored format at all', () => 'garbage'],
        ])(
          'a value %s → "no personal key": null, never an exception, a warning naming the user id only',
          async (_label, token) => {
            const value = token();
            stored({
              preferences: { gemini_api_key: 'PLAINTEXT-MUST-NOT-BE-USED' },
              gemini_api_key_enc: value,
            });

            await expect(service.getUserLlmKey(ID)).resolves.toBeNull();

            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toBe(
              `Personal API key of user ${ID} could not be decrypted; using the system key.`,
            );
            expect(logged()).not.toContain(value);
            expect(logged()).not.toContain(KEY);
          },
        );

        it('a database error does not reach the caller either', async () => {
          mockUserRepo.findOne.mockRejectedValue(
            Object.assign(new Error(`connection lost near ${KEY}`), {
              name: 'QueryFailedError',
            }),
          );

          await expect(service.getUserLlmKey(ID)).resolves.toBeNull();
          expect(logged()).not.toContain(KEY);
        });
      });

      describe('account views', () => {
        it('never carry the ciphertext; "set" is reported for an encrypted key', () => {
          const token = box.encrypt(KEY, ID);
          const user = Object.assign(new User(), {
            id: ID,
            email: 'a@example.test',
            preferences: { language: 'en' },
            gemini_api_key_enc: token,
          });

          const account = toAccountUser(user);

          expect(account.preferences).toEqual({
            language: 'en',
            gemini_api_key_set: true,
          });
          expect(JSON.stringify(account)).not.toContain(token);
          expect(account).not.toHaveProperty('gemini_api_key_enc');
          // The public view (what JSON.stringify(user) gives) has neither.
          expect(JSON.stringify(user)).not.toContain(token);
          expect(JSON.stringify(user)).not.toContain('gemini');
          // …and the row itself was not modified.
          expect(user.gemini_api_key_enc).toBe(token);
        });

        it('no key → no "set" flag', () => {
          const account = toAccountUser(
            Object.assign(new User(), {
              id: ID,
              preferences: { language: 'en' },
              gemini_api_key_enc: null,
            }),
          );
          expect(account.preferences).toEqual({ language: 'en' });
        });
      });

      describe('backfill at start', () => {
        const query = () => (mockUserRepo as any).query as jest.Mock;

        it('moves each clear-text key into the column, conditionally on the value it read; logs counts only', async () => {
          query()
            .mockResolvedValueOnce([
              { id: ID, kind: 'string', value: KEY },
              { id: OTHER, kind: 'string', value: '' },
            ])
            .mockResolvedValueOnce([[{ id: ID }], 1]) // UPDATE … RETURNING
            .mockResolvedValueOnce([[{ id: OTHER }], 1])
            .mockResolvedValue([]);

          await service.onApplicationBootstrap();

          const [sql, params] = query().mock.calls[1];
          expect(sql).toContain("preferences = preferences - 'gemini_api_key'");
          expect(sql).toContain(
            "WHERE id = $2 AND preferences ->> 'gemini_api_key' = $3",
          );
          expect(params[1]).toBe(ID);
          expect(params[2]).toBe(KEY);
          expect(box.decrypt(params[0], ID)).toBe(KEY);

          const output = logged();
          expect(output).toContain('1 encrypted now');
          expect(output).toContain('1 empty value(s) removed');
          expect(output).not.toContain(KEY);
          expect(output).not.toContain(params[0]);
          expect(output).not.toContain('AIza');
          expect(warn).not.toHaveBeenCalled();
        });

        it('a row someone else changed in the meantime is skipped, not overwritten', async () => {
          query()
            .mockResolvedValueOnce([{ id: ID, kind: 'string', value: KEY }])
            .mockResolvedValueOnce([[], 0])
            .mockResolvedValue([]);

          await expect(service.backfillLlmKeys()).resolves.toEqual({
            encrypted: 0,
            cleared: 0,
            skipped: 1,
          });
        });

        it('a value that is not a string is left alone', async () => {
          query()
            .mockResolvedValueOnce([
              { id: ID, kind: 'object', value: '{"a":1}' },
            ])
            .mockResolvedValue([]);

          await expect(service.backfillLlmKeys()).resolves.toEqual({
            encrypted: 0,
            cleared: 0,
            skipped: 1,
          });
          expect(query()).toHaveBeenCalledTimes(2); // two SELECTs, no UPDATE
        });

        it('pages by id until nothing is left', async () => {
          const id = (n: number) =>
            `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
          query().mockImplementation((sql: string, params: any[]) => {
            if (!sql.includes('jsonb_exists'))
              return Promise.resolve([[{ id: 'x' }], 1]);
            const after = params[0];
            const page =
              after < id(1) ? [id(1), id(2)] : after < id(3) ? [id(3)] : [];
            return Promise.resolve(
              page.map((i) => ({ id: i, kind: 'string', value: KEY })),
            );
          });

          await expect(service.backfillLlmKeys(2)).resolves.toEqual({
            encrypted: 3,
            cleared: 0,
            skipped: 0,
          });
          const selects = query().mock.calls.filter(([sql]) =>
            sql.includes('jsonb_exists'),
          );
          expect(selects.map(([, p]) => p[1])).toEqual([2, 2, 2]);
        });

        it('a failure is logged without the detail leaking a key, and the application still starts', async () => {
          query().mockRejectedValue(new Error('db down'));

          await expect(
            service.onApplicationBootstrap(),
          ).resolves.toBeUndefined();

          expect(logged()).toContain(
            'Encrypting stored personal API keys failed',
          );
        });
      });

      describe('key rotation at start', () => {
        it('re-encrypts values under an older key with the active one; leaves what it cannot decrypt untouched', async () => {
          const rotated = await withSecretKeys(`k2:${K2},k1:${K1}`);
          const underOld = box.encrypt(KEY, ID);
          const underLost = new SecretBox({
            get: () => `gone:${K2}`,
          } as any).encrypt(KEY, OTHER);
          const query = (mockUserRepo as any).query as jest.Mock;
          query.mockImplementation((sql: string, params: any[]) => {
            if (sql.includes('starts_with')) {
              return Promise.resolve(
                params[1] < ID
                  ? [
                      { id: ID, token: underOld },
                      { id: OTHER, token: underLost },
                    ]
                  : [],
              );
            }
            return Promise.resolve([[{ id: ID }], 1]);
          });

          await expect(service.reencryptLlmKeys()).resolves.toEqual({
            reencrypted: 1,
            undecryptable: 1,
          });

          expect(query.mock.calls[0][1][0]).toBe('v1:k2:');
          const updates = query.mock.calls.filter(([sql]) =>
            sql.startsWith('UPDATE'),
          );
          expect(updates).toHaveLength(1);
          const [sql, params] = updates[0];
          expect(sql).toContain('WHERE id = $2 AND gemini_api_key_enc = $3');
          expect(params[0].startsWith('v1:k2:')).toBe(true);
          expect(rotated.decrypt(params[0], ID)).toBe(KEY);
          expect(params.slice(1)).toEqual([ID, underOld]);
        });
      });
    });
  });
});

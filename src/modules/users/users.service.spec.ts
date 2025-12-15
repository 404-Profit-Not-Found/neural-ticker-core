import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { AllowedUser } from './entities/allowed-user.entity';
import { Repository } from 'typeorm';
import { NicknameGeneratorService } from './nickname-generator.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;

  const mockUserRepo = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
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
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
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
    it('should update user profile', async () => {
      const user = { id: '1', nickname: 'old' };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));

      const result = await service.updateProfile('1', { nickname: 'new' });
      expect(result.nickname).toBe('new');
    });

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

      const result = await service.updatePreferences('1', { language: 'en' });
      expect(result.preferences).toEqual({ theme: 'light', language: 'en' });
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
});

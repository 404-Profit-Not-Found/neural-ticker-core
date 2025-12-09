import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';

describe('UsersService', () => {
  let service: UsersService;
  let repo: Repository<User>;

  const mockRepo = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockResolvedValue({ id: 1, ...{} }),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get<Repository<User>>(getRepositoryToken(User));

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createOrUpdateGoogleUser', () => {
    it('should update existing user', async () => {
      const profile = {
        email: 'test@example.com',
        googleId: '123',
        fullName: 'Test',
        avatarUrl: 'url',
      };
      const existingUser = {
        id: '1',
        email: 'test@example.com',
        google_id: '123',
      };

      mockRepo.findOne.mockResolvedValue(existingUser);
      mockRepo.save.mockResolvedValue(existingUser);

      const result = await service.createOrUpdateGoogleUser(profile);

      expect(result).toEqual(existingUser);
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should create new user if not found', async () => {
      const profile = {
        email: 'new@example.com',
        googleId: '456',
        fullName: 'New',
        avatarUrl: 'url',
      };
      mockRepo.findOne.mockResolvedValue(null);
      const newUser = { id: '2', ...profile };
      mockRepo.save.mockResolvedValue(newUser);

      const result = await service.createOrUpdateGoogleUser(profile);

      expect(mockRepo.create).toHaveBeenCalled();
      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  describe('updatePreferences', () => {
    it('should update preferences JSON', async () => {
      const user = { id: '1', email: 'test@example.com', preferences: {} };
      const newPrefs = { theme: 'dark' };

      mockRepo.findOne.mockResolvedValue(user);
      mockRepo.save.mockResolvedValue({ ...user, preferences: newPrefs });

      const result = await service.updatePreferences('1', newPrefs);

      expect(result.preferences).toEqual(newPrefs);
    });

    it('should throw NotFoundException if user missing', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.updatePreferences('999', {})).rejects.toThrow();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let repo: any;

  const mockRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const user = { email: 'test@example.com' };
      repo.findOne.mockResolvedValue(user);

      const result = await service.findByEmail('test@example.com');
      expect(result).toBe(user);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });
  });

  describe('findByGoogleId', () => {
    it('should find user by googleId', async () => {
      const user = { google_id: '123' };
      repo.findOne.mockResolvedValue(user);

      const result = await service.findByGoogleId('123');
      expect(result).toBe(user);
    });
  });

  describe('findById', () => {
    it('should find user by id', async () => {
      const user = { id: 'uuid' };
      repo.findOne.mockResolvedValue(user);

      const result = await service.findById('uuid');
      expect(result).toBe(user);
    });
  });

  describe('createOrUpdateGoogleUser', () => {
    const profile = {
      email: 'new@example.com',
      googleId: '123',
      fullName: 'New User',
      avatarUrl: 'pic.jpg',
    };

    it('should update existing user by googleId', async () => {
      const existingUser = {
        id: '1',
        google_id: '123',
        email: 'old@example.com',
      };
      repo.findOne.mockResolvedValueOnce(existingUser); // findByGoogleId
      repo.save.mockImplementation((u: any) => u);

      const result = await service.createOrUpdateGoogleUser(profile);
      expect(result.full_name).toBe(profile.fullName);
      expect(repo.save).toHaveBeenCalled();
    });

    it('should link existing user by email if googleId not found', async () => {
      repo.findOne.mockResolvedValueOnce(null); // findByGoogleId
      const emailUser = { id: '2', email: 'new@example.com' };
      repo.findOne.mockResolvedValueOnce(emailUser); // findByEmail
      repo.save.mockImplementation((u: any) => u);

      const result = await service.createOrUpdateGoogleUser(profile);
      expect(result.google_id).toBe(profile.googleId); // Linked
      expect(repo.save).toHaveBeenCalled();
    });

    it('should create new user if not found', async () => {
      repo.findOne.mockResolvedValue(null); // both lookups null
      repo.create.mockReturnValue({ ...profile });
      repo.save.mockImplementation((u: any) => u);

      const result = await service.createOrUpdateGoogleUser(profile);
      expect(result.email).toBe(profile.email);
      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });
  });
});

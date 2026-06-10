import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuotaService } from './quota.service';
import { User } from '../../modules/users/entities/user.entity';

describe('QuotaService', () => {
  let service: QuotaService;
  const mockUserRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();
    service = module.get<QuotaService>(QuotaService);
    jest.clearAllMocks();
  });

  it('allows a free user under the cap', async () => {
    mockUserRepo.findOne.mockResolvedValue({ tier: 'free', role: 'user' });
    await expect(
      service.assertWithinLimit('u1', 'watchlists', 4),
    ).resolves.toBeUndefined();
  });

  it('blocks a free user at the cap', async () => {
    mockUserRepo.findOne.mockResolvedValue({ tier: 'free', role: 'user' });
    await expect(
      service.assertWithinLimit('u1', 'watchlists', 5),
    ).rejects.toThrow(ForbiddenException);
  });

  it('gives pro users the higher cap', async () => {
    mockUserRepo.findOne.mockResolvedValue({ tier: 'pro', role: 'user' });
    await expect(
      service.assertWithinLimit('u1', 'watchlists', 24),
    ).resolves.toBeUndefined();
    await expect(
      service.assertWithinLimit('u1', 'watchlists', 25),
    ).rejects.toThrow(ForbiddenException);
  });

  it('treats whale tier like pro', async () => {
    mockUserRepo.findOne.mockResolvedValue({ tier: 'whale', role: 'user' });
    await expect(
      service.assertWithinLimit('u1', 'priceAlerts', 99),
    ).resolves.toBeUndefined();
  });

  it('leaves admins unbounded', async () => {
    mockUserRepo.findOne.mockResolvedValue({ tier: 'free', role: 'admin' });
    await expect(
      service.assertWithinLimit('u1', 'watchlists', 9999),
    ).resolves.toBeUndefined();
  });
});

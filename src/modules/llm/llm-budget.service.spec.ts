import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LlmBudgetService } from './llm-budget.service';
import { LlmDailyUsage } from './entities/llm-daily-usage.entity';

describe('LlmBudgetService', () => {
  let service: LlmBudgetService;

  const mockRepo = {
    findOne: jest.fn(),
    query: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfig = {
    get: jest.fn().mockReturnValue(450),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmBudgetService,
        { provide: getRepositoryToken(LlmDailyUsage), useValue: mockRepo },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<LlmBudgetService>(LlmBudgetService);
  });

  afterEach(() => jest.clearAllMocks());

  it('reports remaining budget as limit minus usage', async () => {
    mockRepo.findOne.mockResolvedValue({ count: 100 });
    expect(await service.getRemaining()).toBe(350);
  });

  it('treats a missing row as zero usage', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    expect(await service.getUsageToday()).toBe(0);
    expect(await service.getRemaining()).toBe(450);
  });

  it('never returns negative remaining', async () => {
    mockRepo.findOne.mockResolvedValue({ count: 600 });
    expect(await service.getRemaining()).toBe(0);
  });

  it('hasBudget reflects whether enough calls remain', async () => {
    mockRepo.findOne.mockResolvedValue({ count: 449 });
    expect(await service.hasBudget(1)).toBe(true);
    expect(await service.hasBudget(2)).toBe(false);
  });

  it('record() upserts the daily counter and never throws on db error', async () => {
    mockRepo.query.mockRejectedValueOnce(new Error('db down'));
    await expect(service.record(1)).resolves.toBeUndefined();
    expect(mockRepo.query).toHaveBeenCalled();
  });

  it('record() is a no-op for non-positive counts', async () => {
    await service.record(0);
    expect(mockRepo.query).not.toHaveBeenCalled();
  });
});

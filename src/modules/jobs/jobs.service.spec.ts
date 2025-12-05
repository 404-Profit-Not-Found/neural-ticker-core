import { Test, TestingModule } from '@nestjs/testing';
import { JobsService } from './jobs.service';
import { RiskRewardService } from '../risk-reward/risk-reward.service';

describe('JobsService', () => {
  let service: JobsService;
  let riskRewardService: any;

  const mockRiskRewardService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: RiskRewardService, useValue: mockRiskRewardService },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
    riskRewardService = module.get(RiskRewardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

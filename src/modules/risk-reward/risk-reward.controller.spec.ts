import { Test, TestingModule } from '@nestjs/testing';
import { RiskRewardController } from './risk-reward.controller';
import { RiskRewardService } from './risk-reward.service';

describe('RiskRewardController', () => {
  let controller: RiskRewardController;
  let service: RiskRewardService;

  const mockService = {
    getLatestScore: jest.fn(),
    computeScore: jest.fn(),
    getScoreHistory: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RiskRewardController],
      providers: [
        {
          provide: RiskRewardService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<RiskRewardController>(RiskRewardController);
    service = module.get<RiskRewardService>(RiskRewardService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getScore', () => {
    it('should return latest score by default', async () => {
      const mockScore = { symbol: 'AAPL', overall_score: 85 };
      mockService.getLatestScore.mockResolvedValue(mockScore);

      const result = await controller.getScore('AAPL', 'false');

      expect(result).toEqual(mockScore);
      expect(service.getLatestScore).toHaveBeenCalledWith('AAPL');
    });

    it('should return history if requested', async () => {
      const mockHistory = [{ symbol: 'AAPL', overall_score: 85 }];
      mockService.getScoreHistory = jest.fn().mockResolvedValue(mockHistory);

      const result = await controller.getScore('AAPL', 'true');

      expect(result).toEqual(mockHistory);
      expect(service.getScoreHistory).toHaveBeenCalledWith('AAPL');
    });
  });
});

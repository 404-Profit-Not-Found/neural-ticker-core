import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RiskRewardController } from './risk-reward.controller';
import { RiskRewardService } from './risk-reward.service';

describe('RiskRewardController', () => {
  let controller: RiskRewardController;
  let service: RiskRewardService;

  const mockService = {
    assertPublicReadAllowed: jest.fn(),
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
    mockService.assertPublicReadAllowed.mockResolvedValue(undefined);
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

    // Both reads resolve the symbol through the creating snapshot path, so the
    // public-read gate runs first. Over real HTTP with the real gate:
    // tickers/public-ticker-routes.http.spec.ts.
    it.each([
      ['anonymous', undefined, false],
      ['signed-in', { user: { id: 'user-1' } }, true],
    ])('asks the public-read gate first (%s)', async (_l, req, isSignedIn) => {
      mockService.getLatestScore.mockResolvedValue(null);

      await controller.getScore('NVDA', 'false', req);

      expect(mockService.assertPublicReadAllowed).toHaveBeenCalledWith(
        'NVDA',
        isSignedIn,
      );
    });

    it.each(['false', 'true'])(
      'reads nothing when the gate refuses (history=%s)',
      async (history) => {
        mockService.assertPublicReadAllowed.mockRejectedValue(
          new NotFoundException('Ticker NVDA not found'),
        );

        await expect(controller.getScore('NVDA', history)).rejects.toThrow(
          'Ticker NVDA not found',
        );

        expect(mockService.getLatestScore).not.toHaveBeenCalled();
        expect(mockService.getScoreHistory).not.toHaveBeenCalled();
      },
    );
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NewsController } from './news.controller';
import { MarketDataService } from './market-data.service';
import { ResearchService } from '../research/research.service';

describe('NewsController', () => {
  let controller: NewsController;
  let researchService: any;

  const mockMarketDataService = {
    getGeneralNews: jest.fn(),
    getNewsStats: jest.fn(),
  };

  const mockResearchService = {
    getCachedDigest: jest.fn(),
    generateDailyDigest: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NewsController],
      providers: [
        { provide: MarketDataService, useValue: mockMarketDataService },
        { provide: ResearchService, useValue: mockResearchService },
      ],
    }).compile();

    controller = module.get<NewsController>(NewsController);
    researchService = module.get<ResearchService>(ResearchService);
    jest.clearAllMocks();
  });

  describe('getDailyDigest', () => {
    it('should return failed status if user is logged in but generation returns null', async () => {
      const mockReq = { user: { id: 'user-123' } };
      mockResearchService.getCachedDigest.mockResolvedValue(null);
      
      const result = await controller.getDailyDigest(mockReq);

      expect(researchService.getCachedDigest).toHaveBeenCalledWith('user-123');
      expect(result).toEqual({
        status: 'failed',
        message: 'Could not generate digest. Ensure you have tickers in your watchlist.',
      });
    });

    it('should return failed status if user is missing', async () => {
      const mockReq = {};
      mockResearchService.getCachedDigest.mockResolvedValue(null);

      const result = await controller.getDailyDigest(mockReq);

      expect(researchService.getCachedDigest).toHaveBeenCalledWith(null);
      expect(result).toEqual({
        status: 'failed',
        message: 'Please log in to view your Daily Digest.',
      });
    });
  });
});

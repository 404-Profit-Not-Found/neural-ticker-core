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
    it('should pass user ID from request to research service', async () => {
      const mockReq = { user: { id: 'user-123' } };
      await controller.getDailyDigest(mockReq);

      expect(researchService.getCachedDigest).toHaveBeenCalledWith('user-123');
    });

    it('should pass null if user is missing (though guard usually prevents this)', async () => {
      const mockReq = {};
      await controller.getDailyDigest(mockReq);

      expect(researchService.getCachedDigest).toHaveBeenCalledWith(null);
    });
  });
});

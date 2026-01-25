import { Test, TestingModule } from '@nestjs/testing';
import { StockTwitsController } from './stocktwits.controller';
import { StockTwitsService } from './stocktwits.service';
import { CreditService } from '../users/credit.service';
import { UsersService } from '../users/users.service';

describe('StockTwitsController', () => {
  let controller: StockTwitsController;
  let service: StockTwitsService;

  const mockService = {
    getPosts: jest.fn(),
    getWatchersHistory: jest.fn(),
    analyzeComments: jest.fn(),
    getLatestAnalysis: jest.fn(),
    getFutureEvents: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockTwitsController],
      providers: [
        { provide: StockTwitsService, useValue: mockService },
        { provide: CreditService, useValue: {} },
        { provide: UsersService, useValue: {} },
      ],
    }).compile();

    controller = module.get<StockTwitsController>(StockTwitsController);
    service = module.get<StockTwitsService>(StockTwitsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('analyzeComments', () => {
    it('should return analysis if successful', async () => {
      const mockAnalysis = { id: '1', symbol: 'AAPL' };
      mockService.analyzeComments.mockResolvedValue(mockAnalysis);

      const result = await controller.analyzeComments(
        'AAPL',
        { user: { id: 'user-1' } } as any,
        {},
      );
      expect(result).toEqual(mockAnalysis);
    });

    it('should return message if not enough data', async () => {
      mockService.analyzeComments.mockResolvedValue(null);

      const result = await controller.analyzeComments(
        'AAPL',
        { user: { id: 'user-1' } } as any,
        {},
      );
      expect(result).toEqual({ message: 'Not enough data to analyze' });
    });
  });
});

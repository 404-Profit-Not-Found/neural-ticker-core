import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RiskRewardService } from './risk-reward.service';
import { RiskRewardScore } from './entities/risk-reward-score.entity';
import { LlmService } from '../llm/llm.service';
import { MarketDataService } from '../market-data/market-data.service';

describe('RiskRewardService', () => {
  let service: RiskRewardService;
  let repo: any;
  let llmService: any;
  let marketDataService: any;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockLlmService = {
    generateResearch: jest.fn(),
  };

  const mockMarketDataService = {
    getSnapshot: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskRewardService,
        { provide: getRepositoryToken(RiskRewardScore), useValue: mockRepo },
        { provide: LlmService, useValue: mockLlmService },
        { provide: MarketDataService, useValue: mockMarketDataService },
      ],
    }).compile();

    service = module.get<RiskRewardService>(RiskRewardService);
    repo = module.get(getRepositoryToken(RiskRewardScore));
    llmService = module.get(LlmService);
    marketDataService = module.get(MarketDataService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluateSymbol', () => {
    it('should generate score and save', async () => {
        const symbol = 'AAPL';
        mockMarketDataService.getSnapshot.mockResolvedValue({ 
            symbol: { id: '1', symbol: 'AAPL' },
            latestPrice: {},
            fundamentals: {}
        });
        
        const llmResponse = {
            answerMarkdown: '```json\n{"risk_reward_score": 80, "summary": "Good"}\n```',
            models: ['gpt']
        };
        mockLlmService.generateResearch.mockResolvedValue(llmResponse);
        
        repo.create.mockReturnValue({ id: '1' });
        repo.save.mockResolvedValue({ id: '1' });

        await service.evaluateSymbol('AAPL');
        
        expect(marketDataService.getSnapshot).toHaveBeenCalledWith('AAPL');
        expect(llmService.generateResearch).toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalled();
    });
  });
});

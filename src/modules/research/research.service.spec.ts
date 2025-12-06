import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ResearchService } from './research.service';
import { ResearchNote } from './entities/research-note.entity';
import { LlmService } from '../llm/llm.service';
import { MarketDataService } from '../market-data/market-data.service';

describe('ResearchService', () => {
  let service: ResearchService;
  let repo: any;
  let llmService: any;
  let marketDataService: any;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
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
        ResearchService,
        { provide: getRepositoryToken(ResearchNote), useValue: mockRepo },
        { provide: LlmService, useValue: mockLlmService },
        { provide: MarketDataService, useValue: mockMarketDataService },
      ],
    }).compile();

    service = module.get<ResearchService>(ResearchService);
    repo = module.get(getRepositoryToken(ResearchNote));
    llmService = module.get(LlmService);
    marketDataService = module.get(MarketDataService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createResearchQuestion', () => {
    it('should create and save research note', async () => {
      const tickers = ['AAPL'];
      const question = 'Analyzie';

      mockMarketDataService.getSnapshot.mockResolvedValue({ price: 100 });
      mockLlmService.generateResearch.mockResolvedValue({
        provider: 'ensemble',
        models: ['gpt'],
        answerMarkdown: 'Answer',
      });
      repo.create.mockReturnValue({ id: '1', question });
      repo.save.mockResolvedValue({ id: '1', question });

      const result = await service.createResearchQuestion(tickers, question);

      expect(marketDataService.getSnapshot).toHaveBeenCalledWith('AAPL');
      expect(llmService.generateResearch).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual({ id: '1', question });
    });
  });
});

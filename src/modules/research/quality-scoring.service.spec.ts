import { Test, TestingModule } from '@nestjs/testing';
import { QualityScoringService } from './quality-scoring.service';
import { LlmService } from '../llm/llm.service';

describe('QualityScoringService', () => {
  let service: QualityScoringService;
  let llmService: Partial<LlmService>;

  beforeEach(async () => {
    llmService = {
      generateResearch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QualityScoringService,
        { provide: LlmService, useValue: llmService },
      ],
    }).compile();

    service = module.get<QualityScoringService>(QualityScoringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return a score and rarity for valid input', async () => {
    const mockReponse = {
       answerMarkdown: JSON.stringify({
         score: 85,
         rarity: 'Rare',
         details: {
           riskRewardAnalysis: 8,
           hallucinationCheck: 9,
           insightDensity: 8,
           comprehensive: 9,
           reasoning: 'Good note.'
         }
       }),
       models: ['gemini-2.5-flash-lite'],
       provider: 'gemini', 
    };

    (llmService.generateResearch as jest.Mock).mockResolvedValue(mockReponse);

    const result = await service.score('Sample research content');
    expect(result.score).toBe(85);
    expect(result.rarity).toBe('Rare');
  });

  it('should handle Epic rarity', async () => {
    const mockReponse = {
       answerMarkdown: JSON.stringify({
         score: 90,
         rarity: 'Epic',
         details: {
           riskRewardAnalysis: 9,
           hallucinationCheck: 9,
           insightDensity: 9,
           comprehensive: 9,
           reasoning: 'Epic note.'
         }
       }),
       models: ['gemini-2.5-flash-lite'],
       provider: 'gemini', 
    };

    (llmService.generateResearch as jest.Mock).mockResolvedValue(mockReponse);

    const result = await service.score('Epic content');
    expect(result.score).toBe(90);
    expect(result.rarity).toBe('Epic');
  });

  it('should handle loose JSON parsing from LLM', async () => {
    const mockReponse = {
       answerMarkdown: "Here is the JSON: ```json\n{ \"score\": 40, \"rarity\": \"Common\", \"details\": { \"reasoning\": \"ok\" } }\n```",
       models: [],
       provider: 'gemini',
    };

    (llmService.generateResearch as jest.Mock).mockResolvedValue(mockReponse);

    // The service uses .match(/\{[\s\S]*\}/) which should extract it
    const result = await service.score('Badly formatted LLM response');
    expect(result.score).toBe(40);
    expect(result.rarity).toBe('Common');
  });

  it('should return fallback on error', async () => {
    (llmService.generateResearch as jest.Mock).mockRejectedValue(new Error('LLM Failed'));

    const result = await service.score('Fail me');
    expect(result.score).toBe(0);
    expect(result.rarity).toBe('Common');
  });
});

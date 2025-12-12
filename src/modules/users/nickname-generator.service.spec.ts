import { Test, TestingModule } from '@nestjs/testing';
import { NicknameGeneratorService } from './nickname-generator.service';

describe('NicknameGeneratorService', () => {
  let service: NicknameGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NicknameGeneratorService],
    }).compile();

    service = module.get<NicknameGeneratorService>(NicknameGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generate', () => {
    it('should generate a nickname with adjective, noun, and number', () => {
      const nickname = service.generate();

      expect(typeof nickname).toBe('string');
      expect(nickname.length).toBeGreaterThan(5);
    });

    it('should generate unique nicknames', () => {
      const nicknames = new Set<string>();
      for (let i = 0; i < 10; i++) {
        nicknames.add(service.generate());
      }
      // Should have mostly unique nicknames (some collisions possible due to randomness)
      expect(nicknames.size).toBeGreaterThanOrEqual(5);
    });

    it('should generate nicknames matching pattern', () => {
      const nickname = service.generate();
      // Pattern: AdjectiveNounNumber (e.g., HappyPanda123)
      // Check it starts with uppercase letter and ends with digits
      expect(nickname).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d+$/);
    });
  });
});

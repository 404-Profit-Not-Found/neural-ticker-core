import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  const mockDataSource = {
    isInitialized: true,
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('local'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return healthy status when db is up', async () => {
      mockDataSource.isInitialized = true;

      const result = await controller.check();

      expect(result).toEqual({
        status: 'ok',
        db: 'up',
        env: 'local',
      });
    });

    it('should return down status when db is not initialized', async () => {
      mockDataSource.isInitialized = false;

      const result = await controller.check();

      expect(result).toEqual({
        status: 'ok',
        db: 'down',
        env: 'local',
      });
    });
  });
});

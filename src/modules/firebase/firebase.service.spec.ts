import { Test, TestingModule } from '@nestjs/testing';
import { FirebaseService } from './firebase.service';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

jest.mock('firebase-admin', () => {
  return {
    apps: [],
    credential: {
      cert: jest.fn(),
    },
    initializeApp: jest.fn(),
    auth: jest.fn().mockReturnValue({
      verifyIdToken: jest.fn(),
    }),
  };
});

describe('FirebaseService', () => {
  let service: FirebaseService;
  let configService: ConfigService;

  beforeEach(async () => {
    // Reset admin mocks
    // Reset admin mocks
    // admin.apps already mocked by factory
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirebaseService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FirebaseService>(FirebaseService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should load credentials from JSON env var', async () => {
      const mockCreds = { private_key: 'key', client_email: 'email' };
      (configService.get as jest.Mock).mockImplementation((key) => {
        if (key === 'firebase.serviceAccountJson')
          return JSON.stringify(mockCreds);
        return null;
      });

      await service.onModuleInit();

      expect(admin.initializeApp).toHaveBeenCalledWith({
        credential: undefined, // Mocked cert result
        projectId: undefined,
      });
      expect(admin.credential.cert).toHaveBeenCalledWith(mockCreds);
    });

    it('should initialize with default credentials if no specific env vars', async () => {
      (configService.get as jest.Mock).mockReturnValue(null);

      await service.onModuleInit();

      expect(admin.initializeApp).toHaveBeenCalledWith({
        projectId: undefined,
      });
    });

    it('should handle json parse error in credentials env var', async () => {
      (configService.get as jest.Mock).mockImplementation((key) => {
        if (key === 'firebase.serviceAccountJson') return '{ invalid json }';
        return null;
      });

      await service.onModuleInit();
      // Should log error but not crash, likely falling back or doing nothing if no other creds
      expect(admin.initializeApp).toHaveBeenCalledWith({
        projectId: undefined,
      });
    });

    it('should fail gracefully if private_key missing in credentials', async () => {
      const mockCreds = { client_email: 'no-key' };
      (configService.get as jest.Mock).mockImplementation((key) => {
        if (key === 'firebase.serviceAccountJson')
          return JSON.stringify(mockCreds);
        return null;
      });

      await service.onModuleInit();
      expect(admin.initializeApp).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ArgumentsHost } from '@nestjs/common';
import { GoogleAuthExceptionFilter } from './google-auth-exception.filter';

describe('GoogleAuthExceptionFilter', () => {
  let filter: GoogleAuthExceptionFilter;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('http://localhost:3000'),
  };

  const createMockHost = () => {
    const mockResponse = {
      redirect: jest.fn(),
    };
    return {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => mockResponse,
        getNext: () => ({}),
      }),
      response: mockResponse,
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAuthExceptionFilter,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    filter = module.get<GoogleAuthExceptionFilter>(GoogleAuthExceptionFilter);
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('catch', () => {
    it('should redirect to invite_only error when email not on invite list', () => {
      const mockHost = createMockHost();
      const error = new Error('User test@example.com is not on the invite list');

      filter.catch(error, mockHost as unknown as ArgumentsHost);

      expect(mockHost.response.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/access-denied?error=invite_only',
      );
    });

    it('should redirect to auth_failed for generic errors', () => {
      const mockHost = createMockHost();
      const error = new Error('Some other authentication error');

      filter.catch(error, mockHost as unknown as ArgumentsHost);

      expect(mockHost.response.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/access-denied?error=auth_failed',
      );
    });

    it('should handle non-Error exceptions', () => {
      const mockHost = createMockHost();

      filter.catch('string error', mockHost as unknown as ArgumentsHost);

      expect(mockHost.response.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/access-denied?error=auth_failed',
      );
    });

    it('should use default frontend URL if not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);
      const mockHost = createMockHost();
      const error = new Error('Auth error');

      filter.catch(error, mockHost as unknown as ArgumentsHost);

      expect(mockHost.response.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/access-denied?error=auth_failed',
      );
    });
  });
});

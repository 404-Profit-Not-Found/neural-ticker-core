import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GoogleAuthGuard } from './google-auth.guard';

describe('GoogleAuthGuard', () => {
  let guard: GoogleAuthGuard;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAuthGuard,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    guard = module.get<GoogleAuthGuard>(GoogleAuthGuard);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('getAuthenticateOptions', () => {
    it('should use configured callback URL', () => {
      mockConfigService.get.mockReturnValue('https://example.com/callback');
      const context = createMockContext({});

      const options = guard.getAuthenticateOptions(context);

      expect(options.callbackURL).toBe('https://example.com/callback');
    });

    it('should generate callback URL from request if not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);
      const context = createMockContext({
        headers: { 'x-forwarded-proto': 'https' },
        host: 'myapp.com',
      });

      const options = guard.getAuthenticateOptions(context);

      expect(options.callbackURL).toBe('https://myapp.com/api/auth/google/callback');
    });

    it('should handle intent query parameter', () => {
      mockConfigService.get.mockReturnValue('https://example.com/callback');
      const context = createMockContext({ query: { intent: 'waitlist' } });

      const options = guard.getAuthenticateOptions(context);

      expect(options.state).toBe(JSON.stringify({ intent: 'waitlist' }));
    });

    it('should not set state if no intent', () => {
      mockConfigService.get.mockReturnValue('https://example.com/callback');
      const context = createMockContext({ query: {} });

      const options = guard.getAuthenticateOptions(context);

      expect(options.state).toBeUndefined();
    });

    it('should handle array x-forwarded-proto header', () => {
      mockConfigService.get.mockReturnValue(undefined);
      const context = createMockContext({
        headers: { 'x-forwarded-proto': ['https', 'http'] },
        host: 'myapp.com',
      });

      const options = guard.getAuthenticateOptions(context);

      expect(options.callbackURL).toBe('https://myapp.com/api/auth/google/callback');
    });

    it('should fallback to req.protocol if no x-forwarded-proto', () => {
      mockConfigService.get.mockReturnValue(undefined);
      const context = createMockContext({
        headers: {},
        host: 'localhost:3000',
        protocol: 'http',
      });

      const options = guard.getAuthenticateOptions(context);

      expect(options.callbackURL).toBe('http://localhost:3000/api/auth/google/callback');
    });
  });
});

function createMockContext(opts: {
  query?: Record<string, any>;
  headers?: Record<string, any>;
  host?: string;
  protocol?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        query: opts.query || {},
        headers: opts.headers || {},
        get: (key: string) => {
          if (key === 'host') return opts.host || 'localhost:3000';
          return undefined;
        },
        protocol: opts.protocol || 'http',
      }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
    getArgs: () => [],
    getArgByIndex: () => ({}),
    switchToRpc: () => ({} as any),
    switchToWs: () => ({} as any),
    getType: () => 'http',
  } as ExecutionContext;
}

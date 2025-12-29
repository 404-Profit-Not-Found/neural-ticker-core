import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MarketStatusService } from '../src/modules/market-data/market-status.service';
import { LlmService } from '../src/modules/llm/llm.service';
import { TickersService } from '../src/modules/tickers/tickers.service';
import { AuthService } from '../src/modules/auth/auth.service';

// Mock DB Credentials for E2E
process.env.CRON_SECRET = 'test-secret';

describe('Social Analysis (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let adminToken: string;
  let admin: any;
  let authService: AuthService;
  let tickersService: TickersService;

  const mockMarketStatusService = {
    isMarketTradingDay: jest.fn().mockResolvedValue(true),
    isPreMarketAnalysisWindow: jest.fn().mockResolvedValue(true),
  };

  const mockLlmService = {
    generateResearch: jest.fn().mockResolvedValue({
      answerMarkdown: JSON.stringify({
        sentiment_score: 0.8,
        label: 'BULLISH',
        summary: 'Very positive outlook.',
        highlights: ['Highlight 1'],
        events: [{ title: 'Earnings', date: '2025-01-30' }],
      }),
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MarketStatusService)
      .useValue(mockMarketStatusService)
      .overrideProvider(LlmService)
      .useValue(mockLlmService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    tickersService = moduleFixture.get<TickersService>(TickersService);

    // Create a mock user and get token
    const loginRes = await authService.localDevLogin(
      `test-${Date.now()}@example.com`,
    );
    authToken = loginRes.access_token;

    // Create an admin user
    const adminLoginRes = await authService.localDevLogin(
      `admin-${Date.now()}@example.com`,
    );
    adminToken = adminLoginRes.access_token;
    admin = adminLoginRes.user;

    // Set admin role
    await (authService as any).usersService.updateRole(admin.id, 'admin');

    // Ensure initial ticker for tests
    await tickersService.ensureTicker('AAPL');
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  describe('Job Triggers (SocialAnalysisController)', () => {
    it('/api/v1/social-analysis/jobs/pre-market-analysis (POST) - Unauthorized', () => {
      return request(app.getHttpServer())
        .post('/api/v1/social-analysis/jobs/pre-market-analysis')
        .expect(401);
    });

    it('/api/v1/social-analysis/jobs/pre-market-analysis (POST) - With Secret', async () => {
      // Enable social analysis for AAPL so the job has something to do
      const aaplTicker = (await tickersService.getTickerBySymbol('AAPL'))!;
      await tickersService.toggleSocialAnalysis(aaplTicker.id, true, admin.id);

      return request(app.getHttpServer())
        .post('/api/v1/social-analysis/jobs/pre-market-analysis')
        .set('X-Cron-Secret', 'test-secret')
        .expect(201)
        .expect((res) => {
          expect(res.body.message).toBe('Pre-market analysis completed');
          expect(res.body.result.processed).toBeGreaterThanOrEqual(0);
        });
    });

    it('/api/v1/social-analysis/jobs/cleanup (POST) - With Secret', () => {
      return request(app.getHttpServer())
        .post('/api/v1/social-analysis/jobs/cleanup')
        .set('X-Cron-Secret', 'test-secret')
        .expect(201)
        .expect((res) => {
          expect(res.body.message).toBe('Cleanup completed');
        });
    });
  });

  describe('Social Analysis Toggle (TickersController)', () => {
    it('/api/v1/tickers/AAPL/social-analysis (PATCH) - Unauthorized', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/tickers/AAPL/social-analysis')
        .send({ enabled: true })
        .expect(401);
    });

    it('/api/v1/tickers/AAPL/social-analysis (PATCH) - Admin Success', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/tickers/AAPL/social-analysis')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true })
        .expect(200)
        .expect((res) => {
          expect(res.body.social_analysis_enabled).toBe(true);
        });
    });

    it('/api/v1/tickers/social-enabled/list (GET) - Public Success', () => {
      return request(app.getHttpServer())
        .get('/api/v1/tickers/social-enabled/list')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.some((t: any) => t.symbol === 'AAPL')).toBe(true);
        });
    });
  });

  describe('Composite Response (TickerDetailController)', () => {
    it('/api/v1/tickers/AAPL/composite (GET) - Should contain social data', async () => {
      // Trigger a run manually or seed the DB with an analysis
      // For E2E we can just check if the fields exist (even if null if not ran)
      return request(app.getHttpServer())
        .get('/api/v1/tickers/AAPL/composite')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('social_sentiment');
          expect(res.body).toHaveProperty('upcoming_events');
        });
    });
  });
});

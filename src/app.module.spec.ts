import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { INestApplication } from '@nestjs/common';

describe('AppModule', () => {
  let app: INestApplication;

  beforeAll(() => {
    require('dotenv').config();

    process.env.OPENAI_API_KEY = 'test-key';
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.FINNHUB_API_KEY = 'test-key';
    
    // Ensure DB_PASSWORD is a string to prevent "client password must be a string" error
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'password';
    
    // DB Configuration: rely on dotenv loading .env (whether local or Neon)
    // If running in CI (no .env), the CI env vars will handle it.
    
    // Firebase Mock
    const mockCreds = {
      private_key:
        '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDb...\n-----END PRIVATE KEY-----\n',
      client_email: 'mock@email.com',
      project_id: 'mock-project',
    };
    process.env.FIREBASE_CREDENTIALS_JSON = JSON.stringify(mockCreds);
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30000); // Increase timeout for DB connection

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should compile and initialize the application', () => {
    expect(app).toBeDefined();
  });
});

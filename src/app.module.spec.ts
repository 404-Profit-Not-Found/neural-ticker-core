import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { INestApplication } from '@nestjs/common';

import * as dotenv from 'dotenv';

describe('AppModule', () => {
  let app: INestApplication;

  beforeAll(() => {
    dotenv.config();

    process.env.OPENAI_API_KEY = 'test-key';
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.FINNHUB_API_KEY = 'test-key';

    // Ensure DB_PASSWORD/USER are strings (CI/CD Fix)
    // TypeORM ignores these if DATABASE_URL is set (Local), so this is safe.
    process.env.DB_PASSWORD = 'password';
    process.env.DB_USERNAME = 'neural';
    process.env.DB_DATABASE = 'neural_db';

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

import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { INestApplication } from '@nestjs/common';

// Top-level setup: Execute IMMEDIATELY when test file is loaded.
// This guarantees env vars are set before any NestJS/TypeORM internals wake up.

import * as dotenv from 'dotenv';
dotenv.config();

// MOCK KEYS
process.env.OPENAI_API_KEY = 'test-key';
process.env.GEMINI_API_KEY = 'test-key';
process.env.FINNHUB_API_KEY = 'test-key';

// DATABASE CONFIGURATION (CI/CD FIX)
// 1. Force DB_PASSWORD/USERNAME to valid strings to satisfy `pg` client validation
// 2. These are ignored locally if DATABASE_URL is set, but ESSENTIAL in CI where URL is missing
process.env.DB_PASSWORD = 'password';
process.env.DB_USERNAME = 'neural';
process.env.DB_DATABASE = 'neural_db';

// FIREBASE MOCK
const mockCreds = {
  private_key:
    '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDb...\n-----END PRIVATE KEY-----\n',
  client_email: 'mock@email.com',
  project_id: 'mock-project',
};
process.env.FIREBASE_CREDENTIALS_JSON = JSON.stringify(mockCreds);

describe('AppModule', () => {
  let app: INestApplication;

  beforeAll(() => {
    // Top-level setup handles env vars now
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

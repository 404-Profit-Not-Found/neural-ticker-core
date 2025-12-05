import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { INestApplication } from '@nestjs/common';

describe('AppModule', () => {
  let app: INestApplication;

  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.FINNHUB_API_KEY = 'test-key';
    
    // DB Mocks to pass Validation
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USERNAME = 'neural';
    process.env.DB_PASSWORD = 'password';
    process.env.DB_DATABASE = 'neural_db';
    process.env.DATABASE_URL = 'postgres://neural:password@localhost:5432/neural_db';
    
    // Firebase Mock
    process.env.FIREBASE_CREDENTIALS_JSON = JSON.stringify({
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDb...\n-----END PRIVATE KEY-----\n',
      client_email: 'mock@email.com',
      project_id: 'mock-project'
    });
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

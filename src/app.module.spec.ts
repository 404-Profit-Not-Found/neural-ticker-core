import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { INestApplication } from '@nestjs/common';

// FAILSAFE: Explicitly set CI credentials here in case global setup is bypassed or raced.
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'password';
process.env.DB_USERNAME = process.env.DB_USERNAME || 'neural';
process.env.DB_DATABASE = process.env.DB_DATABASE || 'neural_db';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';

describe('AppModule', () => {
  let app: INestApplication;

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

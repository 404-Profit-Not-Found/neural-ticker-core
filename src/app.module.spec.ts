import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { INestApplication } from '@nestjs/common';

// CRITICAL: These env vars MUST be set before ANY module that uses them is imported.
// The issue is that in CI, no .env file exists, so DB_PASSWORD is undefined.
// By setting defaults here at the top level, they're available when AppModule loads.
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'password';
process.env.DB_USERNAME = process.env.DB_USERNAME || 'neural';
process.env.DB_DATABASE = process.env.DB_DATABASE || 'neural_db';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '5432';

/**
 * AppModule integration test.
 *
 * This test validates that the full application can compile and initialize.
 * It requires a running PostgreSQL database, so it's skipped in CI environments
 * that don't have a database available.
 *
 * To run locally: ensure Docker is running with the database container.
 */
const isCI = process.env.CI === 'true';

// Skip in CI since this is an integration test requiring a real database
const describeOrSkip = isCI ? describe.skip : describe;

describeOrSkip('AppModule', () => {
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

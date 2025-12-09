import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// CRITICAL: Set DB credentials before module import for CI
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'password';
process.env.DB_USERNAME = process.env.DB_USERNAME || 'neural';
process.env.DB_DATABASE = process.env.DB_DATABASE || 'neural_db';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';

/**
 * E2E tests require a running database.
 * Skip in CI where no database is available.
 */
const isCI = process.env.CI === 'true';
// const describeOrSkip = isCI ? describe.skip : describe;
const describeOrSkip = describe;

describeOrSkip('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30000);

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});

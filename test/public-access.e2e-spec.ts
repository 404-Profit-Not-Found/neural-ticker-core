import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Mock DB Credentials for E2E (same as app.e2e-spec.ts)
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'password';
process.env.DB_USERNAME = process.env.DB_USERNAME || 'neural';
process.env.DB_DATABASE = process.env.DB_DATABASE || 'neural_db';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';

describe('Public Access (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api'); // Match main.ts
    await app.init();
  }, 30000); // Increase timeout for app init

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/api/v1/tickers/NVDA/logo (GET) should be public (200 or 404, not 401)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/tickers/NVDA/logo')
      .expect((res) => {
        if (res.status === 401) throw new Error('Endpoint is 401 Protected!');
        // 200 or 404 is fine (404 means logo not found but auth passed)
      });
  });

  it('/api/proxy/image (GET) should be public (200 or 404, not 401)', () => {
    return (
      request(app.getHttpServer())
        // Valid finnhub url format for the regex check
        .get(
          '/api/proxy/image?url=https://static.finnhub.io/logo/87da60f6-9f86-11ea-88f2-000000000000.png',
        )
        .expect((res) => {
          if (res.status === 401) throw new Error('Endpoint is 401 Protected!');
        })
    );
  });
});

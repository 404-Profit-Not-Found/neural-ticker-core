import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { INestApplication } from '@nestjs/common';

describe('AppModule', () => {
  let app: INestApplication;

  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'test-key';
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

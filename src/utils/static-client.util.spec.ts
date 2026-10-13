import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { STATIC_CLIENT_EXCLUDE } from './static-client.util';

@Controller('v1/ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

describe('static client fallback', () => {
  let app: INestApplication;
  let root: string;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-static-'));
    fs.writeFileSync(
      path.join(root, 'index.html'),
      '<!doctype html><title>app</title>',
    );

    @Module({
      imports: [
        ServeStaticModule.forRoot({
          rootPath: root,
          exclude: STATIC_CLIENT_EXCLUDE,
        }),
      ],
      controllers: [PingController],
    })
    class StaticClientTestModule {}

    // A real application, not Test.createTestingModule(): the testing module
    // has no HTTP adapter at compile time, so ServeStaticModule would install
    // a no-op loader and these tests would pass without the exclusion.
    app = await NestFactory.create(StaticClientTestModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('serves the app shell for client-side routes', async () => {
    const res = await request(app.getHttpServer()).get('/ticker/AAPL');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('still reaches real API routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it.each(['/api/v1/nope', '/api/nope', '/api'])(
    'answers an unknown API path %s with a JSON 404, not the app shell',
    async (url) => {
      const res = await request(app.getHttpServer()).get(url);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
    },
  );
});

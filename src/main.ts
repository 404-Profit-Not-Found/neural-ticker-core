import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { showBanner } from './utils/banner.util';
import { json, urlencoded } from 'express';

async function bootstrap() {
  console.log('--- BOOTSTRAP STARTING ---');
  console.log('--- CREATING NEST APP ---');
  const app = await NestFactory.create(AppModule);

  // Increase Payload Limit
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.use(cookieParser());
  console.log('--- NEST APP CREATED ---');

  // Disable ETags to ensure 200 OK with data (fix for 304 empty body filtering issue)
  app.getHttpAdapter().getInstance().set('etag', false);

  // Enable CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  // Set global prefix if desired, e.g. api/v1
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Neural Ticker Core API')
    .setDescription(
      'API documentation for the Neural Ticker Core backend service.',
    )
    .setVersion('1.0')
    .addTag('Health')
    .addTag('Ticker')
    .addTag('Market Data')
    .addTag('Research')
    .addTag('Risk/Reward')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Retry logic for EADDRINUSE
  const port = process.env.PORT || process.env.APP_PORT || 8080;

  const listenWithRetry = async (attempts = 5) => {
    try {
      console.log(`--- ATTEMPTING TO LISTEN ON PORT ${port} (0.0.0.0) ---`);
      await app.listen(port, '0.0.0.0');
      console.log(`Application is running on: ${await app.getUrl()}`);
    } catch (err: any) {
      if (err.code === 'EADDRINUSE') {
        if (attempts > 0) {
          console.log(
            `Port ${port} in use, retrying in 1s... (${attempts} attempts left)`,
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await listenWithRetry(attempts - 1);
        } else {
          console.error(
            `Unable to bind to port ${port} after multiple attempts.`,
          );
          process.exit(1);
        }
      } else {
        throw err;
      }
    }
  };

  await listenWithRetry();

  // Enable standard NestJS shutdown hooks
  app.enableShutdownHooks();

  // Aggressive connection cleanup for hot reload environments
  const server = app.getHttpServer();
  if (server) {
    server.keepAliveTimeout = 5000; // Reduce keep-alive timeout
    server.on('close', () => console.log('--- SERVER CLOSED ---'));
  }

  // Console Banner
  await showBanner(app);
}
void bootstrap();

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { showBanner } from './utils/banner.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global prefix if desired, e.g. api/v1
  // app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Neural Ticket Core API')
    .setDescription(
      'API documentation for the Neural Ticket Core backend service.',
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
  const port = process.env.APP_PORT ?? 8080;

  const listenWithRetry = async (attempts = 5) => {
    try {
      await app.listen(port, '0.0.0.0');
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

  // Aggressive Shutdown for Hot Reload
  // This ensures all keep-alive connections are killed instantly
  const server = app.getHttpServer();

  const cleanup = async () => {
    // console.log(`Received signal, forcing shutdown...`);
    if (server) {
      server.closeAllConnections(); // Node 18+
      server.close();
    }
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void cleanup());
  process.on('SIGINT', () => void cleanup());

  // Console Banner
  await showBanner(app);
}
void bootstrap();

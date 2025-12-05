import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Neural Ticket Core API')
    .setDescription('API documentation for the Neural Ticket Core backend service.')
    .setVersion('1.0')
    .addTag('Health')
    .addTag('Symbols')
    .addTag('Market Data')
    .addTag('Research')
    .addTag('Risk/Reward')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.APP_PORT ?? 8080);
  
  // Console Banner
  try {
    const { default: chalk } = await import('chalk');
    const { DataSource } = await import('typeorm');
    
    const dataSource = app.get(DataSource);
    const start = Date.now();
    let dbStatus = chalk.yellow('Checking...');
    try {
        if (dataSource.isInitialized) {
             await dataSource.query('SELECT 1');
             const latency = Date.now() - start;
             dbStatus = chalk.green(`Online (${latency}ms)`);
        } else {
            dbStatus = chalk.red('Not Initialized');
        }
    } catch (e) {
        dbStatus = chalk.red('Error');
    }

    const port = process.env.APP_PORT ?? 8080;
    const appName = 'neural-ticker-core';

    console.log(chalk.bold.cyan(`\n${appName} started successfully!`));
    console.log(chalk.gray('------------------------------------------------------------'));
    console.log(chalk.green(`🚀 App running at:    `) + chalk.underline(`http://localhost:${port}`));
    console.log(chalk.yellow(`sz Swagger Docs:      `) + chalk.underline(`http://localhost:${port}/api/docs`));
    console.log(chalk.blue(`🗄️  Database:          `) + dbStatus);
    console.log(chalk.gray('------------------------------------------------------------'));
    
  } catch (error) {
    console.error('Failed to display banner:', error);
  }
}
bootstrap();

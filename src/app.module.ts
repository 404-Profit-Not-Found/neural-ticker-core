import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core'; // Added
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard'; // Added
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TickersModule } from './modules/tickers/tickers.module';
import { FinnhubModule } from './modules/finnhub/finnhub.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { LlmModule } from './modules/llm/llm.module';
import { ResearchModule } from './modules/research/research.module';
import { RiskRewardModule } from './modules/risk-reward/risk-reward.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { FirebaseModule } from './modules/firebase/firebase.module';
import { HealthModule } from './modules/health/health.module';
import configuration from './config/configuration';

// ...

@Module({
  imports: [
    // ... imports
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        return {
          type: 'postgres',
          url: dbConfig.url,
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '5432'),
          username: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_DATABASE,
          autoLoadEntities: true,
          synchronize: process.env.DB_SYNCHRONIZE === 'true',
          ssl: dbConfig.url ? { rejectUnauthorized: false } : false,
        };
      },
    }),
    HealthModule,
    FinnhubModule,
    LlmModule,
    TickersModule,
    MarketDataModule,
    ResearchModule,
    RiskRewardModule,
    JobsModule,
    UsersModule,
    AuthModule,
    FirebaseModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}

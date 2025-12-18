import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { testTypeOrmConfig } from './database/typeorm.test.config';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static'; // Added
import { join } from 'path'; // Added
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'; // Added

import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
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
import { StockTwitsModule } from './modules/stocktwits/stocktwits.module';
import { WatchlistModule } from './modules/watchlist/watchlist.module'; // Added
import { SocialModule } from './modules/social/social.module';
import { ProxyModule } from './modules/proxy/proxy.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module'; // Added
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

    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'client'),
      exclude: ['/api/{*splat}'],
    }),

    // Global Rate Limiting: 100 requests per minute per IP
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        if (process.env.NODE_ENV === 'test') {
          return testTypeOrmConfig;
        }
        const dbConfig = configService.get('database');
        return {
          type: 'postgres',
          url: dbConfig.url,
          host: dbConfig.host || 'localhost',
          port: dbConfig.port || 5432,
          username:
            process.env.DB_USERNAME ?? process.env.POSTGRES_USER ?? 'admin',
          ...(dbConfig.password ? { password: dbConfig.password } : {}),
          database: dbConfig.database || 'postgres',
          autoLoadEntities: true,
          synchronize: dbConfig.synchronize,
          migrationsRun: true,
          migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
          connectTimeoutMS: 10000,
          ssl:
            process.env.DB_SSL === 'false'
              ? false
              : (dbConfig.url && dbConfig.url.includes('sslmode=require')) ||
                  process.env.DB_SSL === 'true'
                ? { rejectUnauthorized: false }
                : false,
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
    StockTwitsModule,
    WatchlistModule,
    SocialModule,
    SocialModule,
    ProxyModule,
    NotificationsModule,
    PortfolioModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Rate Limiting First
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Auth Second
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}

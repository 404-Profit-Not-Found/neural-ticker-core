import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { testTypeOrmConfig } from './database/typeorm.test.config';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static'; // Added
import { ScheduleModule } from '@nestjs/schedule'; // Added
import { join } from 'path'; // Added
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'; // Added

import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';

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
import { YahooFinanceModule } from './modules/yahoo-finance/yahoo-finance.module';
import { TickerRequestsModule } from './modules/ticker-requests/ticker-requests.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { PriceAlertsModule } from './modules/price-alerts/price-alerts.module';
import { WebPushModule } from './modules/web-push/web-push.module';
import { McpToolsModule } from './modules/mcp/mcp-tools.module';
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

    // Experimental pixel-terminal frontend served under /v2/ (more specific
    // prefix listed first so it claims /v2/* before the catch-all client root).
    // Built artifact lives under frontend-v2/dist after `npm run build`.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'frontend-v2', 'dist'),
      serveRoot: '/v2',
    }),

    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client'),
    }),

    // Global Rate Limiting: 300 requests per minute per IP. Effective only now
    // that `trust proxy` is set (see main.ts) — otherwise every client shares
    // the proxy's single IP bucket. Generous enough for SPA bursts; expensive
    // LLM routes should add a stricter per-route @Throttle on top.
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 300,
      },
    ]),
    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        if (process.env.NODE_ENV === 'test') {
          return testTypeOrmConfig;
        }
        const dbConfig = configService.get('database');
        // Schema changes go through migrations ONLY (migrationsRun below).
        // `synchronize` stays OFF by default and is opt-in via DB_SYNCHRONIZE=true
        // for a deliberate one-off local sync — but is force-disabled whenever the
        // app looks like production, so a stray env var can never auto-ALTER the
        // live schema on boot. Note APP_ENV is 'production' in prod (not 'prod'),
        // so we accept both spellings plus NODE_ENV.
        const appEnv = configService.get<string>('env');
        const isProduction =
          appEnv === 'prod' ||
          appEnv === 'production' ||
          process.env.NODE_ENV === 'production';
        const synchronize =
          !isProduction && process.env.DB_SYNCHRONIZE === 'true';
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
          synchronize,
          migrationsRun: true, // Always run migrations to ensure schema consistency
          migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
          connectTimeoutMS: 10000,
          ssl: (() => {
            if (process.env.DB_SSL === 'false') return false;
            const sslRequired =
              (dbConfig.url && dbConfig.url.includes('sslmode=require')) ||
              process.env.DB_SSL === 'true';
            if (!sslRequired) return false;
            // Verify the server certificate when a CA bundle is provided, or
            // when explicitly opted in via DB_SSL_REJECT_UNAUTHORIZED=true.
            // We default to permissive only as a fallback for managed providers
            // that present self-signed chains, but it can now be locked down
            // without code changes.
            const ca = process.env.DB_SSL_CA;
            const rejectUnauthorized =
              process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' || !!ca;
            return ca ? { rejectUnauthorized, ca } : { rejectUnauthorized };
          })(),
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
    ProxyModule,
    NotificationsModule,
    PortfolioModule,
    YahooFinanceModule,
    TickerRequestsModule,
    CurrencyModule,
    PriceAlertsModule,
    WebPushModule,
    McpToolsModule,
  ],
  controllers: [],
  providers: [
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

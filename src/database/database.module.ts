import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        const isTest = process.env.NODE_ENV === 'test';

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
          synchronize: isTest || dbConfig.synchronize,
          migrationsRun: !isTest,
          migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
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
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

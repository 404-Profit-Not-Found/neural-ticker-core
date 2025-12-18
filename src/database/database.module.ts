import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const env = configService.get<string>('env');
        const nodeEnv = process.env.NODE_ENV;
        const isProduction = env === 'prod' || nodeEnv === 'production';
        // Temporarily enable synchronize to add is_hidden column, then revert
        const shouldSync =
          process.env.DB_SYNCHRONIZE === 'true' || !isProduction;
        console.log(
          `[Database] env=${env}, NODE_ENV=${nodeEnv}, isProduction=${isProduction}, synchronize=${shouldSync}`,
        );
        return {
          type: 'postgres',
          url: configService.get<string>('database.url'),
          autoLoadEntities: true,
          synchronize: shouldSync,
          migrationsRun: true,
          migrations: [__dirname + '/../migrations/*{.ts,.js}'],
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}

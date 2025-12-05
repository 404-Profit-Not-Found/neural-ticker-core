import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FinnhubService } from './finnhub.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        baseURL: configService.get<string>('finnhub.baseUrl'),
        timeout: (configService.get<number>('http.readTimeout') || 10) * 1000,
        headers: {
          'X-Finnhub-Token': configService.get<string>('finnhub.apiKey'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [FinnhubService],
  exports: [FinnhubService],
})
export class FinnhubModule {}

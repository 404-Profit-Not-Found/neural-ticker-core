import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmService } from './llm.service';
import { LlmBudgetService } from './llm-budget.service';
import { LlmDailyUsage } from './entities/llm-daily-usage.entity';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([LlmDailyUsage])],
  providers: [LlmService, LlmBudgetService, OpenAiProvider, GeminiProvider],
  exports: [LlmService, LlmBudgetService],
})
export class LlmModule {}

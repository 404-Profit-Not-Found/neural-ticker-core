import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm.service';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';

@Module({
  imports: [ConfigModule],
  providers: [LlmService, OpenAiProvider, GeminiProvider],
  exports: [LlmService],
})
export class LlmModule {}

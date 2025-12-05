import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ILlmProvider, ResearchPrompt, ResearchResult } from '../llm.types';

@Injectable()
export class OpenAiProvider implements ILlmProvider {
  private readonly logger = new Logger(OpenAiProvider.name);
  private client: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.get<string>('openai.apiKey'),
      baseURL: this.configService.get<string>('openai.baseUrl'),
    });
  }

  async generate(prompt: ResearchPrompt): Promise<ResearchResult> {
    const tieredModel = this.resolveModel(prompt.quality);
    const contextStr =
      typeof prompt.numericContext === 'string'
        ? prompt.numericContext
        : JSON.stringify(prompt.numericContext);

    const systemPrompt = `You are a financial analyst.
    Ground your answer in the provided numeric context ONLY.
    Context: ${contextStr}`;

    try {
      const response = await this.client.chat.completions.create({
        model: tieredModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt.question },
        ],
        max_tokens: prompt.maxTokens || 1000,
      });

      const choice = response.choices[0];
      return {
        provider: 'openai',
        models: [tieredModel],
        answerMarkdown: choice.message.content || '',
        tokensIn: response.usage?.prompt_tokens,
        tokensOut: response.usage?.completion_tokens,
      };
    } catch (err) {
      this.logger.error(`OpenAI call failed: ${err.message}`);
      throw err;
    }
  }

  private resolveModel(
    quality: 'low' | 'medium' | 'high' | 'deep' = 'medium',
  ): string {
    const models = this.configService.get('openai.models');
    return models[quality] || 'gpt-4o';
  }
}

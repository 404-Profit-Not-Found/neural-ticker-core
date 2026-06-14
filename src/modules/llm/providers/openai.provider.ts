import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ILlmProvider, ResearchPrompt, ResearchResult } from '../llm.types';
import { getErrorMessage } from '../../../utils/error.util';

@Injectable()
export class OpenAiProvider implements ILlmProvider {
  private readonly logger = new Logger(OpenAiProvider.name);
  private client: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.get<string>('openai.apiKey'),
      baseURL: this.configService.get<string>('openai.baseUrl'),
      // Bound every request: the SDK retries transient failures (429/5xx/
      // connection errors) with exponential backoff up to maxRetries, and
      // aborts any single attempt that exceeds timeout. Without these a hung
      // upstream stalls the whole research pipeline indefinitely.
      maxRetries: this.configService.get<number>('openai.maxRetries') ?? 2,
      timeout: this.configService.get<number>('openai.timeoutMs') ?? 60_000,
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
        max_completion_tokens: prompt.maxTokens || 1000,
      });

      const choice = response.choices?.[0];
      if (!choice) {
        throw new Error(
          `OpenAI returned no choices for model ${tieredModel}` +
            (response.usage ? '' : ' (empty response)'),
        );
      }

      return {
        provider: 'openai',
        models: [tieredModel],
        answerMarkdown: choice.message?.content || '',
        tokensIn: response.usage?.prompt_tokens,
        tokensOut: response.usage?.completion_tokens,
      };
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        this.logger.error(
          `OpenAI API error (status=${err.status ?? 'n/a'}, type=${
            err.type ?? 'n/a'
          }, code=${err.code ?? 'n/a'}): ${err.message}`,
        );
      } else {
        this.logger.error(`OpenAI call failed: ${getErrorMessage(err)}`);
      }
      throw err;
    }
  }

  private resolveModel(quality?: string): string {
    const models = this.configService.get('openai.models');
    const key = quality && models[quality] ? quality : 'medium';
    return models[key] || 'gpt-4o';
  }
}

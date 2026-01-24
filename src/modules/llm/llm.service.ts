import { Injectable, BadRequestException } from '@nestjs/common';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { ResearchPrompt, ResearchResult, QualityTier } from './llm.types';

import { jsonToToon } from 'toon-parser';

@Injectable()
export class LlmService {
  constructor(
    private readonly openAiProvider: OpenAiProvider,
    private readonly geminiProvider: GeminiProvider,
  ) {}

  async generateResearch(prompt: ResearchPrompt): Promise<ResearchResult> {
    const provider = prompt.provider || 'openai';

    // Optimize context tokens using Toon Parser
    const optimizedPrompt = { ...prompt };
    if (
      optimizedPrompt.numericContext &&
      typeof optimizedPrompt.numericContext === 'object'
    ) {
      try {
        // Sanitize: Toon Parser crashes on Date objects/Functions.
        // JSON.stringify converts Dates to strings, and strips functions.
        const sanitized = JSON.parse(
          JSON.stringify(optimizedPrompt.numericContext),
        );
        optimizedPrompt.numericContext = jsonToToon(sanitized);
      } catch (e) {
        // Fallback to original if parsing fails
        console.warn('Toon parsing failed, using original context', e);
      }
    }

    switch (provider) {
      case 'openai':
        return this.openAiProvider.generate(optimizedPrompt);
      case 'gemini':
        return this.geminiProvider.generate(optimizedPrompt);
      case 'ensemble': {
        // Simple ensemble: run both, return combined.
        const [openaiRes, geminiRes] = await Promise.allSettled([
          this.openAiProvider.generate(optimizedPrompt),
          this.geminiProvider.generate(optimizedPrompt),
        ]);

        const answerParts = [];
        const models = [];
        let tokensIn = 0;
        let tokensOut = 0;

        if (openaiRes.status === 'fulfilled') {
          answerParts.push(
            `### OpenAI (${openaiRes.value.models.join(', ')})\n${openaiRes.value.answerMarkdown}`,
          );
          models.push(...openaiRes.value.models);
          tokensIn += openaiRes.value.tokensIn || 0;
          tokensOut += openaiRes.value.tokensOut || 0;
        }
        if (geminiRes.status === 'fulfilled') {
          answerParts.push(
            `### Gemini (${geminiRes.value.models.join(', ')})\n${geminiRes.value.answerMarkdown}`,
          );
          models.push(...geminiRes.value.models);
        }

        if (answerParts.length === 0) {
          throw new Error('All ensemble providers failed');
        }

        return {
          provider: 'ensemble',
          models,
          answerMarkdown: answerParts.join('\n\n---\n\n'),
          tokensIn,
          tokensOut,
        };
      }
      default:
        throw new BadRequestException(`Unknown provider: ${provider as any}`);
    }
  }

  private resolveModelKey(key: string): {
    provider: 'openai' | 'gemini' | 'ensemble';
    quality: QualityTier;
  } {
    const k = key.toLowerCase();

    if (k === 'gemini-2.5-flash-lite')
      return { provider: 'gemini', quality: 'low' };
    if (k === 'gemini-3-flash-preview' || k === 'gemini')
      return { provider: 'gemini', quality: 'medium' };
    if (k === 'gemini-3-pro')
      return { provider: 'gemini', quality: 'deep' };

    if (k === 'gpt-4.1-mini') return { provider: 'openai', quality: 'medium' };
    if (k === 'gpt-5.1' || k === 'openai')
      return { provider: 'openai', quality: 'deep' };

    if (k === 'ensemble') return { provider: 'ensemble', quality: 'deep' };

    // Default fallback
    return { provider: 'gemini', quality: 'medium' };
  }

  async generateText(
    promptText: string,
    modelOrProvider: string = 'gemini',
  ): Promise<string> {
    const resolved = this.resolveModelKey(modelOrProvider);
    const result = await this.generateResearch({
      question: promptText,
      tickers: [],
      numericContext: {},
      style: 'concise',
      provider: resolved.provider,
      quality: resolved.quality,
    });
    return result.answerMarkdown;
  }
}

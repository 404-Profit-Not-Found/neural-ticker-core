import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { asLlmUnavailable } from './llm-unavailable.exception';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { ResearchPrompt, ResearchResult, QualityTier } from './llm.types';

import { jsonToToon } from 'toon-parser';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly openAiProvider: OpenAiProvider,
    private readonly geminiProvider: GeminiProvider,
  ) {}

  /**
   * Every LLM call in the app goes through here. A failure that means "no LLM
   * answer can be had right now" — no key, quota used up, provider down — is
   * turned into LlmUnavailableException (a stable 503 `LLM_UNAVAILABLE`, with
   * none of the provider's error text); anything else is rethrown untouched.
   */
  async generateResearch(prompt: ResearchPrompt): Promise<ResearchResult> {
    try {
      return await this.dispatch(prompt);
    } catch (error) {
      const unavailable = asLlmUnavailable(error);
      if (!unavailable) throw error;
      // The provider has already logged its own detail; here only the verdict.
      this.logger.warn(
        `LLM unavailable (${unavailable.reason}) — provider ${prompt.provider || 'openai'}, tier ${prompt.quality ?? 'default'}`,
      );
      throw unavailable;
    }
  }

  private async dispatch(prompt: ResearchPrompt): Promise<ResearchResult> {
    const provider = prompt.provider || 'openai';

    // "Free-only" means no billed spend at all. Gemini honours it by staying
    // on the free key; OpenAI has no free tier, so a free-only call must not
    // reach it (or the ensemble, which includes it).
    if (prompt.freeOnly === true && provider !== 'gemini') {
      throw new BadRequestException(
        `A free-only LLM call cannot use the billed provider "${provider}"`,
      );
    }

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
          tokensIn += geminiRes.value.tokensIn || 0;
          tokensOut += geminiRes.value.tokensOut || 0;
        }

        if (answerParts.length === 0) {
          // Both failed. If either did because the LLM is unavailable, say
          // that; otherwise it is a failure of ours.
          for (const res of [openaiRes, geminiRes]) {
            const unavailable =
              res.status === 'rejected' ? asLlmUnavailable(res.reason) : null;
            if (unavailable) throw unavailable;
          }
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

    if (k === 'gemini-2.5-flash-lite' || k === 'gemini-3.5-flash-lite')
      return { provider: 'gemini', quality: 'low' };
    if (
      k === 'gemini-2.5-flash' ||
      k === 'gemini-3-flash-preview' ||
      k === 'gemini-3.8-flash' ||
      k === 'gemini-3.5-flash' ||
      k === 'gemini'
    )
      return { provider: 'gemini', quality: 'medium' };
    if (
      k === 'gemini-3-pro-preview' ||
      k === 'gemini-3-pro' ||
      k === 'gemini-3.1-pro-preview' ||
      k === 'gemini-3.1-pro'
    )
      return { provider: 'gemini', quality: 'deep' };
    if (k === 'gemini-3.1-flash-lite')
      return { provider: 'gemini', quality: 'cron' };

    // Gemma models (free tier, high RPD)
    if (k === 'gemma-4-26b-a4b-it' || k === 'gemma-4-26b')
      return { provider: 'gemini', quality: 'summary' };
    if (k === 'gemma-4-31b-it' || k === 'gemma-4-31b')
      return { provider: 'gemini', quality: 'recommendation' };

    if (k === 'gpt-4.1-mini') return { provider: 'openai', quality: 'medium' };
    if (k === 'gpt-5.1' || k === 'openai')
      return { provider: 'openai', quality: 'deep' };

    if (k === 'ensemble') return { provider: 'ensemble', quality: 'deep' };

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

import { Injectable, BadRequestException } from '@nestjs/common';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { ResearchPrompt, ResearchResult } from './llm.types';

@Injectable()
export class LlmService {
  constructor(
    private readonly openAiProvider: OpenAiProvider,
    private readonly geminiProvider: GeminiProvider,
  ) {}

  async generateResearch(prompt: ResearchPrompt): Promise<ResearchResult> {
    const provider = prompt.provider || 'openai';

    switch (provider) {
      case 'openai':
        return this.openAiProvider.generate(prompt);
      case 'gemini':
        return this.geminiProvider.generate(prompt);
      case 'ensemble':
        // Simple ensemble: run both, return combined.
        // For now, let's just run OpenAI as primary and maybe append if we had logic.
        // Or run both and combine.
        const [openaiRes, geminiRes] = await Promise.allSettled([
          this.openAiProvider.generate(prompt),
          this.geminiProvider.generate(prompt)
        ]);
        
        const answerParts = [];
        const models = [];
        let tokensIn = 0;
        let tokensOut = 0;

        if (openaiRes.status === 'fulfilled') {
            answerParts.push(`### OpenAI (${openaiRes.value.models.join(', ')})\n${openaiRes.value.answerMarkdown}`);
            models.push(...openaiRes.value.models);
            tokensIn += openaiRes.value.tokensIn || 0;
            tokensOut += openaiRes.value.tokensOut || 0;
        }
        if (geminiRes.status === 'fulfilled') {
            answerParts.push(`### Gemini (${geminiRes.value.models.join(', ')})\n${geminiRes.value.answerMarkdown}`);
            models.push(...geminiRes.value.models);
        }

        if (answerParts.length === 0) {
            throw new Error("All ensemble providers failed");
        }

        return {
            provider: 'ensemble',
            models,
            answerMarkdown: answerParts.join('\n\n---\n\n'),
            tokensIn,
            tokensOut,
        };
      default:
        throw new BadRequestException(`Unknown provider: ${provider}`);
    }
  }
}

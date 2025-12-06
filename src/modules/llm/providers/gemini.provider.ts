import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { ILlmProvider, ResearchPrompt, ResearchResult } from '../llm.types';

@Injectable()
export class GeminiProvider implements ILlmProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private genAI: GoogleGenerativeAI;

  constructor(private readonly configService: ConfigService) {
    // Note: The @google/genai SDK usage here assumes standard initialization.
    // Spec said @google/genai.
    const apiKey = this.configService.get<string>('gemini.apiKey');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  async generate(prompt: ResearchPrompt): Promise<ResearchResult> {
    if (!this.genAI) {
      throw new Error('Gemini API Key not configured');
    }

    const modelName = this.resolveModel(prompt.quality);
    const model: GenerativeModel = this.genAI.getGenerativeModel({
      model: modelName,
    });

    const contextStr =
      typeof prompt.numericContext === 'string'
        ? prompt.numericContext
        : JSON.stringify(prompt.numericContext);

    const systemPrompt = `You are a financial analyst.
    Ground your answer in the provided numeric context ONLY.
    Context: ${contextStr}`;

    const fullPrompt = `${systemPrompt}\n\nQuestion: ${prompt.question}`;

    try {
      const result = await model.generateContent(fullPrompt);
      const response = result.response;

      return {
        provider: 'gemini',
        models: [modelName],
        answerMarkdown: response.text(),
        // Usage metadata might differ in SDK versions
      };
    } catch (err) {
      this.logger.error(`Gemini call failed: ${err.message}`);
      throw err;
    }
  }

  private resolveModel(
    quality: 'low' | 'medium' | 'high' | 'deep' = 'medium',
  ): string {
    const models = this.configService.get('gemini.models');
    if (quality === 'deep') {
      // Fallback to high for Gemini as per spec (only 3 tiers) or use high
      return models['high'] || 'gemini-1.5-pro';
    }
    return models[quality] || 'gemini-1.5-flash';
  }
}

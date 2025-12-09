import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenAI,
  Tool,
  ThinkingConfig,
  GenerateContentConfig,
  ThinkingLevel,
} from '@google/genai'; // NEW SDK
import { ILlmProvider, ResearchPrompt, ResearchResult } from '../llm.types';

@Injectable()
export class GeminiProvider implements ILlmProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private client: GoogleGenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('gemini.apiKey');
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  async generate(prompt: ResearchPrompt): Promise<ResearchResult> {
    const apiKey =
      prompt.apiKey || this.configService.get<string>('gemini.apiKey');
    if (!apiKey) throw new Error('Gemini API Key not configured');

    // Re-initialize client if a custom key is provided (or rely on singleton)
    const client = prompt.apiKey ? new GoogleGenAI({ apiKey }) : this.client;

    // Resolve model and determine if it supports "Thinking"
    const modelName = this.resolveModel(prompt.quality);
    const isThinkingModel =
      modelName.includes('thinking') || modelName.includes('gemini-3');

    // 1. Configure Tools (Google Search)
    // In the new SDK, tools are simplified.
    const tools: Tool[] = [
      { googleSearch: {} }, // Native Grounding
    ];

    // 2. Configure Thinking (The tricky part)
    let thinkingConfig: ThinkingConfig | undefined;

    if (isThinkingModel) {
      if (modelName.includes('gemini-3')) {
        // Gemini 3 uses "Level" (Low/High)
        thinkingConfig = {
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.HIGH,
        };
      } else {
        // Gemini 2.5 uses "Budget" (Token Count)
        thinkingConfig = {
          includeThoughts: true,
          thinkingBudget: 1024, // Adjust based on complexity
        };
      }
    }

    const config: GenerateContentConfig = {
      tools: tools,
      thinkingConfig: thinkingConfig,
      systemInstruction: `You are a financial analyst performing deep research. 
      Context: ${JSON.stringify(prompt.numericContext)}`,
    };

    try {
      const result = await client.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt.question }] }],
        config: config,
      });

      // 3. Extract Grounding Metadata (New SDK format)
      // The new SDK returns cleaner metadata objects
      const groundingMeta = result.candidates?.[0]?.groundingMetadata;

      // 4. Extract Thoughts (if available)
      // Thoughts are often in the first candidate part if includeThoughts is true
      const thoughts = result.candidates?.[0]?.content?.parts?.filter(
        (p) => p.thought,
      );

      return {
        provider: 'gemini',
        models: [modelName],
        answerMarkdown: result.text || '', // Getter, not method
        groundingMetadata: groundingMeta,
        // You might want to return thoughts separately for debugging
        thoughts: thoughts ? JSON.stringify(thoughts) : undefined,
      };
    } catch (err) {
      this.logger.error(`Gemini call failed: ${err.message}`, err.stack);
      throw err;
    }
  }

  private resolveModel(quality?: string): string {
    // Official Model IDs as of Late 2025:
    if (quality === 'deep') return 'gemini-3-pro-preview';
    if (quality === 'high') return 'gemini-2.0-flash-thinking-exp';
    return 'gemini-2.0-flash';
  }
}

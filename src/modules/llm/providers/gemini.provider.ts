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

    let modelName = this.resolveModel(prompt.quality);
    const isThinkingModel =
      modelName.includes('thinking') || modelName.includes('pro'); // simplified check

    // 1. Configure Tools (Google Search)
    const tools: Tool[] = [
      { googleSearch: {} }, // Native Grounding
    ];

    // 2. Configure Thinking
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
          thinkingBudget: 1024, 
        };
      }
    }

    const config: GenerateContentConfig = {
      tools: tools,
      thinkingConfig: thinkingConfig,
      systemInstruction: `You are a financial analyst performing deep research. 
      CRITICAL INSTRUCTION: You have access to a "Google Search" tool. You MUST use it to find the latest news, earnings reports, and market sentiment for the requested tickers. Do not rely solely on your internal knowledge.
      
      Context: ${JSON.stringify(prompt.numericContext)}`,
    };

    // Retry & Fallback Logic
    let attempts = 0;
    const maxAttempts = 3;
    let currentModel = modelName;

    while (attempts < maxAttempts * 2) { // Allow attempts for primary + fallback
      try {
        attempts++;
        this.logger.log(`Gemini Request [Attempt ${attempts}] using ${currentModel}`);
        
        const result = await client.models.generateContent({
          model: currentModel,
          contents: [{ role: 'user', parts: [{ text: prompt.question }] }],
          config: config,
        });

        // 3. Extract Grounding Metadata
        const groundingMeta = result.candidates?.[0]?.groundingMetadata;

        // 4. Extract Thoughts
        const thoughts = result.candidates?.[0]?.content?.parts?.filter(
          (p) => p.thought,
        );

        return {
          provider: 'gemini',
          models: [currentModel],
          answerMarkdown: result.text || '',
          groundingMetadata: groundingMeta,
          thoughts: thoughts ? JSON.stringify(thoughts) : undefined,
          tokensIn: result.usageMetadata?.promptTokenCount,
          tokensOut: result.usageMetadata?.candidatesTokenCount,
        };

      } catch (err: any) {
        const isQuotaError = err.status === 429 || err.code === 429 || err.message?.includes('429') || err.message?.includes('quota');
        
        if (isQuotaError && attempts < maxAttempts) {
           // Retry same model
           this.logger.warn(`Gemini 429 Quota Exceeded for ${currentModel}. Retrying in 5s...`);
           await new Promise(r => setTimeout(r, 5000));
           continue;
        } 
        
        if (isQuotaError && attempts >= maxAttempts && currentModel !== 'gemini-3-flash-preview') {
            // Fallback to Flash
            this.logger.warn(`Gemini 3 Pro Quota Exhausted. Falling back to Gemini 3 Flash.`);
            currentModel = 'gemini-3-flash-preview';
            attempts = 0; // Reset attempts for the new model
            // Adjust thinking config for Flash if needed (Flash supports thinking via same config structure usually, or disable if not supported)
            // Assuming Flash Preview supports thinking or we keep it as is.
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        this.logger.error(`Gemini call failed: ${err.message}`, err.stack);
        throw err;
      }
    }
    throw new Error('Gemini request failed after retries');
  }

  private resolveModel(quality?: string): string {
    const models = this.configService.get('gemini.models');
    
    // Default to 'medium' if quality is not specified
    if (!quality) return models.medium || 'gemini-2.5-flash';

    // Map quality to config key
    switch (quality) {
      case 'deep':
        return models.deep || 'gemini-3.0-pro-deep';
      case 'high':
        // Fallback for 'high' if code still uses it, map to deep or medium? Map to deep as it was previously.
        return models.deep || 'gemini-3.0-pro-deep';
      case 'low':
        return models.low || 'gemini-3.0-low';
      case 'extraction':
        return models.extraction || 'gemini-3.0-low';
      case 'medium':
      default:
        return models.medium || 'gemini-2.5-flash';
    }
  }
}

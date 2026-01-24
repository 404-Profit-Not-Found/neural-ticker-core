import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenAI,
  Tool,
  ThinkingConfig,
  GenerateContentConfig,
} from '@google/genai'; // NEW SDK
import { ILlmProvider, ResearchPrompt, ResearchResult } from '../llm.types';

@Injectable()
export class GeminiProvider implements ILlmProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private client: GoogleGenAI;

  // Cost-effective models with Google Search grounding (no Gemini 3 Pro costs)
  // Cost-effective models with Google Search grounding
  private readonly defaultModels = {
    deep: 'gemini-3-pro',
    medium: 'gemini-3-flash-preview',
    low: 'gemini-2.5-flash-lite',
    extraction: 'gemini-2.5-flash-lite',
  };

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

    const modelName = this.resolveModel(prompt.quality);
    const isThinkingModel =
      modelName.includes('thinking') || modelName.includes('pro'); // simplified check

    // 1. Configure Tools (Google Search)
    const tools: Tool[] = [{ googleSearch: {} }]; // Native Grounding

    // 2. Configure Thinking (per SDK types: use thinkingBudget for depth control)
    let thinkingConfig: ThinkingConfig | undefined;

    if (isThinkingModel) {
      // Default thinking budget for pro/flash models
      thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: modelName.includes('pro') ? 4096 : 2048,
      };
    }

    const config: GenerateContentConfig = {
      tools: tools,
      thinkingConfig: thinkingConfig,
      systemInstruction: `You are a financial analyst performing deep research. 
      CRITICAL INSTRUCTION: You have access to a "Google Search" tool. You MUST use it to find the latest news, earnings reports, and market sentiment for the requested tickers. Do not rely solely on your internal knowledge. Gather all available information and resources including news, filings, and press releases, fundamentals, and market data.
      Context: ${JSON.stringify(prompt.numericContext)}`,
    };

    // Retry & Fallback Logic
    let attempts = 0;
    const maxAttempts = 3;
    let currentModel = modelName;

    // Branch for Deep Research Agent (Interactions API)
    if (currentModel === 'deep-research-pro-preview-12-2025') {
      try {
        this.logger.log(`Executing Deep Research Agent: ${currentModel}`);
        // Cast to any for v1beta interactions support
        const interactionStream = await (client as any).interactions.create({
          agent: currentModel,
          input: prompt.question,
          background: true,
          stream: true,
          agent_config: { thinking_summaries: 'auto' },
        });

        let fullText = '';
        const collectedThoughts: string[] = [];
        let collectedSources: any[] = [];

        for await (const chunk of interactionStream) {
          // 1. Thoughts
          if (
            chunk.delta?.type === 'thought_summary' ||
            chunk.delta?.part?.thought
          ) {
            const t = chunk.delta.text || chunk.delta.part?.thought;
            if (t) collectedThoughts.push(t);
          }
          // 2. Sources
          if (chunk.groundingMetadata?.groundingChunks) {
            collectedSources = collectedSources.concat(
              chunk.groundingMetadata.groundingChunks,
            );
          }
          // 3. Content
          if (chunk.delta?.type === 'text' || chunk.delta?.text) {
            fullText += chunk.delta.text || '';
          }
        }

        return {
          provider: 'gemini',
          models: [currentModel],
          answerMarkdown: fullText,
          groundingMetadata: { groundingChunks: collectedSources },
          thoughts: JSON.stringify(collectedThoughts),
          tokensIn: 0, // Not provided in stream easily
          tokensOut: 0,
        };
      } catch (err: any) {
        // If interaction fails, we might want to fall back or throw.
        // Given user strictness, we throw specific error.
        this.logger.error(`Deep Research Interaction Failed: ${err.message}`);
        throw err;
      }
    }

    // Fallback chain for 429 errors
    const fallbackChain: Record<string, string> = {
      'gemini-2.5-flash-lite': 'gemini-2.5-flash',
      'gemini-2.5-flash': 'gemini-3-flash-preview',
      'gemini-3-flash-preview': 'gemini-3-pro-preview', // Only available on Secondary (Billed)
    };

    let activeApiKey = apiKey;
    const secondaryApiKey = this.configService.get<string>('gemini.secondaryApiKey');
    let hasSwitchedToSecondary = false;
    let activeClient = client;

    // CRITICAL: gemini-3-pro is only available on the Secondary (Billed) Key
    // If it's the requested model, we failover immediately to avoid the unavoidable 429 on Free Key.
    if (currentModel === 'gemini-3-pro-preview' && !hasSwitchedToSecondary && secondaryApiKey) {
        this.logger.warn(`gemini-3-pro-preview is not available on Free Key. Initiating Key Failoverrequested. Switching to SECONDARY API KEY (Billed) immediately.`);
        activeApiKey = secondaryApiKey;
        activeClient = new GoogleGenAI({ apiKey: activeApiKey });
        hasSwitchedToSecondary = true;
    }

    // Standard GenerateContent Flow
    while (attempts < maxAttempts * 4) { // Increased buffer for multiple tiers and keys
      try {
        attempts++;
        this.logger.log(
          `Gemini Request [Attempt ${attempts}] using ${currentModel} (Key: ${hasSwitchedToSecondary ? 'Secondary' : 'Primary'})`,
        );

        const result = await activeClient.models.generateContent({
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
        const isQuotaError =
          err.status === 429 ||
          err.code === 429 ||
          err.message?.includes('429') ||
          err.message?.includes('quota');

        if (isQuotaError && attempts < maxAttempts * 4) {
          let nextModel: string | undefined = fallbackChain[currentModel];

          // CRITICAL: gemini-3-pro-preview is only available on the Secondary (Billed) Key
          if (nextModel === 'gemini-3-pro-preview' && !hasSwitchedToSecondary) {
              this.logger.warn(`gemini-3-pro-preview is not available on Free Key. Initiating Key Failover.`);
              nextModel = undefined; // Force key failover to re-start chain on Secondary
          }

          if (nextModel) {
             this.logger.warn(
               `Gemini 429 Quota Exceeded for ${currentModel}. Stepping up to ${nextModel}...`,
             );
             currentModel = nextModel;
             continue; // Try next model on current key
          } 
          
          // No next model in chain for this key, try switching to secondary key
          if (secondaryApiKey && !hasSwitchedToSecondary) {
             this.logger.warn(
               `Gemini Quota fully exhausted on Primary Key. Switching to SECONDARY API KEY and restarting model cycle...`,
             );
             activeApiKey = secondaryApiKey;
             activeClient = new GoogleGenAI({ apiKey: activeApiKey });
             currentModel = modelName; // Reset to original requested model (e.g. Lite)
             hasSwitchedToSecondary = true;
             continue; // Try original model on secondary key
          }

          // If no fallback and no secondary key remains, wait and retry current model
          this.logger.warn(
            `Gemini 429 Quota Exceeded for ${currentModel}. No further keys or models available. Retrying in 5s...`,
          );
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        this.logger.error(`Gemini call failed: ${err.message}`, err.stack);
        throw err;
      }
    }
    throw new Error('Gemini request failed after retries');
  }

  private resolveModel(quality?: string): string {
    const models = {
      ...this.defaultModels,
      ...(this.configService.get<Record<string, string>>('gemini.models') ||
        {}),
    };

    // Default to 'medium' if quality is not specified
    if (!quality) return models.medium;

    // Map quality to config key
    switch (quality) {
      case 'deep':
        return models.deep;
      case 'high':
        // Fallback for 'high' if code still uses it, map to deep or medium? Map to deep as it was previously.
        return models.deep;
      case 'low':
        return models.low;
      case 'extraction':
        return models.extraction;
      case 'medium':
      default:
        return models.medium;
    }
  }
}

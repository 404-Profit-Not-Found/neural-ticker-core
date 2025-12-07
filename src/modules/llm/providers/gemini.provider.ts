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
    // 1. Resolve API Key (Prompt > Config)
    const apiKey = prompt.apiKey || this.configService.get<string>('gemini.apiKey');
    if (!apiKey) {
      throw new Error('Gemini API Key not configured');
    }

    // 2. Initialize Gemini 3 Pro (or use cached if same key?)
    // Creating new instance per request to support dynamic keys is safest.
    const genAI = new GoogleGenerativeAI(apiKey);

    const modelName = this.resolveModel(prompt.quality);
    
    // 3. Configure Model with Thinking for 'deep'
    const isDeep = prompt.quality === 'deep' || prompt.quality === 'high';
    const modelParams: any = {
      model: modelName,
    };
    
    if (modelName.includes('gemini-3')) {
       // Gemini 3 Thinking + Search
       modelParams.tools = [{ googleSearch: {} }];
    }

    const model: GenerativeModel = genAI.getGenerativeModel(modelParams);

    // 4. Thinking Config
    const generationConfig: any = {};
    if (modelName.includes('gemini-3')) {
        generationConfig.thinkingLevel = isDeep ? 'high' : 'low';
    }

    const contextStr =
      typeof prompt.numericContext === 'string'
        ? prompt.numericContext
        : JSON.stringify(prompt.numericContext);

    const systemPrompt = `You are a financial analyst performing deep research.
    Ground your answer in the provided numeric context AND external Google Search results.
    Context: ${contextStr}`;

    const fullPrompt = `${systemPrompt}\n\nQuestion: ${prompt.question}`;

    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig,
      });
      const response = result.response;
      
      // Log thoughts if available (debug)
      // const candidates = response.candidates;

      return {
        provider: 'gemini',
        models: [modelName],
        answerMarkdown: response.text(),
        groundingMetadata: response.candidates?.[0]?.groundingMetadata,
      };
    } catch (err) {
      this.logger.error(`Gemini call failed: ${err.message}`, err.stack);
      throw err;
    }
  }

  private resolveModel(
    quality: 'low' | 'medium' | 'high' | 'deep' = 'medium',
  ): string {
    const models = this.configService.get('gemini.models');
    // For 'deep', prioritize Gemini 3 Pro
    if (quality === 'deep') {
      return 'gemini-3-pro-preview';
    }
    // Safe access for other keys
    return models?.[quality] || 'gemini-1.5-flash';
  }
}

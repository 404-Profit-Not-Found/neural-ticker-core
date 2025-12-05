export type QualityTier = 'low' | 'medium' | 'high' | 'deep';

export interface ResearchPrompt {
  question: string;
  tickers: string[];
  numericContext: unknown;
  style?: string;
  maxTokens?: number;
  quality?: QualityTier;
  provider?: 'openai' | 'gemini' | 'ensemble';
}

export interface ResearchResult {
  provider: 'openai' | 'gemini' | 'ensemble';
  models: string[];
  answerMarkdown: string;
  citations?: string[];
  tokensIn?: number;
  tokensOut?: number;
}

export interface ILlmProvider {
  generate(prompt: ResearchPrompt): Promise<ResearchResult>;
}

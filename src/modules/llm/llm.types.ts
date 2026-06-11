export type QualityTier =
  | 'low'
  | 'medium'
  | 'high'
  | 'deep'
  | 'extraction'
  | 'cron'
  | 'summary'
  | 'recommendation'
  | 'scoring';

export interface ResearchPrompt {
  question: string;
  tickers: string[];
  numericContext: unknown;
  style?: string;
  maxTokens?: number;
  quality?: QualityTier;
  provider?: 'openai' | 'gemini' | 'ensemble';
  apiKey?: string;
  /**
   * When true (implied for `quality: 'cron'`), the call must stay on the free
   * primary key: on a 429 it falls back across free models but NEVER escalates
   * to the billed secondary key. Used by background/cron research to protect
   * the free quota and guarantee zero billed spend.
   */
  freeOnly?: boolean;
}

export interface ResearchResult {
  provider: 'openai' | 'gemini' | 'ensemble';
  models: string[];
  answerMarkdown: string;
  citations?: string[];
  tokensIn?: number;
  tokensOut?: number;
  groundingMetadata?: any;
  thoughts?: string;
}

export interface ILlmProvider {
  generate(prompt: ResearchPrompt): Promise<ResearchResult>;
}

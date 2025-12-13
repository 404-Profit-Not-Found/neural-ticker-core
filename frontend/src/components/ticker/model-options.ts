export type ModelTier = 'low' | 'medium' | 'high' | 'deep';

export interface ModelOption {
    key: string;
    label: string;
    provider: 'gemini' | 'openai' | 'ensemble';
    quality: ModelTier;
    speed: string;
    accuracy: string;
    description: string;
    defaultQuestion?: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
    {
        key: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash',
        provider: 'gemini',
        quality: 'medium',
        speed: '≈8s',
        accuracy: 'Balanced',
        description: 'Blazing fast, ideal for regular updates and news.',
        defaultQuestion: 'Give me a concise but detailed analysis for {ticker}',
    },
    {
        key: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro',
        provider: 'gemini',
        quality: 'deep',
        speed: '≈22s',
        accuracy: 'Maximum Depth',
        description: 'Optimal for deep research and complex reasoning tasks.',
        defaultQuestion: 'Conduct a comprehensive deep dive into {ticker}, analyzing risks, catalysts, and competitive landscape.',
    },
    {
        key: 'gpt-5.1',
        label: 'GPT-5.1',
        provider: 'openai',
        quality: 'deep',
        speed: '≈18s',
        accuracy: 'High precision',
        description: 'OpenAI flagship for detailed thesis generation.',
        defaultQuestion: 'Generate a high-precision research brief for {ticker}.',
    },
    {
        key: 'gpt-4.1-mini',
        label: 'GPT-4.1 Mini',
        provider: 'openai',
        quality: 'medium',
        speed: '≈11s',
        accuracy: 'Balanced',
        description: 'Balanced speed vs. thoroughness for routine updates.',
        defaultQuestion: 'Summarize the latest investment view on {ticker}.',
    },
];

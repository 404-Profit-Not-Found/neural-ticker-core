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
        key: 'gemini-2.5-flash-lite',
        label: 'Gemini 2.5 Flash Lite',
        provider: 'gemini',
        quality: 'low',
        speed: '≈3s',
        accuracy: 'Efficient',
        description: 'Ultra-fast and cost-effective for quick summaries.',
        defaultQuestion: 'Give me a quick summary for {ticker}',
    },
    {
        key: 'gemini-3-flash-preview',
        label: 'Gemini 3 Flash',
        provider: 'gemini',
        quality: 'medium',
        speed: '≈6s',
        accuracy: 'Balanced',
        description: 'Next-gen intelligence, ideal for regular updates and news.',
        defaultQuestion: 'Give me a concise but detailed analysis for {ticker}',
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
    {
        key: 'gemini-3-pro-preview',
        label: 'Gemini 3 Pro',
        provider: 'gemini',
        quality: 'deep',
        speed: '≈18s',
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
];

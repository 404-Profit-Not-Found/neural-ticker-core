import { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Brain, Zap, Target, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

type ModelTier = 'low' | 'medium' | 'high' | 'deep';

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
        quality: 'medium',
        speed: '≈9s',
        accuracy: 'High detail',
        description: 'Best value for quick, detailed reads.',
        defaultQuestion: 'Give me a concise but detailed analysis for {ticker}',
    },
    {
        key: 'gemini-2.0-flash-exp',
        label: 'Gemini 2.0 Flash Exp',
        provider: 'gemini',
        quality: 'deep',
        speed: '≈18s',
        accuracy: 'Max depth',
        description: 'Deep dive with expansive context and reasoning.',
        defaultQuestion: 'Deep dive into {ticker}, highlighting risks, catalysts, and valuation.',
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

interface RunAnalysisDialogProps {
    onTrigger: (options: { provider: 'gemini' | 'openai' | 'ensemble'; quality: ModelTier; question?: string; modelKey: string }) => void;
    isAnalyzing: boolean;
    defaultTicker?: string;
    trigger?: React.ReactNode;
}

export function RunAnalysisDialog({ onTrigger, isAnalyzing, defaultTicker, trigger }: RunAnalysisDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedModelKey, setSelectedModelKey] = useState<string>(MODEL_OPTIONS[0].key);
    const [customQuestion, setCustomQuestion] = useState('');
    const [showCustomQuestion, setShowCustomQuestion] = useState(false);

    const selectedModel = useMemo(
        () => MODEL_OPTIONS.find((m) => m.key === selectedModelKey) || MODEL_OPTIONS[0],
        [selectedModelKey]
    );

    const handleRun = () => {
        const questionTemplate = selectedModel.defaultQuestion;
        let question = customQuestion;

        if (!question && questionTemplate && defaultTicker) {
            question = questionTemplate.replace('{ticker}', defaultTicker);
        }

        onTrigger({
            provider: selectedModel.provider,
            quality: selectedModel.quality,
            question: question || undefined,
            modelKey: selectedModel.key,
        });
        setIsOpen(false);
    };

    return (
        <>
            <div onClick={() => !isAnalyzing && setIsOpen(true)} className="inline-flex cursor-pointer">
                {trigger || (
                    <Button size="sm" className="gap-2">
                        {isAnalyzing ? <Loader2 className="animate-spin w-4 h-4" /> : <Brain size={14} />}
                        Run Analysis
                    </Button>
                )}
            </div>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-primary" />
                        Start AI Analysis
                    </DialogTitle>
                    <DialogDescription>
                        Select an AI model to generate a comprehensive research report for <span className="font-bold text-foreground">{defaultTicker}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {MODEL_OPTIONS.map((model) => (
                            <div
                                key={model.key}
                                className={cn(
                                    "relative flex flex-col gap-2 rounded-xl border p-4 cursor-pointer transition-all hover:bg-muted/50",
                                    selectedModelKey === model.key
                                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                        : "border-border"
                                )}
                                onClick={() => setSelectedModelKey(model.key)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="font-semibold text-sm">{model.label}</div>
                                    {selectedModelKey === model.key && (
                                        <div className="h-2 w-2 rounded-full bg-primary absolute top-4 right-4" />
                                    )}
                                </div>

                                <div className="text-xs text-muted-foreground leading-relaxed min-h-[40px]">
                                    {model.description}
                                </div>

                                <div className="flex items-center gap-2 mt-auto pt-2">
                                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-1 font-normal">
                                        <Zap size={10} /> {model.speed}
                                    </Badge>
                                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-1 font-normal">
                                        <Target size={10} /> {model.accuracy}
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowCustomQuestion(!showCustomQuestion)}
                                className="h-auto p-0 text-xs text-muted-foreground hover:text-primary gap-1"
                            >
                                {showCustomQuestion ? "Hide custom instructions" : "Add custom instructions"}
                            </Button>
                        </div>

                        {showCustomQuestion && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                <Label htmlFor="question" className="text-xs">Custom Instructions (Optional)</Label>
                                <Textarea
                                    id="question"
                                    placeholder={`e.g. Focus on the recent earnings call and guidance...`}
                                    className="text-xs resize-none"
                                    rows={3}
                                    value={customQuestion}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCustomQuestion(e.target.value)}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button onClick={handleRun} disabled={isAnalyzing} className="min-w-[140px] gap-2">
                        {isAnalyzing ? <Loader2 className="animate-spin w-4 h-4" /> : <Brain size={14} />}
                        Run {selectedModel.label}
                    </Button>
                </DialogFooter>
            </Dialog>
        </>
    );
}

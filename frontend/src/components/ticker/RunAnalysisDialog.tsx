import { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Brain, Zap, Target, Loader2, Lock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { MODEL_OPTIONS, type ModelTier } from './model-options';

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

    const { user } = useAuth();
    const isPro = user?.tier === 'pro' || user?.role === 'admin';

    const getModelCost = (quality: ModelTier) => quality === 'deep' ? 5 : 1;

    // Reset selection if locked model was selected
    const handleModelSelect = (key: string) => {
        const model = MODEL_OPTIONS.find(m => m.key === key);
        if (model?.quality === 'deep' && !isPro) return;
        setSelectedModelKey(key);
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

                <div className="grid gap-4 py-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {MODEL_OPTIONS.map((model) => {
                            const isLocked = model.quality === 'deep' && !isPro;
                            const cost = getModelCost(model.quality);
                            return (
                                <div
                                    key={model.key}
                                    className={cn(
                                        "relative flex flex-col gap-1.5 rounded-lg border p-3 cursor-pointer transition-all",
                                        isLocked ? "opacity-60 bg-muted/20 cursor-not-allowed border-dashed" : "hover:bg-muted/50",
                                        selectedModelKey === model.key && !isLocked
                                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                            : "border-border"
                                    )}
                                    onClick={() => handleModelSelect(model.key)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="font-bold text-xs flex items-center gap-1.5">
                                            {model.label}
                                            {model.quality === 'deep' && (
                                                <Badge variant="default" className="h-4 px-1 text-[9px] bg-purple-600 hover:bg-purple-700 border-purple-500/50 text-white shadow-purple-500/20">
                                                    PRO
                                                </Badge>
                                            )}
                                        </div>
                                        {isLocked ? (
                                            <Lock size={12} className="text-muted-foreground" />
                                        ) : (
                                            selectedModelKey === model.key && (
                                                <div className="h-1.5 w-1.5 rounded-full bg-primary absolute top-3 right-3" />
                                            )
                                        )}
                                    </div>

                                    <div className="text-[10px] text-muted-foreground leading-snug line-clamp-2 min-h-[2.5em]">
                                        {model.description}
                                    </div>

                                    <div className="flex items-center gap-1.5 mt-auto pt-1">
                                        <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 font-normal">
                                            <Zap size={8} /> {model.speed}
                                        </Badge>
                                        <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 font-normal text-amber-500 bg-amber-500/10 border-amber-500/20">
                                            ⚡ {cost} Credit{cost > 1 ? 's' : ''}
                                        </Badge>
                                    </div>
                                    
                                    {isLocked && (
                                         <div className="absolute inset-x-0 bottom-2 text-center">
                                            <span className="text-[10px] font-bold text-purple-400 bg-background/80 px-2 py-0.5 rounded shadow-sm border border-purple-500/20">
                                                Upgrade to Unlock
                                            </span>
                                         </div>
                                    )}
                                </div>
                            );
                        })}
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
                    <Button onClick={handleRun} disabled={isAnalyzing} 
                        className={cn(
                            "min-w-[140px] gap-2 shadow-md transition-all hover:scale-105 active:scale-95",
                            selectedModel.quality === 'deep' 
                                ? "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20" 
                                : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
                        )}
                    >
                        {isAnalyzing ? <Loader2 className="animate-spin w-4 h-4" /> : <Brain size={14} />}
                        Run {selectedModel.label}
                    </Button>
                </DialogFooter>
            </Dialog>
        </>
    );
}

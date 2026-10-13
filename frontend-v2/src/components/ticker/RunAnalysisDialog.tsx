import { cloneElement, isValidElement, useState, useMemo, type MouseEvent, type ReactElement } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Brain, Check, ChevronDown, Coins, Loader2, Lock, Timer } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { MODEL_OPTIONS, type ModelTier } from './model-options';

interface RunAnalysisDialogProps {
    onTrigger: (options: { provider: 'gemini' | 'openai' | 'ensemble'; quality: ModelTier; question?: string; modelKey: string }) => void;
    isAnalyzing: boolean;
    defaultTicker?: string;
    /** The element that opens the dialog (a button). */
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
            question = questionTemplate.replace(/{ticker}/g, () => defaultTicker);
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

    const getModelCost = (key: string, quality: ModelTier) => {
        if (key === 'gemini-3.5-flash-lite' || key === 'gemini-3.1-flash-lite') return 1;
        if (key === 'gemini-2.5-flash-lite') return 1;
        if (key === 'gemini-3.8-flash' || key === 'gemini-3.5-flash') return 2;
        if (key === 'gpt-4.1-mini') return 1;
        return quality === 'deep' ? 5 : 1;
    };

    // Reset selection if locked model was selected
    const handleModelSelect = (key: string) => {
        const model = MODEL_OPTIONS.find(m => m.key === key);
        if (model?.quality === 'deep' && !isPro) return;
        setSelectedModelKey(key);
    };

    const open = () => {
        if (!isAnalyzing) setIsOpen(true);
    };

    // The trigger stays the caller's own button: we only attach the click.
    const triggerNode = isValidElement(trigger) ? (
        cloneElement(trigger as ReactElement<{ onClick?: (e: MouseEvent<HTMLElement>) => void }>, {
            onClick: (e: MouseEvent<HTMLElement>) => {
                (trigger as ReactElement<{ onClick?: (e: MouseEvent<HTMLElement>) => void }>).props.onClick?.(e);
                open();
            },
        })
    ) : (
        <Button size="sm" className="gap-2" onClick={open} disabled={isAnalyzing}>
            {isAnalyzing ? <Loader2 className="animate-spin w-4 h-4" aria-hidden /> : <Brain size={14} aria-hidden />}
            Run Analysis
        </Button>
    );

    return (
        <>
            {triggerNode}

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-violet-500 dark:text-violet-400" aria-hidden />
                        Start AI analysis
                    </DialogTitle>
                    <DialogDescription>
                        Choose a model to write a research report for <span className="font-semibold text-foreground">{defaultTicker}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div role="radiogroup" aria-label="AI model" className="flex flex-col gap-2">
                    {MODEL_OPTIONS.map((model) => {
                        const isLocked = model.quality === 'deep' && !isPro;
                        const isSelected = selectedModelKey === model.key && !isLocked;
                        const cost = getModelCost(model.key, model.quality);
                        return (
                            <button
                                key={model.key}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                disabled={isLocked}
                                onClick={() => handleModelSelect(model.key)}
                                className={cn(
                                    "flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    isSelected ? "bg-signal/15" : "bg-muted hover:bg-muted/70",
                                    isLocked && "cursor-not-allowed opacity-60",
                                )}
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm",
                                        isSelected ? "bg-signal text-signal-foreground" : "bg-background",
                                    )}
                                >
                                    {isLocked ? <Lock size={11} className="text-muted-foreground" /> : isSelected ? <Check size={13} strokeWidth={3} /> : null}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                                        {model.label}
                                        {model.quality === 'deep' && (
                                            <Badge variant="purple">Pro</Badge>
                                        )}
                                    </span>
                                    <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                                        {isLocked ? 'Available on the Pro plan.' : model.description}
                                    </span>
                                    <span className="num mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <span className="inline-flex items-center gap-1"><Timer size={12} aria-hidden /> {model.speed}</span>
                                        <span className="inline-flex items-center gap-1"><Coins size={12} aria-hidden /> {cost} credit{cost > 1 ? 's' : ''}</span>
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-3">
                    <button
                        type="button"
                        onClick={() => setShowCustomQuestion(!showCustomQuestion)}
                        aria-expanded={showCustomQuestion}
                        aria-controls="analysis-custom-question"
                        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9"
                    >
                        <ChevronDown size={16} className={cn("transition-transform", showCustomQuestion && "rotate-180")} aria-hidden />
                        Custom instructions
                    </button>

                    {showCustomQuestion && (
                        <div id="analysis-custom-question" className="mt-1 space-y-1.5">
                            <Label htmlFor="question" className="text-xs text-muted-foreground">Optional. Replaces the default question.</Label>
                            <Textarea
                                id="question"
                                placeholder="e.g. Focus on the recent earnings call and guidance…"
                                className="resize-none text-sm"
                                rows={3}
                                value={customQuestion}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCustomQuestion(e.target.value)}
                            />
                        </div>
                    )}
                </div>

                <DialogFooter sticky>
                    <Button variant="ghost" className="h-11 lg:h-10" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleRun}
                        disabled={isAnalyzing}
                        className="h-11 gap-2 bg-violet-600 text-white hover:bg-violet-500 lg:h-10"
                    >
                        {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Brain size={16} aria-hidden />}
                        Run {selectedModel.label}
                    </Button>
                </DialogFooter>
            </Dialog>
        </>
    );
}

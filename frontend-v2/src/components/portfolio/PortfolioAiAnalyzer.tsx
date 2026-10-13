import { useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Bot, Sparkles, Brain, Target, Clock, ArrowRight, RotateCcw, Zap, History, ChevronRight, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Markdown } from '../common/Markdown';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { analysisStore } from '../../store/analysisStore';
import { MODEL_OPTIONS } from '../ticker/model-options';

interface PortfolioAiAnalyzerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'survey' | 'analyzing' | 'result' | 'history';

interface HistoricalAnalysis {
  id: string;
  riskAppetite: string;
  horizon: string;
  goal: string;
  model: string;
  response: string;
  createdAt: string;
}

export function PortfolioAiAnalyzer({ open, onOpenChange }: PortfolioAiAnalyzerProps) {
  const { user, refreshSession } = useAuth();
  const [step, setStep] = useState<Step>('survey');
  const [riskAppetite, setRiskAppetite] = useState('medium');
  const [horizon, setHorizon] = useState('medium-term');
  const [goal, setGoal] = useState('growth');
  const [model, setModel] = useState(MODEL_OPTIONS[0].key);
  const [analysis, setAnalysis] = useState('');
  const [history, setHistory] = useState<HistoricalAnalysis[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const credits = user?.credits_balance || 0;

  // Mirror the backend's authoritative pricing (CreditService.getModelCost) so
  // the displayed cost and the affordability gate always match what is charged.
  const getModelCost = (model?: string) => {
    if (!model) return 1;
    const m = model.toLowerCase();
    if (m.includes('pro') || m.includes('gpt-5')) return 5;
    if (m === 'gemini-3-flash-preview' || m === 'gemini-3-flash' || m === 'gemini-3.5-flash' || m === 'gemini-3.8-flash') return 2;
    if (m.includes('mini') || m.includes('gpt-4') || m.includes('flash-lite')) return 1;
    return 5;
  };

  const selectedCost = getModelCost(model);
  const canAfford = credits >= selectedCost;

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await api.get('/portfolio/analyses');
      setHistory(data);
    } catch (error) {
      console.error('Failed to fetch history', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const startAnalysis = async () => {
    setStep('analyzing');
    analysisStore.start();
    try {
      const { data } = await api.post('/portfolio/analyze', {
        riskAppetite,
        horizon,
        goal,
        model
      });
      setAnalysis(data);
      setStep('result');
      refreshSession();
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to generate AI analysis';
      toast.error(message);
      setStep('survey');
    } finally {
      analysisStore.stop();
    }
  };

  const reset = () => {
    setStep('survey');
    setAnalysis('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
      <DialogHeader className="mb-0 pb-2">
        <div className="flex items-center justify-between w-full">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-lg sm:text-xl">
            <Bot className="text-violet-400" size={22} />
            <span className="truncate">AI Portfolio Analyzer</span>
          </DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 min-w-11 shrink-0 gap-2 px-3 text-muted-foreground hover:text-foreground lg:h-9"
            aria-label={step === 'history' ? 'New analysis' : 'Analysis history'}
            onClick={() => {
              if (step === 'history') {
                setStep('survey');
              } else {
                setStep('history');
                fetchHistory();
              }
            }}
          >
            {step === 'history' ? (
              <>
                <Sparkles size={16} />
                <span className="hidden sm:inline">New Analysis</span>
              </>
            ) : (
              <>
                <History size={16} />
                <span className="hidden sm:inline">History</span>
              </>
            )}
          </Button>
        </div>
      </DialogHeader>

      <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 py-4">
        {step === 'survey' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Fine-tune your analysis</h3>
              <p className="text-sm text-muted-foreground">Answer a few questions to help the AI understand your strategy.</p>
            </div>

            <div className="space-y-6 px-1">
              {/* 1. Risk Appetite */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Brain size={16} className="text-purple-400" />
                  What is your risk appetite?
                </div>
                <RadioGroup value={riskAppetite} onValueChange={setRiskAppetite} className="grid grid-cols-3 gap-3">
                  <Label
                    className={cn(
                      "flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-muted/60 p-3 text-center transition-colors hover:bg-muted",
                      riskAppetite === 'low' && "bg-signal/10 text-signal hover:bg-signal/10"
                    )}
                  >
                    <RadioGroupItem value="low" className="sr-only" />
                    <span className="text-xs font-bold uppercase">Low</span>
                    <span className="text-xs leading-snug text-muted-foreground">Conservative & Stable</span>
                  </Label>
                  <Label
                    className={cn(
                      "flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-muted/60 p-3 text-center transition-colors hover:bg-muted",
                      riskAppetite === 'medium' && "bg-signal/10 text-signal hover:bg-signal/10"
                    )}
                  >
                    <RadioGroupItem value="medium" className="sr-only" />
                    <span className="text-xs font-bold uppercase">Medium</span>
                    <span className="text-xs leading-snug text-muted-foreground">Balanced Yield</span>
                  </Label>
                  <Label
                    className={cn(
                      "flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-muted/60 p-3 text-center transition-colors hover:bg-muted",
                      riskAppetite === 'high' && "bg-signal/10 text-signal hover:bg-signal/10"
                    )}
                  >
                    <RadioGroupItem value="high" className="sr-only" />
                    <span className="text-xs font-bold uppercase">High</span>
                    <span className="text-xs leading-snug text-muted-foreground">Aggressive Growth</span>
                  </Label>
                </RadioGroup>
              </div>

              {/* 2. Horizon */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock size={16} className="text-sky-400" />
                  What is your investment horizon?
                </div>
                <RadioGroup value={horizon} onValueChange={setHorizon} className="grid grid-cols-3 gap-3">
                  <Label className={cn("flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-muted/60 p-3 text-center transition-colors hover:bg-muted", horizon === 'short-term' && "bg-signal/10 text-signal hover:bg-signal/10")}>
                    <RadioGroupItem value="short-term" className="sr-only" />
                    <span className="text-xs font-medium">Short Term</span>
                    <span className="num text-xs text-muted-foreground">&lt; 1 Year</span>
                  </Label>
                  <Label className={cn("flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-muted/60 p-3 text-center transition-colors hover:bg-muted", horizon === 'medium-term' && "bg-signal/10 text-signal hover:bg-signal/10")}>
                    <RadioGroupItem value="medium-term" className="sr-only" />
                    <span className="text-xs font-medium">Medium Term</span>
                    <span className="num text-xs text-muted-foreground">1-5 Years</span>
                  </Label>
                  <Label className={cn("flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-muted/60 p-3 text-center transition-colors hover:bg-muted", horizon === 'long-term' && "bg-signal/10 text-signal hover:bg-signal/10")}>
                    <RadioGroupItem value="long-term" className="sr-only" />
                    <span className="text-xs font-medium">Long Term</span>
                    <span className="num text-xs text-muted-foreground">5+ Years</span>
                  </Label>
                </RadioGroup>
              </div>

              {/* 3. Goal */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Target size={16} className="text-emerald-400" />
                  What is your primary goal?
                </div>
                <RadioGroup value={goal} onValueChange={setGoal} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-muted/60 p-3 transition-colors hover:bg-muted", goal === 'growth' && "bg-signal/10 text-signal hover:bg-signal/10")}>
                    <RadioGroupItem value="growth" className="sr-only" />
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Growth</span>
                      <span className="text-xs text-muted-foreground">Total return</span>
                    </div>
                  </Label>
                  <Label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-muted/60 p-3 transition-colors hover:bg-muted", goal === 'income' && "bg-signal/10 text-signal hover:bg-signal/10")}>
                    <RadioGroupItem value="income" className="sr-only" />
                    <div className="h-2 w-2 rounded-full bg-sky-500" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Income</span>
                      <span className="text-xs text-muted-foreground">Dividends</span>
                    </div>
                  </Label>
                  <Label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-muted/60 p-3 transition-colors hover:bg-muted", goal === 'trading' && "bg-signal/10 text-signal hover:bg-signal/10")}>
                    <RadioGroupItem value="trading" className="sr-only" />
                    <div className="h-2 w-2 rounded-full bg-orange-500" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Trading</span>
                      <span className="text-xs text-muted-foreground">Momentum</span>
                    </div>
                  </Label>
                </RadioGroup>
              </div>
              {/* 4. Model selection */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles size={16} className="text-amber-400" />
                  Select AI Model
                </div>
                <RadioGroup value={model} onValueChange={setModel} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Driven by the shared MODEL_OPTIONS so this list stays in sync
                      with the research "Start AI Analysis" dialog. */}
                  {MODEL_OPTIONS.map((m) => {
                    const cost = getModelCost(m.key);
                    const isSelected = model === m.key;
                    return (
                      <Label
                        key={m.key}
                        className={cn(
                          "group relative flex cursor-pointer flex-col gap-2 rounded-lg bg-muted/60 p-4 transition-colors hover:bg-muted",
                          isSelected && "bg-signal/10 hover:bg-signal/10"
                        )}
                      >
                        <RadioGroupItem value={m.key} className="sr-only" />
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold tracking-tight">{m.label}</span>
                              {m.quality === 'deep' && (
                                <Badge variant="default" className="h-5 bg-purple-600 px-1.5 text-[11px] text-white hover:bg-purple-700">
                                  PRO
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs leading-snug text-muted-foreground">{m.description}</span>
                          </div>
                          {isSelected && <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-signal" aria-hidden />}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[11px] font-normal">
                            <Zap size={10} /> {m.speed}
                          </Badge>
                          <Badge variant="secondary" className="h-5 gap-1 bg-amber-500/10 px-1.5 text-[11px] font-normal text-amber-500">
                            ⚡ {cost} Credit{cost > 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </div>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="h-64 flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-500">
            <div className="relative">
              <div className="absolute inset-0 bg-violet-600/20 rounded-full blur-xl animate-pulse" />
              <div className="relative bg-background p-6 rounded-full animate-bounce duration-1000 shadow-[0_0_30px_rgba(124,58,237,0.3)]">
                <Bot size={48} className="text-violet-500" />
              </div>
              <div className="absolute -top-2 -right-2">
                <Sparkles size={24} className="text-fuchsia-400 animate-spin-slow" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold tracking-tight">AI is analyzing your holdings...</h3>
              <div className="flex items-center justify-center gap-1.5 overflow-hidden">
                <div className="h-1 w-1 bg-violet-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="h-1 w-1 bg-fuchsia-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="h-1 w-1 bg-violet-500 rounded-full animate-bounce" />
              </div>
              <p className="text-sm text-muted-foreground max-w-[280px]">Checking diversification, risk scores, and sector overexposure.</p>
            </div>
          </div>
        )}

        {step === 'result' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <Markdown size="sm" measure={false}>{analysis || ''}</Markdown>
          </div>
        )}

        {step === 'history' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300 px-1">
            <div className="text-center space-y-2 mb-6">
              <h3 className="text-lg font-semibold">Previous Insights</h3>
              <p className="text-sm text-muted-foreground">Review your past portfolio strategy sessions.</p>
            </div>

            {loadingHistory ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-muted/30 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                <div className="bg-muted/50 p-4 rounded-full">
                  <History size={32} className="text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm">No historical analyses found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="group p-4 bg-muted/20 rounded-xl hover:bg-muted/40 transition-all cursor-pointer"
                    onClick={() => {
                      setAnalysis(item.response);
                      setStep('result');
                    }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock size={12} />
                          {new Date(item.createdAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                          }).replace(/,/g, ' ·')}
                        </div>
                        <div className="text-sm font-bold flex items-center gap-1.5 capitalize">
                          {item.goal} Focused Strategy
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-[11px] h-4 px-1 capitalize text-purple-400">
                        {item.riskAppetite} Risk
                      </Badge>
                      <Badge variant="outline" className="text-[11px] h-4 px-1 capitalize text-sky-400">
                        {item.horizon.replace(/-/g, ' ')}
                      </Badge>
                      <Badge variant="outline" className="text-[11px] h-4 px-1 capitalize text-amber-500">
                        {item.model}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <DialogFooter className="pt-4">
        {step === 'survey' && (
          <div className="w-full space-y-3">
            {!canAfford && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-down/10 text-down text-[11px] font-medium animate-in fade-in slide-in-from-top-2">
                <AlertCircle size={14} />
                Insufficient credits for this model. Need {selectedCost}, have {credits}.
              </div>
            )}
            <Button
              className="w-full gap-2 text-base h-11"
              onClick={startAnalysis}
              disabled={!canAfford}
            >
              Analyze Portfolio
              <ArrowRight size={18} />
            </Button>
          </div>
        )}
        {step === 'result' && (
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1 gap-2" onClick={reset}>
              <RotateCcw size={16} />
              Analyze Again
            </Button>
            <Button className="flex-1" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogFooter>
    </Dialog>
  );
}

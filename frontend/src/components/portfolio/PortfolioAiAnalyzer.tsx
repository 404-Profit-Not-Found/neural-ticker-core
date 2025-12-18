import { useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Bot, Sparkles, Brain, Target, Clock, ArrowRight, RotateCcw, Zap, History, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { cn } from '../../lib/utils';

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
  const [step, setStep] = useState<Step>('survey');
  const [riskAppetite, setRiskAppetite] = useState('medium');
  const [horizon, setHorizon] = useState('medium-term');
  const [goal, setGoal] = useState('growth');
  const [model, setModel] = useState('gemini-2.5-flash-lite');
  const [analysis, setAnalysis] = useState('');
  const [history, setHistory] = useState<HistoricalAnalysis[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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
    try {
      const { data } = await api.post('/portfolio/analyze', {
        riskAppetite,
        horizon,
        goal,
        model
      });
      setAnalysis(data);
      setStep('result');
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to generate AI analysis';
      toast.error(message);
      setStep('survey');
    }
  };

  const reset = () => {
    setStep('survey');
    setAnalysis('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col bg-card border-border">
      <DialogHeader className="pb-4 border-b border-border/50">
        <div className="flex items-center justify-between w-full">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Bot className="text-primary" size={24} />
            AI Portfolio Analyzer
          </DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-primary transition-colors"
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
                New Analysis
              </>
            ) : (
              <>
                <History size={16} />
                History
              </>
            )}
          </Button>
        </div>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto py-6">
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
                      "flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all",
                      riskAppetite === 'low' && "border-primary bg-primary/5"
                    )}
                  >
                    <RadioGroupItem value="low" className="sr-only" />
                    <span className="text-xs font-bold uppercase mb-1">Low</span>
                    <span className="text-[10px] text-muted-foreground text-center">Conservative & Stable</span>
                  </Label>
                  <Label
                    className={cn(
                      "flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all",
                      riskAppetite === 'medium' && "border-primary bg-primary/5"
                    )}
                  >
                    <RadioGroupItem value="medium" className="sr-only" />
                    <span className="text-xs font-bold uppercase mb-1">Medium</span>
                    <span className="text-[10px] text-muted-foreground text-center">Balanced Yield</span>
                  </Label>
                  <Label
                    className={cn(
                      "flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all",
                      riskAppetite === 'high' && "border-primary bg-primary/5"
                    )}
                  >
                    <RadioGroupItem value="high" className="sr-only" />
                    <span className="text-xs font-bold uppercase mb-1">High</span>
                    <span className="text-[10px] text-muted-foreground text-center">Aggressive Growth</span>
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
                  <Label className={cn("flex flex-col items-center justify-between rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors text-center", horizon === 'short-term' && "bg-primary/10 border-primary")}>
                    <RadioGroupItem value="short-term" className="sr-only" />
                    <span className="text-xs font-medium">Short Term</span>
                    <span className="text-[9px] text-muted-foreground mt-1">&lt; 1 Year</span>
                  </Label>
                  <Label className={cn("flex flex-col items-center justify-between rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors text-center", horizon === 'medium-term' && "bg-primary/10 border-primary")}>
                    <RadioGroupItem value="medium-term" className="sr-only" />
                    <span className="text-xs font-medium">Medium Term</span>
                    <span className="text-[9px] text-muted-foreground mt-1">1-5 Years</span>
                  </Label>
                  <Label className={cn("flex flex-col items-center justify-between rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors text-center", horizon === 'long-term' && "bg-primary/10 border-primary")}>
                    <RadioGroupItem value="long-term" className="sr-only" />
                    <span className="text-xs font-medium">Long Term</span>
                    <span className="text-[9px] text-muted-foreground mt-1">5+ Years</span>
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
                  <Label className={cn("flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors", goal === 'growth' && "bg-primary/10 border-primary")}>
                    <RadioGroupItem value="growth" className="sr-only" />
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Growth</span>
                      <span className="text-[9px] text-muted-foreground">Total return</span>
                    </div>
                  </Label>
                  <Label className={cn("flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors", goal === 'income' && "bg-primary/10 border-primary")}>
                    <RadioGroupItem value="income" className="sr-only" />
                    <div className="h-2 w-2 rounded-full bg-sky-500" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Income</span>
                      <span className="text-[9px] text-muted-foreground">Dividends</span>
                    </div>
                  </Label>
                  <Label className={cn("flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors", goal === 'trading' && "bg-primary/10 border-primary")}>
                    <RadioGroupItem value="trading" className="sr-only" />
                    <div className="h-2 w-2 rounded-full bg-orange-500" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Trading</span>
                      <span className="text-[9px] text-muted-foreground">Momentum</span>
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
                  {/* Gemini 2.5 Flash Lite */}
                  <Label className={cn(
                    "group relative flex flex-col gap-2 rounded-xl border-2 border-border p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all",
                    model === 'gemini-2.5-flash-lite' && "border-primary bg-primary/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                  )}>
                    <RadioGroupItem value="gemini-2.5-flash-lite" className="sr-only" />
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold tracking-tight">Gemini 2.5 Flash Lite</span>
                        <span className="text-[10px] text-muted-foreground leading-tight">Ultra-fast for quick, concise summaries.</span>
                      </div>
                      {model === 'gemini-2.5-flash-lite' && <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 font-normal">
                        <Zap size={8} /> ≈3s
                      </Badge>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 font-normal text-amber-500 bg-amber-500/10 border-amber-500/20">
                        ⚡ 1 Credit
                      </Badge>
                    </div>
                  </Label>

                  {/* Gemini 3 Flash */}
                  <Label className={cn(
                    "group relative flex flex-col gap-2 rounded-xl border-2 border-border p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all",
                    model === 'gemini-3-flash-preview' && "border-primary bg-primary/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                  )}>
                    <RadioGroupItem value="gemini-3-flash-preview" className="sr-only" />
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold tracking-tight">Gemini 3 Flash</span>
                        <span className="text-[10px] text-muted-foreground leading-tight">Next-gen intelligence for regular updates.</span>
                      </div>
                      {model === 'gemini-3-flash-preview' && <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 font-normal">
                        <Zap size={8} /> ≈6s
                      </Badge>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 font-normal text-amber-500 bg-amber-500/10 border-amber-500/20">
                        ⚡ 2 Credits
                      </Badge>
                    </div>
                  </Label>

                  {/* GPT-4.1 Mini */}
                  <Label className={cn(
                    "group relative flex flex-col gap-2 rounded-xl border-2 border-border p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all",
                    model === 'gpt-4.1-mini' && "border-primary bg-primary/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                  )}>
                    <RadioGroupItem value="gpt-4.1-mini" className="sr-only" />
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold tracking-tight">GPT-4.1 Mini</span>
                        <span className="text-[10px] text-muted-foreground leading-tight">Balanced speed vs. thoroughness.</span>
                      </div>
                      {model === 'gpt-4.1-mini' && <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 font-normal">
                        <Zap size={8} /> ≈11s
                      </Badge>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 font-normal text-amber-500 bg-amber-500/10 border-amber-500/20">
                        ⚡ 1 Credit
                      </Badge>
                    </div>
                  </Label>

                  {/* Gemini 3 Pro */}
                  <Label className={cn(
                    "group relative flex flex-col gap-2 rounded-xl border-2 border-border p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all",
                    model === 'gemini-3-pro-preview' && "border-primary bg-primary/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                  )}>
                    <RadioGroupItem value="gemini-3-pro-preview" className="sr-only" />
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold tracking-tight">Gemini 3 Pro</span>
                          <Badge variant="default" className="h-4 px-1 text-[9px] bg-purple-600 hover:bg-purple-700 border-purple-500/50 text-white shadow-purple-500/20">
                            PRO
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground leading-tight">Optimal for complex reasoning tasks.</span>
                      </div>
                      {model === 'gemini-3-pro-preview' && <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 font-normal">
                        <Zap size={8} /> ≈18s
                      </Badge>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 font-normal text-amber-500 bg-amber-500/10 border-amber-500/20">
                        ⚡ 5 Credits
                      </Badge>
                    </div>
                  </Label>

                  {/* GPT-5.1 PRO */}
                  <Label className={cn(
                    "group relative flex flex-col gap-2 rounded-xl border-2 border-border p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all",
                    model === 'gpt-5.1' && "border-primary bg-primary/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                  )}>
                    <RadioGroupItem value="gpt-5.1" className="sr-only" />
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold tracking-tight">GPT-5.1</span>
                          <Badge variant="default" className="h-4 px-1 text-[9px] bg-purple-600 hover:bg-purple-700 border-purple-500/50 text-white shadow-purple-500/20">
                            PRO
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground leading-tight">OpenAI flagship for detailed thesis.</span>
                      </div>
                      {model === 'gpt-5.1' && <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 font-normal">
                        <Zap size={8} /> ≈18s
                      </Badge>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 font-normal text-amber-500 bg-amber-500/10 border-amber-500/20">
                        ⚡ 5 Credits
                      </Badge>
                    </div>
                  </Label>
                </RadioGroup>
              </div>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="h-64 flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-500">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
              <div className="relative bg-background border-2 border-primary/50 p-6 rounded-full animate-bounce duration-1000">
                <Bot size={48} className="text-primary" />
              </div>
              <div className="absolute -top-2 -right-2">
                <Sparkles size={24} className="text-yellow-400 animate-spin-slow" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold tracking-tight">AI is analyzing your holdings...</h3>
              <div className="flex items-center justify-center gap-1.5 overflow-hidden">
                <div className="h-1 w-1 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="h-1 w-1 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="h-1 w-1 bg-primary rounded-full animate-bounce" />
              </div>
              <p className="text-sm text-muted-foreground max-w-[280px]">Checking diversification, risk scores, and sector overexposure.</p>
            </div>
          </div>
        )}

        {step === 'result' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 prose prose-invert prose-sm max-w-none px-2">
            <ReactMarkdown
              components={{
                h1: ({ ...props }) => <h1 className="text-primary font-bold text-lg mb-2" {...props} />,
                h2: ({ ...props }) => <h2 className="text-foreground font-bold text-base mt-4 mb-2 flex items-center gap-2" {...props} />,
                li: ({ ...props }) => <li className="text-muted-foreground leading-relaxed" {...props} />,
                strong: ({ ...props }) => <strong className="text-foreground font-semibold" {...props} />,
              }}
            >
              {analysis}
            </ReactMarkdown>
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
                  <div key={i} className="h-24 bg-muted/30 rounded-xl animate-pulse border border-border/50" />
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
                    className="group p-4 bg-muted/20 border border-border rounded-xl hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer"
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
                          }).replace(',', ' ·')}
                        </div>
                        <div className="text-sm font-bold flex items-center gap-1.5 capitalize">
                          {item.goal} Focused Strategy
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize border-purple-500/20 text-purple-400">
                        {item.riskAppetite} Risk
                      </Badge>
                      <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize border-sky-500/20 text-sky-400">
                        {item.horizon.replace('-', ' ')}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize border-amber-500/20 text-amber-500">
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

      <DialogFooter className="pt-4 border-t border-border/50">
        {step === 'survey' && (
          <Button className="w-full gap-2 text-base h-11" onClick={startAnalysis}>
            Analyze Portfolio
            <ArrowRight size={18} />
          </Button>
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

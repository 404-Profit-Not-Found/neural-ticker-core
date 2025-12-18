import { useState } from 'react';
import { api, cn } from '../../lib/api';
import { Sparkles, RefreshCw, BrainCircuit } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useToast } from '../ui/toast';

interface PortfolioAiWidgetProps {
    hasPositions: boolean;
}

export function PortfolioAiWidget({ hasPositions }: PortfolioAiWidgetProps) {
    const [analysis, setAnalysis] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [riskProfile, setRiskProfile] = useState('medium');
    const { showToast } = useToast();

    const handleAnalyze = async () => {
        if (!hasPositions) {
            showToast("Please add positions before analyzing.", 'error');
            return;
        }

        setLoading(true);
        try {
            const res = await api.post('/portfolio/analyze', { riskAppetite: riskProfile });
            setAnalysis(res.data);
        } catch (error) {
            console.error(error);
            showToast('AI Analysis failed. Try again properly.', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!analysis && !loading) {
        return (
            <div className="bg-card border border-border rounded-xl p-6 relative overflow-hidden group">
                {/* Background Gradient Effect */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 group-hover:bg-primary/10 transition-colors duration-500" />

                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="space-y-2">
                        <h3 className="text-xl font-semibold flex items-center gap-2">
                            <BrainCircuit className="text-primary" />
                            AI Portfolio Analyst
                        </h3>
                        <p className="text-muted-foreground max-w-lg">
                            Get personalized advice on your portfolio composition, risk exposure, and rebalancing opportunities based on your risk appetite.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 bg-muted/30 p-1.5 rounded-lg border border-border">
                        {['low', 'medium', 'high'].map((r) => (
                            <button
                                key={r}
                                onClick={() => setRiskProfile(r)}
                                className={cn(
                                    "px-4 py-2 text-sm font-medium rounded-md transition-all capitalize",
                                    riskProfile === r
                                        ? "bg-primary text-black shadow-lg shadow-primary/20"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
                                {r}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleAnalyze}
                        disabled={loading || !hasPositions}
                        className={cn(
                            "flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white transition-all shadow-lg",
                            "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                    >
                        <Sparkles size={18} />
                        Analyze Portfolio
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-card border border-border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h3 className="tex-lg font-semibold flex items-center gap-2 text-primary">
                    <Sparkles size={18} />
                    AI Insights ({riskProfile} Risk)
                </h3>
                <button
                    onClick={handleAnalyze}
                    disabled={loading}
                    className="p-2 hover:bg-muted rounded-md text-muted-foreground transition-colors"
                >
                    <RefreshCw size={18} className={cn(loading && "animate-spin")} />
                </button>
            </div>

            {loading ? (
                <div className="space-y-3 py-6">
                    <div className="h-4 bg-muted/50 rounded w-3/4 animate-pulse" />
                    <div className="h-4 bg-muted/50 rounded w-full animate-pulse" />
                    <div className="h-4 bg-muted/50 rounded w-5/6 animate-pulse" />
                </div>
            ) : (
                <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                        components={{
                            h1: ({ ...props }) => <h4 className="text-lg font-bold text-foreground mt-4 mb-2" {...props} />,
                            h2: ({ ...props }) => <h5 className="text-base font-semibold text-foreground mt-3 mb-2" {...props} />,
                            ul: ({ ...props }) => <ul className="list-disc pl-5 space-y-1 text-muted-foreground" {...props} />,
                            li: ({ ...props }) => <li className="" {...props} />,
                            strong: ({ ...props }) => <span className="font-semibold text-white" {...props} />,
                        }}
                    >
                        {analysis || ''}
                    </ReactMarkdown>
                </div>
            )}
        </div>
    );
}

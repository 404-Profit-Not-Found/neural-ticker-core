import { Sparkles } from 'lucide-react';
import { httpClient } from '../../lib/api';




export function AboutHero() {
    return (
        <div className="relative overflow-hidden border-b border-border bg-muted/20">
            <div className="absolute top-6 left-6 z-20">
                <button
                    onClick={async () => {
                        try {
                            await httpClient.patch('/api/v1/users/me', { has_onboarded: true });
                            // Force refresh to update context
                            // We don't have access to refreshSession here easily unless we fetch it from useAuth
                            // But AboutHero is inside AuthProvider, so we can use useAuth.
                            window.location.href = '/';
                        } catch (e) {
                            console.error('Failed to set onboarding status', e);
                            window.location.href = '/'; // Fallback
                        }
                    }}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium bg-transparent border-none cursor-pointer"
                >
                    <div className="h-8 w-8 rounded-full bg-background border border-border flex items-center justify-center">
                        <span className="text-lg">←</span>
                    </div>
                    Enter App
                </button>
            </div>
            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:50px_50px]" />
            <div className="absolute inset-0 flex items-center justify-center opacity-30">
                <div className="h-[500px] w-[500px] bg-purple-500/20 blur-[100px] rounded-full" />
            </div>

            <div className="container max-w-5xl mx-auto px-4 py-24 relative z-10 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wider mb-6 animate-in fade-in slide-in-from-bottom-3 duration-700">
                    <Sparkles size={12} />
                    Simplifying Market Research
                </div>
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                    Built for the <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 dark:from-purple-400 dark:to-pink-500 text-shadow-sm transition-all">Autonomous Investor</span>
                </h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-5 duration-700 delay-200">
                    NeuralTicker isn't just another dashboard. It's an Agentic AI system designed to replace the noise of fragmented platforms with high-conviction intelligence.
                </p>
            </div>
        </div>
    );
}

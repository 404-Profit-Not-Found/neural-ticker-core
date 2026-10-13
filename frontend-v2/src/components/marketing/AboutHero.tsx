import { Sparkles } from 'lucide-react';
import { httpClient } from '../../lib/api';
import { appPath } from '../../lib/base';




export function AboutHero() {
    return (
        <div className="relative overflow-hidden bg-muted/20">
            <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6">
                <button
                    onClick={async () => {
                        try {
                            await httpClient.patch('/api/v1/users/me', { has_onboarded: true });
                            // Force refresh to update context
                            // We don't have access to refreshSession here easily unless we fetch it from useAuth
                            // But AboutHero is inside AuthProvider, so we can use useAuth.
                            window.location.href = appPath('/');
                        } catch (e) {
                            console.error('Failed to set onboarding status', e);
                            window.location.href = appPath('/'); // Fallback
                        }
                    }}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-transparent pr-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center">
                        <span className="text-lg" aria-hidden>←</span>
                    </div>
                    Enter App
                </button>
            </div>
            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:50px_50px]" />
            <div className="absolute inset-0 flex items-center justify-center opacity-30">
                <div className="h-[500px] w-[500px] bg-purple-500/20 blur-[100px] rounded-full" />
            </div>

            <div className="container relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-24 text-center md:py-24">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wider mb-6 animate-in fade-in slide-in-from-bottom-3 duration-700">
                    <Sparkles size={12} />
                    Simplifying Market Research
                </div>
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                    Built for the <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 dark:from-purple-400 dark:to-pink-500 text-shadow-sm transition-all">Autonomous Investor</span>
                </h1>
                <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl animate-in fade-in slide-in-from-bottom-5 duration-700 delay-200">
                    NeuralTicker isn't just another dashboard. It's an Agentic AI system designed to replace the noise of fragmented platforms with high-conviction intelligence.
                </p>
            </div>
        </div>
    );
}

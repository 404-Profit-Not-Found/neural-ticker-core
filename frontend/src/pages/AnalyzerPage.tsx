import { Header } from '../components/layout/Header';
import { AnalyzerTable } from '../components/analyzer/AnalyzerTable';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

export function AnalyzerPage() {
    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
            <Header />

            <main className="container mx-auto px-4 py-6 max-w-[80rem] space-y-6 animate-in fade-in duration-500">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">Stock Analyzer</h1>
                    <p className="text-muted-foreground">
                        Advanced screening for all {new Date().getFullYear()} market data. Filter by AI risk, upside potential, and fundamentals.
                    </p>
                </div>

                <ErrorBoundary>
                    <AnalyzerTable />
                </ErrorBoundary>
            </main>
        </div>
    );
}

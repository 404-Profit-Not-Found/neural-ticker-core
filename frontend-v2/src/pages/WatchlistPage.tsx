import { WatchlistTable } from '../components/dashboard/WatchlistTable';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

export function WatchlistPage() {
    return (
        <div className="min-h-page bg-background text-foreground font-sans selection:bg-primary/30">

            <main className="container mx-auto max-w-[90rem] space-y-4 px-4 py-4 lg:space-y-6 lg:py-6 animate-in fade-in duration-300">
                <ErrorBoundary>
                    <WatchlistTable />
                </ErrorBoundary>
            </main>
        </div>
    );
}

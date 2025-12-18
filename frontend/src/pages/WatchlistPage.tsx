import { Header } from '../components/layout/Header';
import { WatchlistTable } from '../components/dashboard/WatchlistTable';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

export function WatchlistPage() {
    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
            <Header />

            <main className="container mx-auto px-4 py-6 max-w-[80rem] space-y-4 sm:space-y-6 animate-in fade-in duration-500">
                {/* <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">My Watchlist</h1>
                    <p className="text-muted-foreground">Monitor your favorite assets and their AI risk insights.</p>
                </div> */}

                <ErrorBoundary>
                    <WatchlistTable />
                </ErrorBoundary>
            </main>
        </div>
    );
}

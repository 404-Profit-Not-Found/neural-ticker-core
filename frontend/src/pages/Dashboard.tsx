import { Header } from '../components/layout/Header';
import { KPIGrid } from '../components/dashboard/KPIGrid';
import { WatchlistTable } from '../components/dashboard/WatchlistTable';

export function Dashboard() {
    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
            <Header />

            <main className="container mx-auto px-4 py-6 max-w-[80rem] space-y-6 animate-in fade-in duration-500">
                {/* KPI Cards Row */}
                <KPIGrid />

                {/* Watchlist Section */}
                <section>
                    <WatchlistTable />
                </section>
            </main>
        </div>
    );
}

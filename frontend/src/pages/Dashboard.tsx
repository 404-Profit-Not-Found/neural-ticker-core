import { Header } from '../components/layout/Header';
import { KPIGrid } from '../components/dashboard/KPIGrid';
import { WatchlistTable } from '../components/dashboard/WatchlistTable';

export function Dashboard() {
    return (
        <div className="min-h-screen bg-[#09090b] text-[#fafafa] font-sans selection:bg-blue-500/30">
            <Header />

            <main className="max-w-[1600px] mx-auto p-6 space-y-8 animate-in fade-in duration-500">
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

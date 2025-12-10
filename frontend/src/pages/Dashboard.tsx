import { Header } from '../components/layout/Header';
import { KPIGrid } from '../components/dashboard/KPIGrid';
import { WatchlistTable } from '../components/dashboard/WatchlistTable';
import StocktwitsWidget from '../components/widgets/StocktwitsWidget';

export function Dashboard() {
    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
            <Header />
            
            {/* Stocktwits Ticker Bar */}
            <div className="w-full border-b border-border">
                <div className="max-w-[100rem] mx-auto px-6">
                    <StocktwitsWidget />
                </div>
            </div>

            <main className="max-w-[100rem] mx-auto p-6 space-y-8 animate-in fade-in duration-500">
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

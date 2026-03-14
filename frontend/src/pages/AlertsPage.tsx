import { Header } from '../components/layout/Header';
import { PriceAlertsList } from '../components/price-alerts/PriceAlertsList';
import { usePriceAlerts } from '../hooks/usePriceAlerts';
import { Bell } from 'lucide-react';

export function AlertsPage() {
  const { data: alerts } = usePriceAlerts();
  const activeCount = alerts?.filter((a) => a.enabled).length ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Bell size={22} className="text-primary" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Price Alerts</h1>
              <p className="text-sm text-muted-foreground">
                {activeCount > 0
                  ? `${activeCount} active alert${activeCount > 1 ? 's' : ''}`
                  : 'No active alerts'}
              </p>
            </div>
          </div>
        </div>

        <PriceAlertsList />
      </main>
    </div>
  );
}

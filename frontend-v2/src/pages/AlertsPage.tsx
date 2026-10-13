import { useState } from 'react';
import { Bell, Plus } from 'lucide-react';
import { PriceAlertsList } from '../components/price-alerts/PriceAlertsList';
import { NewAlertDialog } from '../components/price-alerts/NewAlertDialog';
import { usePriceAlerts } from '../hooks/usePriceAlerts';
import { PageHeader } from '../components/ui/page-header';
import { Button } from '../components/ui/button';

export function AlertsPage() {
  const { data: alerts } = usePriceAlerts();
  const [isNewOpen, setIsNewOpen] = useState(false);
  const total = alerts?.length ?? 0;
  const activeCount = alerts?.filter((a) => a.enabled).length ?? 0;
  const pausedCount = total - activeCount;

  return (
    <div className="min-h-page bg-background text-foreground">
      <main className="mx-auto max-w-3xl space-y-4 px-4 pb-8 pt-6 sm:px-6 sm:pt-8">
        <PageHeader
          title="Price Alerts"
          icon={<Bell size={22} />}
          description={
            total === 0
              ? 'Get notified when a price hits your target.'
              : `${activeCount} active${pausedCount > 0 ? ` · ${pausedCount} paused` : ''}`
          }
          actions={
            <Button onClick={() => setIsNewOpen(true)} className="h-11 gap-2 lg:h-9">
              <Plus size={16} />
              New alert
            </Button>
          }
        />

        <PriceAlertsList onCreate={() => setIsNewOpen(true)} />
      </main>

      <NewAlertDialog open={isNewOpen} onOpenChange={setIsNewOpen} />
    </div>
  );
}

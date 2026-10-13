import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useTickerSearch, type TickerSearchResult } from '../../hooks/useTickerSearch';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { EmptyState } from '../ui/empty-state';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { TickerLogo } from '../dashboard/TickerLogo';
import { CreateAlertDialog } from './CreateAlertDialog';

interface NewAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Snapshot {
  price?: number;
  latestPrice?: { close?: number };
  ticker?: { currency?: string };
}

/**
 * "New alert" from the Alerts page: pick a ticker we already track, then set
 * the alert in the same dialog the ticker page uses. (Only tracked tickers —
 * an alert needs a price feed to be evaluated against.)
 */
export function NewAlertDialog({ open, onOpenChange }: NewAlertDialogProps) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<TickerSearchResult | null>(null);
  const { results, loading, error } = useTickerSearch(query);
  const tracked = results.filter((r) => r.is_locally_tracked !== false);

  // The alert is set against the instrument's own price and currency.
  const snapshot = useQuery({
    queryKey: ['alert-ticker-snapshot', picked?.symbol],
    queryFn: async () => {
      const { data } = await api.get<Snapshot>(`/tickers/${encodeURIComponent(picked!.symbol)}/snapshot`);
      return data;
    },
    enabled: !!picked,
    staleTime: 60_000,
  });

  const close = () => {
    onOpenChange(false);
    setPicked(null);
    setQuery('');
  };

  if (!open) return null;

  if (picked && snapshot.data) {
    const price = Number(snapshot.data.price ?? snapshot.data.latestPrice?.close ?? 0);
    return (
      <CreateAlertDialog
        key={picked.symbol}
        symbol={picked.symbol}
        currentPrice={Number.isFinite(price) ? price : 0}
        nativeCurrency={snapshot.data.ticker?.currency || 'USD'}
        open
        onOpenChange={(next) => {
          if (!next) close();
        }}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
      <DialogHeader>
        <DialogTitle>New price alert</DialogTitle>
        <DialogDescription>Choose the ticker to watch.</DialogDescription>
      </DialogHeader>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbol or company…"
          aria-label="Search tickers"
          autoComplete="off"
          className="pl-9"
        />
      </div>

      <div className="mt-3 min-h-[12rem]" aria-live="polite">
        {picked ? (
          snapshot.isError ? (
            <EmptyState
              role="alert"
              title={`Couldn’t load ${picked.symbol}`}
              description="The current price is needed to set an alert."
              action={<Button variant="outline" onClick={() => void snapshot.refetch()}>Try again</Button>}
            />
          ) : (
            <div role="status" className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading {picked.symbol}…
            </div>
          )
        ) : query.trim().length === 0 ? (
          <EmptyState title="Search to begin" description="Type a symbol or a company name, e.g. NVDA." />
        ) : loading ? (
          <div role="status" className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Searching…
          </div>
        ) : error ? (
          <EmptyState role="alert" title="Search failed" description="Check your connection and try again." />
        ) : tracked.length === 0 ? (
          <EmptyState title="No tracked ticker matches" description="Alerts can be set on tickers NeuralTicker already tracks." />
        ) : (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {tracked.map((ticker) => (
              <li key={ticker.symbol}>
                <button
                  type="button"
                  onClick={() => setPicked(ticker)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-md bg-muted/60 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TickerLogo url={ticker.logo_url} symbol={ticker.symbol} className="h-8 w-8 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{ticker.symbol}</span>
                    <span className="block truncate text-xs text-muted-foreground">{ticker.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

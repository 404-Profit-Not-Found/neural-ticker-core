import { useEffect, useState, useSyncExternalStore } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import {
  getSessionLabel,
  useAllMarketsStatus,
  type MarketStatusData,
} from '../../hooks/useMarketStatus';
import { openCommandPalette } from '../../app/commandPalette';
import { openShortcutsHelp } from './KeyboardShortcuts';
import { cn } from '../../lib/utils';

/**
 * Desktop status line pinned to the bottom of the shell — the terminal's
 * "instrument panel". Every reading on it is real: exchange sessions from the
 * market-status API, sync state from the query client, the browser's own
 * connectivity, and the clock. It reports; it never just asserts "live".
 */
export function StatusBar() {
  const { data: markets } = useAllMarketsStatus();

  return (
    <footer
      aria-label="Status"
      className="hidden lg:flex fixed inset-x-0 bottom-0 z-40 h-7 items-center gap-4 bg-card px-4"
    >
      <Market code="US" status={markets?.us} />
      <Market code="EU" status={markets?.eu} />
      <Market code="ASIA" status={markets?.asia} />

      <Divider />

      <SyncState />

      <span className="flex-1" />

      <button
        type="button"
        onClick={openCommandPalette}
        className="flex items-center gap-1.5 rounded-sm px-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="kbd">⌘K</span>
        <span className="label-micro !text-inherit">Search</span>
      </button>
      <button
        type="button"
        onClick={openShortcutsHelp}
        className="flex items-center gap-1.5 rounded-sm px-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="kbd">?</span>
        <span className="label-micro !text-inherit">Shortcuts</span>
      </button>

      <Divider />

      <Clock />

      <Divider />

      <span className="label-micro">v{__APP_VERSION__}</span>
    </footer>
  );
}

function Divider() {
  return <span aria-hidden className="w-1" />;
}

const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * What the data on screen is actually doing, read from the query cache:
 * offline, a failed request (with a retry), a request in flight, the time of
 * the last successful load, or "stale" when nothing has loaded for a while.
 */
function SyncState() {
  const client = useQueryClient();
  const fetching = useIsFetching();
  const online = useOnline();

  // "<failed>:<last success ms>" — a primitive, so this only re-renders when
  // one of the two actually changes.
  const snapshot = useSyncExternalStore(
    (onChange) => client.getQueryCache().subscribe(onChange),
    () => {
      let failed = 0;
      let last = 0;
      for (const query of client.getQueryCache().getAll()) {
        if (query.getObserversCount() === 0) continue;
        if (query.state.status === 'error') failed += 1;
        if (query.state.dataUpdatedAt > last) last = query.state.dataUpdatedAt;
      }
      return `${failed}:${last}`;
    },
  );
  const [failedText, lastText] = snapshot.split(':');
  const failed = Number(failedText);
  const last = Number(lastText);

  // Staleness depends on the clock, not on the cache: re-check twice a minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const retry = () =>
    client.refetchQueries({ type: 'active', predicate: (query) => query.state.status === 'error' });

  let led = 'led-up';
  let label = '';
  let detail: string | null = null;
  if (!online) {
    led = 'led-down';
    label = 'Offline';
  } else if (failed > 0 && fetching === 0) {
    led = 'led-down';
    label = 'Sync failed';
  } else if (fetching > 0) {
    led = 'led-info led-pulse';
    label = 'Syncing';
  } else if (last === 0) {
    led = 'led-off';
    label = 'No data yet';
  } else if (now - last > STALE_AFTER_MS) {
    led = 'led-off';
    label = 'Stale';
    detail = `${Math.max(1, Math.round((now - last) / 60_000))}m`;
  } else {
    label = 'Synced';
    detail = new Date(last).toISOString().slice(11, 19);
  }

  return (
    <span className="flex items-center gap-2" role="status" aria-live="polite">
      <span className={cn('led', led)} aria-hidden />
      <span className="label-micro">{label}</span>
      {detail && (
        <span className="num text-[11px] text-foreground/90" title={label === 'Synced' ? 'Last successful load (UTC)' : undefined}>
          {detail}
        </span>
      )}
      {online && failed > 0 && fetching === 0 && (
        <button
          type="button"
          onClick={retry}
          className="label-micro rounded-sm px-1 !text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Retry
        </button>
      )}
    </span>
  );
}

function Market({ code, status }: { code: string; status?: MarketStatusData }) {
  if (!status) return null;
  // Only the regular session is "open": pre- and post-market read as closed
  // (same rule as getSessionLabel).
  const open = status.session === 'regular';
  return (
    <span
      className="flex items-center gap-2"
      title={`${code} market: ${getSessionLabel(status.session)}`}
    >
      <span
        className={cn('led', open ? 'led-up' : 'led-off')}
        aria-hidden
      />
      <span className="label-micro">
        {code}{' '}
        <span className={cn(open ? 'text-up' : 'text-muted-foreground')}>
          {open ? 'Open' : 'Closed'}
        </span>
      </span>
    </span>
  );
}

// Isolated so the once-a-second tick re-renders only these few characters.
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = now.toISOString().slice(11, 19);
  return (
    <time dateTime={now.toISOString()} className="flex items-center gap-1.5" title="Coordinated Universal Time">
      <span className="label-micro">UTC</span>
      <span className="num text-[11px] text-foreground/90">{time}</span>
    </time>
  );
}

function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('online', onChange);
      window.addEventListener('offline', onChange);
      return () => {
        window.removeEventListener('online', onChange);
        window.removeEventListener('offline', onChange);
      };
    },
    () => navigator.onLine,
  );
}

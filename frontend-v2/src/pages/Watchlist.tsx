// Watchlists — list / create / rename / delete + add/remove tickers per list.
import { useState, type ChangeEvent } from 'react';
import {
  PixelIcon,
  PixelPanel,
  TickerSprite,
  useBreakpoint,
} from '../components/pixel.tsx';
import { EmptyState, Spinner } from '../components/Skeletons.tsx';
import { API } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import type { NavFn, Ticker } from '../lib/types.ts';

interface WatchlistItem {
  id: string | number;
  ticker?: {
    symbol?: string;
    name?: string;
    finnhub_industry?: string;
    sector?: string;
    logo_url?: string;
  };
  symbol?: string;
}

interface WatchlistRow {
  id: string | number;
  name?: string;
  items?: WatchlistItem[];
}

interface WatchlistMsg {
  tone: 'green' | 'red' | 'amber';
  text: string;
}

export interface WatchlistPageProps {
  onNav: NavFn;
}

export function WatchlistPage({ onNav }: WatchlistPageProps) {
  const bp = useBreakpoint();
  const [data, meta] = useApi<WatchlistRow[] | null>(
    () => API.watchlists() as Promise<WatchlistRow[]>,
    ['watchlists'],
  );
  const lists: WatchlistRow[] = Array.isArray(data) ? data : [];
  const [activeId, setActiveId] = useState<string | number | null>(null);
  const [addSym, setAddSym] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<WatchlistMsg | null>(null);

  const showMsg = (m: WatchlistMsg): void => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2400);
  };
  const reload = (): void => {
    meta?.reload?.();
  };

  // Resolve active list (default to first when not set or stale)
  const active: WatchlistRow | null =
    lists.find((l) => l.id === activeId) || lists[0] || null;

  const createList = async (): Promise<void> => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const res = (await API.watchlistCreate(name).catch(() => null)) as
      | { id?: string | number }
      | null;
    setBusy(false);
    if (res?.id) {
      setActiveId(res.id);
      setNewName('');
      showMsg({ tone: 'green', text: `Created '${name}'` });
      reload();
    } else showMsg({ tone: 'red', text: 'Create failed' });
  };

  const renameList = async (): Promise<void> => {
    if (!active) return;
    const name = prompt('Rename watchlist:', active.name || '');
    if (!name || name === active.name) return;
    const res = await API.watchlistRename(active.id, name).catch(() => null);
    if (res) {
      showMsg({ tone: 'green', text: `Renamed to '${name}'` });
      reload();
    } else showMsg({ tone: 'red', text: 'Rename failed' });
  };

  const deleteList = async (): Promise<void> => {
    if (!active) return;
    if (!confirm(`Delete watchlist '${active.name}'?`)) return;
    const res = await API.watchlistDelete(active.id).catch(() => null);
    if (res !== null) {
      setActiveId(null);
      showMsg({ tone: 'amber', text: `Deleted '${active.name}'` });
      reload();
    } else showMsg({ tone: 'red', text: 'Delete failed' });
  };

  const addTicker = async (): Promise<void> => {
    if (!active) return;
    const sym = addSym.trim().toUpperCase();
    if (!sym) return;
    setBusy(true);
    const res = await API.watchlistAdd(active.id, sym).catch(() => null);
    setBusy(false);
    if (res) {
      setAddSym('');
      showMsg({ tone: 'green', text: `Added ${sym}` });
      reload();
    } else showMsg({ tone: 'red', text: `Add ${sym} failed (not in DB?)` });
  };

  const removeTicker = async (
    itemId: string | number,
    sym: string,
  ): Promise<void> => {
    if (!active) return;
    const res = await API.watchlistRemove(active.id, itemId).catch(() => null);
    if (res !== null) {
      showMsg({ tone: 'amber', text: `Removed ${sym}` });
      reload();
    }
  };

  return (
    <div
      style={{
        padding: bp.mobile ? '0 12px 24px' : '0 20px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        className="row"
        style={{ alignItems: 'center', gap: 12, padding: '12px 0' }}
      >
        <span className="font-display t-xs faint">TERMINAL ▸ WATCHLISTS</span>
        <div style={{ flex: 1 }} />
        <span className="font-display t-xs faint">{lists.length} LISTS</span>
      </div>

      {msg && (
        <div
          className="pxl pxl-raised"
          style={{
            padding: '10px 14px',
            color: `var(--${msg.tone})`,
            fontFamily: 'Silkscreen, monospace',
            fontSize: 11,
            letterSpacing: '0.06em',
          }}
        >
          ▸ {msg.text}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: bp.mobile ? '1fr' : '260px 1fr',
          gap: 16,
        }}
      >
        <PixelPanel title="LISTS" accent="amber">
          {lists.length === 0 && !meta?.loading && (
            <EmptyState
              icon="star"
              title="NO LISTS"
              subtitle="Create your first watchlist below."
            />
          )}
          {meta?.loading && lists.length === 0 && (
            <div style={{ padding: 16 }}>
              <Spinner label="LOADING" />
            </div>
          )}
          <div className="col">
            {lists.map((l) => {
              const isActive = l.id === active?.id;
              return (
                <div
                  key={l.id}
                  onClick={() => setActiveId(l.id)}
                  className="row gap-2"
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--line-soft)',
                    borderLeft: isActive
                      ? '3px solid var(--amber)'
                      : '3px solid transparent',
                    cursor: 'pointer',
                    background: isActive
                      ? 'rgba(255,194,60,0.06)'
                      : 'transparent',
                    alignItems: 'center',
                  }}
                >
                  <PixelIcon
                    name="star"
                    size={12}
                    color={isActive ? 'var(--amber)' : 'var(--ink-faint)'}
                  />
                  <span
                    className="font-display t-sm"
                    style={{ flex: 1 }}
                  >
                    {l.name || '(unnamed)'}
                  </span>
                  <span className="font-mono t-xs faint">
                    {(l.items || []).length}
                  </span>
                </div>
              );
            })}
          </div>
          <div
            style={{ padding: 10, borderTop: '2px solid var(--line)' }}
          >
            <div className="row gap-2">
              <input
                value={newName}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setNewName(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createList();
                }}
                placeholder="new list name..."
                className="pxl-input"
                style={{ paddingLeft: 10 }}
              />
              <button
                className="pxl-btn primary"
                onClick={createList}
                disabled={busy || !newName.trim()}
              >
                + NEW
              </button>
            </div>
          </div>
        </PixelPanel>

        <PixelPanel
          title={
            active
              ? `${(active.name || '').toUpperCase()} ▸ ITEMS`
              : 'SELECT A LIST'
          }
          accent="cyan"
          actions={
            active ? (
              <span className="row gap-2">
                <button className="pxl-btn sm ghost" onClick={renameList}>
                  RENAME
                </button>
                <button
                  className="pxl-btn sm ghost"
                  onClick={deleteList}
                  style={{ color: 'var(--red)' }}
                >
                  DELETE
                </button>
              </span>
            ) : undefined
          }
        >
          {!active ? (
            <EmptyState
              icon="star"
              title="NO LIST SELECTED"
              subtitle="Pick or create one from the left."
            />
          ) : (
            <>
              <div
                style={{
                  padding: 10,
                  borderBottom: '2px solid var(--line)',
                }}
              >
                <div className="row gap-2">
                  <input
                    value={addSym}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setAddSym(e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addTicker();
                    }}
                    placeholder="add ticker symbol (e.g. NVDA)..."
                    className="pxl-input"
                    style={{
                      paddingLeft: 10,
                      textTransform: 'uppercase',
                    }}
                  />
                  <button
                    className="pxl-btn primary"
                    onClick={addTicker}
                    disabled={busy || !addSym.trim()}
                  >
                    + ADD
                  </button>
                </div>
              </div>
              {(active.items || []).length === 0 ? (
                <EmptyState
                  title="EMPTY"
                  subtitle="Add tickers above."
                />
              ) : (
                <table className="pxl-table">
                  <thead>
                    <tr>
                      <th>SYM</th>
                      <th>NAME</th>
                      <th>SECTOR</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(active.items || []).map((it) => {
                      const sym = it.ticker?.symbol || it.symbol || '';
                      const t: Ticker = {
                        sym,
                        name: it.ticker?.name || sym,
                        sector:
                          it.ticker?.finnhub_industry ||
                          it.ticker?.sector ||
                          '—',
                        price: 0,
                        change: 0,
                        ai: 'HOLD',
                        risk: 5,
                        upside: 0,
                        mc: '—',
                        pe: null,
                        seed: (sym || '')
                          .split('')
                          .reduce(
                            (a: number, c: string) => a + c.charCodeAt(0),
                            0,
                          ),
                        logo: it.ticker?.logo_url,
                        spark: [0, 0],
                        candles: [],
                        _live: true,
                      };
                      return (
                        <tr key={it.id} onClick={() => onNav('ticker', t)}>
                          <td>
                            <div
                              className="row gap-2"
                              style={{ alignItems: 'center' }}
                            >
                              <TickerSprite t={t} size={22} />
                              <span className="font-display t-sm">
                                {sym}
                              </span>
                            </div>
                          </td>
                          <td className="t-sm">{t.name}</td>
                          <td className="t-xs faint">{t.sector}</td>
                          <td>
                            <button
                              className="pxl-btn sm ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeTicker(it.id, sym);
                              }}
                              title="Remove from watchlist"
                              style={{
                                padding: '2px 6px',
                                color: 'var(--red)',
                                boxShadow: 'none',
                              }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </PixelPanel>
      </div>
    </div>
  );
}

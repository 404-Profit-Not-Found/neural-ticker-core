// Portfolio — list / edit / delete positions + sector donut.
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  PixelDonut,
  PixelPanel,
  TickerSprite,
  useBreakpoint,
} from '../components/pixel.tsx';
import { EmptyState, SkelBar } from '../components/Skeletons.tsx';
import { API } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import type { NavFn, Ticker } from '../lib/types.ts';
import { KPI } from './_kpi.tsx';

interface PositionRow {
  id: string | number;
  symbol?: string;
  shares?: number;
  buy_price?: number;
  buy_date?: string;
  current_price?: number;
  current_value?: number;
  cost_basis?: number;
  gain_loss?: number;
  gain_loss_percent?: number;
  change_percent?: number;
  latestPrice?: { close?: number };
  sparkline?: number[];
  ticker?: {
    symbol?: string;
    name?: string;
    sector?: string;
    finnhub_industry?: string;
    logo_url?: string;
  };
}

interface PortfolioMsg {
  tone: 'green' | 'red' | 'amber';
  text: string;
}

function normalizePositionToTicker(p: PositionRow): Ticker {
  const sym = p.symbol || p.ticker?.symbol || '';
  return {
    sym,
    name: p.ticker?.name || sym,
    sector: p.ticker?.finnhub_industry || p.ticker?.sector || '—',
    price: Number(p.current_price ?? p.latestPrice?.close ?? 0),
    change: Number(p.change_percent ?? 0),
    ai: 'HOLD',
    risk: 5,
    upside: 0,
    mc: '—',
    pe: null,
    seed: (sym || '')
      .split('')
      .reduce((a: number, c: string) => a + c.charCodeAt(0), 0),
    logo: p.ticker?.logo_url,
    spark: p.sparkline || [0, 0],
    candles: [],
    _live: true,
  };
}

export interface PortfolioPageProps {
  onNav: NavFn;
}

export function PortfolioPage({ onNav }: PortfolioPageProps) {
  const bp = useBreakpoint();
  const [currency, setCurrency] = useState<string>(() => {
    try {
      return localStorage.getItem('v2_portfolio_currency') || '';
    } catch {
      return '';
    }
  });
  const [positions, posMeta] = useApi<PositionRow[] | null>(
    () => API.portfolio(currency || undefined) as Promise<PositionRow[]>,
    ['portfolio', currency],
  );
  const items: PositionRow[] = Array.isArray(positions) ? positions : [];
  const [editing, setEditing] = useState<PositionRow | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('v2_portfolio_currency', currency);
    } catch {
      /* ignore */
    }
  }, [currency]);

  const removePosition = async (
    id: string | number,
    sym: string,
    evt: ReactMouseEvent,
  ): Promise<void> => {
    evt.stopPropagation();
    if (!confirm(`Remove ${sym} position?`)) return;
    await API.portfolioDelete(id).catch(() => null);
    posMeta?.reload?.();
  };

  const editPosition = (p: PositionRow, evt: ReactMouseEvent): void => {
    evt.stopPropagation();
    setEditing(p);
  };

  const totals = useMemo(() => {
    let value = 0;
    let cost = 0;
    for (const p of items) {
      value += Number(p.current_value ?? 0);
      cost += Number(p.cost_basis ?? 0);
    }
    const gain = value - cost;
    const gainPct = cost ? (gain / cost) * 100 : 0;
    return { value, cost, gain, gainPct };
  }, [items]);

  const sectorBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of items) {
      const sec =
        p.ticker?.finnhub_industry || p.ticker?.sector || 'OTHER';
      map.set(sec, (map.get(sec) || 0) + Number(p.current_value ?? 0));
    }
    const colors = [
      'var(--cyan)',
      'var(--amber)',
      'var(--green)',
      'var(--violet)',
      'var(--red)',
      'var(--ink-faint)',
    ];
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({
        label: label.toUpperCase().slice(0, 14),
        value: Math.round((value / (totals.value || 1)) * 100),
        color: colors[i % colors.length],
      }));
  }, [items, totals.value]);

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
        <span className="font-display t-xs faint">TERMINAL ▸ PORTFOLIO</span>
        <div style={{ flex: 1 }} />
        <span className="font-display t-xs faint">DISPLAY</span>
        <select
          value={currency}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            setCurrency(e.target.value)
          }
          style={{
            background: 'var(--bg-0)',
            color: 'var(--ink)',
            border: '2px solid var(--line)',
            fontFamily: 'Silkscreen, monospace',
            fontSize: 10,
            letterSpacing: '0.06em',
            padding: '4px 6px',
          }}
          title="Show portfolio in this currency"
        >
          <option value="">NATIVE</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="CHF">CHF</option>
          <option value="JPY">JPY</option>
        </select>
        <span className="font-display t-xs faint">
          {items.length} POSITIONS
        </span>
      </div>

      {editing && (
        <EditPositionDialog
          position={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            posMeta?.reload?.();
          }}
        />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: bp.mobile ? '1fr' : 'repeat(4, 1fr)',
          gap: 10,
        }}
      >
        <KPI
          label="TOTAL VALUE"
          value={`$${totals.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          tone="cyan"
        />
        <KPI
          label="COST BASIS"
          value={`$${totals.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        />
        <KPI
          label="UNREALIZED"
          value={`${totals.gain >= 0 ? '+' : ''}$${totals.gain.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          tone={totals.gain >= 0 ? 'green' : 'red'}
        />
        <KPI
          label="ALL-TIME"
          value={`${totals.gainPct >= 0 ? '+' : ''}${totals.gainPct.toFixed(2)}%`}
          tone={totals.gainPct >= 0 ? 'green' : 'red'}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: bp.mobile ? '1fr' : '1fr 320px',
          gap: 16,
        }}
      >
        <PixelPanel title="POSITIONS" accent="green">
          {posMeta.loading && items.length === 0 ? (
            <div style={{ padding: 24 }}>
              <SkelBar segments={12} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="NO POSITIONS"
              subtitle="Add your first position in the main app."
            />
          ) : (
            <table className="pxl-table">
              <thead>
                <tr>
                  <th>SYM</th>
                  <th>SECTOR</th>
                  <th className="num">QTY</th>
                  <th className="num">AVG</th>
                  <th className="num">LAST</th>
                  <th className="num">VALUE</th>
                  <th className="num">P&amp;L</th>
                  <th className="num">%</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const sym = p.symbol || p.ticker?.symbol || '';
                  const qty = Number(p.shares ?? 0);
                  const buy = Number(p.buy_price ?? 0);
                  const last = Number(
                    p.current_price ?? p.latestPrice?.close ?? 0,
                  );
                  const val = Number(p.current_value ?? 0);
                  const pnl = Number(p.gain_loss ?? 0);
                  const pct = Number(p.gain_loss_percent ?? 0);
                  const sec =
                    p.ticker?.finnhub_industry || p.ticker?.sector || '—';
                  return (
                    <tr
                      key={p.id}
                      onClick={() => onNav('ticker', normalizePositionToTicker(p))}
                    >
                      <td>
                        <div
                          className="row gap-2"
                          style={{ alignItems: 'center' }}
                        >
                          {p.ticker && (
                            <TickerSprite
                              t={normalizePositionToTicker(p)}
                              size={22}
                            />
                          )}
                          <span className="font-display t-sm">{sym}</span>
                        </div>
                      </td>
                      <td className="t-xs faint">{sec}</td>
                      <td className="num">{qty.toLocaleString()}</td>
                      <td className="num faint">${buy.toFixed(2)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        ${last.toFixed(2)}
                      </td>
                      <td className="num">
                        ${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td
                        className={`num ${pnl >= 0 ? 'green' : 'red'}`}
                        style={{ fontWeight: 700 }}
                      >
                        {pnl >= 0 ? '+' : ''}$
                        {Math.abs(pnl).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </td>
                      <td
                        className={`num ${pct >= 0 ? 'green' : 'red'}`}
                        style={{ fontWeight: 700 }}
                      >
                        {pct >= 0 ? '+' : ''}
                        {pct.toFixed(2)}%
                      </td>
                      <td>
                        <div className="row gap-1">
                          <button
                            className="pxl-btn sm ghost"
                            onClick={(e) => editPosition(p, e)}
                            title="Edit position"
                            style={{
                              padding: '2px 6px',
                              color: 'var(--cyan)',
                              boxShadow: 'none',
                            }}
                          >
                            ✎
                          </button>
                          <button
                            className="pxl-btn sm ghost"
                            onClick={(e) => removePosition(p.id, sym, e)}
                            title="Remove position"
                            style={{
                              padding: '2px 6px',
                              color: 'var(--red)',
                              boxShadow: 'none',
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </PixelPanel>

        <PixelPanel title="SECTOR MIX" accent="violet">
          <div style={{ padding: 16 }}>
            {sectorBreakdown.length === 0 ? (
              <div
                className="t-sm faint"
                style={{ textAlign: 'center', padding: 20 }}
              >
                NO DATA
              </div>
            ) : (
              <>
                <PixelDonut
                  data={sectorBreakdown}
                  size={140}
                  thickness={20}
                  center={
                    <div
                      className="col"
                      style={{ alignItems: 'center', lineHeight: 1.1 }}
                    >
                      <span className="font-display t-xs faint">SECTORS</span>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 24,
                          fontWeight: 700,
                          color: 'var(--amber)',
                        }}
                      >
                        {sectorBreakdown.length.toString().padStart(2, '0')}
                      </span>
                    </div>
                  }
                />
                <div className="col gap-2 mt-3">
                  {sectorBreakdown.map((d) => (
                    <div
                      key={d.label}
                      className="row gap-2"
                      style={{ alignItems: 'center' }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          background: d.color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        className="font-display t-xs"
                        style={{ flex: 1 }}
                      >
                        {d.label}
                      </span>
                      <span
                        className="font-mono t-xs"
                        style={{ fontWeight: 700 }}
                      >
                        {d.value}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

// ── EditPositionDialog ─────────────────────────────────────────
interface EditPositionDialogProps {
  position: PositionRow;
  onClose: () => void;
  onSaved: () => void;
}

function EditPositionDialog({
  position,
  onClose,
  onSaved,
}: EditPositionDialogProps) {
  const [shares, setShares] = useState(String(position?.shares ?? '0'));
  const [price, setPrice] = useState(String(position?.buy_price ?? '0'));
  const [date, setDate] = useState((position?.buy_date || '').slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<PortfolioMsg | null>(null);

  const sym = position?.symbol || position?.ticker?.symbol || '—';

  const submit = async (): Promise<void> => {
    const n = Number(shares);
    const p = Number(price);
    if (!isFinite(n) || n <= 0 || !isFinite(p) || p <= 0) {
      setMsg({ tone: 'red', text: 'Invalid shares/price' });
      return;
    }
    setBusy(true);
    const res = await API.portfolioUpdate(position.id, {
      shares: n,
      buy_price: p,
      buy_date: date,
    }).catch(() => null);
    setBusy(false);
    if (res) {
      setMsg({ tone: 'green', text: 'Saved' });
      setTimeout(onSaved, 700);
    } else {
      setMsg({ tone: 'red', text: 'Save failed' });
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 240,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pxl pxl-raised"
        style={{
          width: 'min(520px, 92vw)',
          background: 'var(--bg-1)',
        }}
      >
        <div className="pxl-head">
          <span>
            <span className="dot cyan"></span>EDIT POSITION ▸ {sym}
          </span>
          <span
            className="font-display t-xs faint"
            style={{ cursor: 'pointer' }}
            onClick={onClose}
          >
            ✕
          </span>
        </div>
        <div
          style={{
            padding: 18,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
          }}
        >
          <div className="col gap-1">
            <span className="font-display t-xs faint">SHARES</span>
            <input
              type="number"
              value={shares}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setShares(e.target.value)
              }
              className="pxl-input"
              style={{ paddingLeft: 10 }}
              step="0.01"
              min="0.01"
            />
          </div>
          <div className="col gap-1">
            <span className="font-display t-xs faint">BUY PRICE</span>
            <input
              type="number"
              value={price}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setPrice(e.target.value)
              }
              className="pxl-input"
              style={{ paddingLeft: 10 }}
              step="0.01"
              min="0.01"
            />
          </div>
          <div className="col gap-1">
            <span className="font-display t-xs faint">DATE</span>
            <input
              type="date"
              value={date}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setDate(e.target.value)
              }
              className="pxl-input"
              style={{ paddingLeft: 10 }}
            />
          </div>
        </div>
        {msg && (
          <div
            style={{
              padding: '0 18px 8px',
              color: `var(--${msg.tone})`,
              fontFamily: 'Silkscreen, monospace',
              fontSize: 11,
              letterSpacing: '0.06em',
            }}
          >
            ▸ {msg.text}
          </div>
        )}
        <div style={{ padding: '0 18px 16px', display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }} />
          <button className="pxl-btn" onClick={onClose} disabled={busy}>
            CANCEL
          </button>
          <button className="pxl-btn primary" onClick={submit} disabled={busy}>
            {busy ? 'SAVING…' : '▸ SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
}

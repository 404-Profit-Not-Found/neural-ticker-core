// Price alerts — list / edit / disable / delete user-defined triggers.
import {
  PixelBadge,
  PixelPanel,
  useBreakpoint,
} from '../components/pixel.tsx';
import { EmptyState, Spinner } from '../components/Skeletons.tsx';
import { API } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import type { NavFn, Ticker } from '../lib/types.ts';
import { KPI } from './_kpi.tsx';

interface AlertRow {
  id: string | number;
  symbol: string;
  alert_type?: string;
  target_value?: number;
  reference_price?: number;
  triggered_at?: string | null;
  enabled?: boolean;
  created_at?: string;
  ticker?: { symbol?: string; current_price?: number };
}

export interface AlertsPageProps {
  onNav: NavFn;
}

export function AlertsPage({ onNav }: AlertsPageProps) {
  const bp = useBreakpoint();
  const [data, meta] = useApi<AlertRow[] | null>(
    () => API.alerts() as Promise<AlertRow[]>,
    ['alerts'],
  );
  const items: AlertRow[] = Array.isArray(data) ? data : [];

  const armed = items.filter(
    (a) => !a.triggered_at && (a.enabled ?? true),
  ).length;
  const triggered = items.filter((a) => a.triggered_at).length;

  const removeAlert = async (
    id: string | number,
    sym: string,
    evt: React.MouseEvent,
  ): Promise<void> => {
    evt.stopPropagation();
    if (!confirm(`Delete alert for ${sym}?`)) return;
    await API.alertDelete(id).catch(() => null);
    meta?.reload?.();
  };

  const toggleAlert = async (
    a: AlertRow,
    evt: React.MouseEvent,
  ): Promise<void> => {
    evt.stopPropagation();
    const current = a.enabled ?? true;
    await API.alertUpdate(a.id, { enabled: !current }).catch(() => null);
    meta?.reload?.();
  };

  const editAlertTarget = async (
    a: AlertRow,
    evt: React.MouseEvent,
  ): Promise<void> => {
    evt.stopPropagation();
    const raw = prompt(
      `New target for ${a.symbol} (${a.alert_type}):`,
      String(a.target_value),
    );
    if (!raw) return;
    const v = Number(raw);
    if (!isFinite(v) || v <= 0) return;
    await API.alertUpdate(a.id, { target_value: v }).catch(() => null);
    meta?.reload?.();
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
        <span className="font-display t-xs faint">TERMINAL ▸ PRICE ALERTS</span>
        <div style={{ flex: 1 }} />
        <span className="font-display t-xs faint">{items.length} TOTAL</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: bp.mobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        <KPI label="ARMED" value={armed.toString().padStart(2, '0')} tone="cyan" />
        <KPI
          label="TRIGGERED"
          value={triggered.toString().padStart(2, '0')}
          tone="amber"
        />
        <KPI
          label="TOTAL"
          value={items.length.toString().padStart(2, '0')}
          tone="green"
        />
      </div>

      <PixelPanel
        title="PRICE ALERTS"
        accent="amber"
        actions={meta?.loading ? <Spinner label="LOADING" /> : undefined}
      >
        {items.length === 0 ? (
          <EmptyState
            icon="bell"
            title={meta?.loading ? 'LOADING' : 'NO ALERTS'}
            subtitle="Set price alerts from a ticker detail page."
          />
        ) : (
          <table className="pxl-table">
            <thead>
              <tr>
                <th>SYM</th>
                <th>TYPE</th>
                <th className="num">TARGET</th>
                <th className="num">CURRENT</th>
                <th>STATUS</th>
                <th>CREATED</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const sym = a.symbol || a.ticker?.symbol || '';
                const cur = Number(
                  a.reference_price ?? a.ticker?.current_price ?? 0,
                );
                const target = Number(a.target_value ?? 0);
                const type = String(a.alert_type || '')
                  .replace('_', ' ')
                  .toUpperCase();
                const isTriggered = !!a.triggered_at;
                const tone: 'amber' | 'green' | 'default' = isTriggered
                  ? 'amber'
                  : (a.enabled ?? true)
                    ? 'green'
                    : 'default';
                const stateLabel = isTriggered
                  ? 'TRIGGERED'
                  : (a.enabled ?? true)
                    ? 'ARMED'
                    : 'DISABLED';
                return (
                  <tr
                    key={a.id}
                    onClick={() => {
                      if (!sym) return;
                      const stub: Ticker = {
                        sym,
                        name: sym,
                        sector: '—',
                        price: cur,
                        change: 0,
                        ai: 'HOLD',
                        risk: 5,
                        upside: 0,
                        mc: '—',
                        pe: null,
                        seed: sym.charCodeAt(0),
                        spark: [0, 0],
                        candles: [],
                        _live: true,
                      };
                      onNav('ticker', stub);
                    }}
                  >
                    <td>
                      <span className="font-display t-sm">{sym}</span>
                    </td>
                    <td>
                      <PixelBadge>{type}</PixelBadge>
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      ${target.toFixed(2)}
                    </td>
                    <td className="num">${cur.toFixed(2)}</td>
                    <td>
                      <PixelBadge tone={tone}>{stateLabel}</PixelBadge>
                    </td>
                    <td className="t-xs faint">
                      {a.created_at
                        ? new Date(a.created_at).toISOString().slice(0, 10)
                        : '—'}
                    </td>
                    <td>
                      <div className="row gap-1">
                        <button
                          className="pxl-btn sm ghost"
                          onClick={(e) => editAlertTarget(a, e)}
                          title="Edit target"
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
                          onClick={(e) => toggleAlert(a, e)}
                          title={
                            (a.enabled ?? true)
                              ? 'Disable alert'
                              : 'Enable alert'
                          }
                          style={{
                            padding: '2px 6px',
                            color: (a.enabled ?? true) ? 'var(--amber)' : 'var(--green)',
                            boxShadow: 'none',
                          }}
                        >
                          {(a.enabled ?? true) ? '⏸' : '▶'}
                        </button>
                        <button
                          className="pxl-btn sm ghost"
                          onClick={(e) => removeAlert(a.id, sym, e)}
                          title="Delete alert"
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
    </div>
  );
}

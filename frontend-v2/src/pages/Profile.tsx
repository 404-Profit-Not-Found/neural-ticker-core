// Profile — credits balance, transaction history, push subscription.
import { useEffect, useMemo, useState } from 'react';
import {
  PixelBadge,
  PixelIcon,
  PixelPanel,
  RankBadge,
  SpriteMascot,
  useBreakpoint,
} from '../components/pixel.tsx';
import { EmptyState, Spinner } from '../components/Skeletons.tsx';
import { API } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import { KPI } from './_kpi.tsx';

// ── Helpers ────────────────────────────────────────────────────
function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ── PushControls ───────────────────────────────────────────────
type PushState =
  | 'subscribed'
  | 'denied'
  | 'unsubscribed'
  | 'unsupported'
  | 'unknown';

interface PushMsg {
  tone: 'green' | 'red' | 'amber';
  text: string;
}

function PushControls() {
  const supported =
    'serviceWorker' in navigator && 'PushManager' in window;
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<PushState>('unknown');
  const [msg, setMsg] = useState<PushMsg | null>(null);

  // Read current subscription state on mount
  useEffect(() => {
    if (!supported) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker
      .getRegistration('/v2/')
      .then(async (reg) => {
        if (!reg) {
          setState('unsubscribed');
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? 'subscribed' : 'unsubscribed');
      })
      .catch(() => setState('unsubscribed'));
  }, [supported]);

  const showMsg = (m: PushMsg): void => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3000);
  };

  const subscribe = async (): Promise<void> => {
    setBusy(true);
    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'unsubscribed');
        showMsg({ tone: 'amber', text: 'Notification permission ' + perm });
        setBusy(false);
        return;
      }
      // 2. Get VAPID key
      const v = (await API.pushVapidKey()) as { key?: string } | null;
      if (!v?.key) throw new Error('no vapid key');
      // 3. Register SW + subscribe
      const reg = await navigator.serviceWorker.register('/v2/sw.js', {
        scope: '/v2/',
      });
      if (reg.installing) {
        await new Promise<void>((resolve) => {
          const w = reg.installing;
          if (!w) {
            resolve();
            return;
          }
          w.addEventListener('statechange', () => {
            if (w.state === 'activated') resolve();
          });
        });
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast to BufferSource — modern lib.dom narrows Uint8Array's buffer
        // type to ArrayBuffer | SharedArrayBuffer; we know ours is plain.
        applicationServerKey: urlBase64ToUint8Array(v.key) as BufferSource,
      });
      // 4. Send subscription to backend
      const json = sub.toJSON();
      await API.pushSubscribe({
        endpoint: json.endpoint,
        keys: json.keys,
      });
      setState('subscribed');
      showMsg({ tone: 'green', text: 'Push notifications enabled' });
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'unknown';
      showMsg({ tone: 'red', text: 'Subscribe failed: ' + m });
    }
    setBusy(false);
  };

  const unsubscribe = async (): Promise<void> => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/v2/');
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) {
        await API.pushUnsubscribe(sub.endpoint).catch(() => null);
        await sub.unsubscribe();
      }
      setState('unsubscribed');
      showMsg({ tone: 'amber', text: 'Push notifications disabled' });
    } catch {
      showMsg({ tone: 'red', text: 'Unsubscribe failed' });
    }
    setBusy(false);
  };

  return (
    <div
      className="row gap-2"
      style={{ alignItems: 'center', flexWrap: 'wrap' }}
    >
      <PixelIcon
        name="bell"
        size={14}
        color={
          state === 'subscribed'
            ? 'var(--green)'
            : state === 'denied'
              ? 'var(--red)'
              : 'var(--ink-dim)'
        }
      />
      <span className="font-display t-xs faint">PUSH</span>
      <PixelBadge
        tone={
          state === 'subscribed'
            ? 'green'
            : state === 'denied'
              ? 'red'
              : 'default'
        }
      >
        {state.toUpperCase()}
      </PixelBadge>
      {state === 'subscribed' ? (
        <button className="pxl-btn sm" onClick={unsubscribe} disabled={busy}>
          DISABLE
        </button>
      ) : state === 'denied' ? (
        <span className="t-xs faint">
          unblock notifications in browser settings
        </span>
      ) : state === 'unsupported' ? (
        <span className="t-xs faint">not supported in this browser</span>
      ) : (
        <button
          className="pxl-btn sm primary"
          onClick={subscribe}
          disabled={busy}
        >
          ENABLE
        </button>
      )}
      {msg && (
        <span
          className="t-xs"
          style={{ color: `var(--${msg.tone})`, marginLeft: 6 }}
        >
          ▸ {msg.text}
        </span>
      )}
    </div>
  );
}

// ── Profile main ──────────────────────────────────────────────
interface CreditTx {
  id?: string | number;
  amount?: number;
  reason?: string;
  created_at?: string;
  metadata?: { symbol?: string; model?: string };
}

interface MeProfile {
  id?: string | number;
  email?: string;
  full_name?: string;
  role?: string;
  tier?: string;
  credits_balance?: number;
  credit_transactions?: CreditTx[];
}

export function ProfilePage() {
  const bp = useBreakpoint();
  const [me, meMeta] = useApi<MeProfile | null>(
    () => API.me() as Promise<MeProfile>,
    ['me'],
  );
  const tier = (me?.tier || '—').toUpperCase();
  const role = (me?.role || '—').toUpperCase();
  const credits = me?.credits_balance ?? 0;
  const tx: CreditTx[] = Array.isArray(me?.credit_transactions)
    ? me!.credit_transactions!
    : [];

  // Stats from tx
  const stats = useMemo(() => {
    let spent = 0;
    let gained = 0;
    const byReason = new Map<string, number>();
    for (const t of tx) {
      const a = Number(t.amount || 0);
      if (a < 0) spent += Math.abs(a);
      else gained += a;
      const k = t.reason || 'other';
      byReason.set(k, (byReason.get(k) || 0) + Math.abs(a));
    }
    return {
      spent,
      gained,
      byReason: [...byReason.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
    };
  }, [tx]);

  if (meMeta?.loading && !me) {
    return (
      <div style={{ padding: 24 }}>
        <Spinner label="LOADING PROFILE" />
      </div>
    );
  }
  if (!me) {
    return (
      <div style={{ padding: bp.mobile ? '0 12px 24px' : '0 20px 32px' }}>
        <EmptyState
          icon="shield"
          title="NOT SIGNED IN"
          subtitle="Sign in from the header to view your profile."
        />
      </div>
    );
  }

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
        <span className="font-display t-xs faint">TERMINAL ▸ PROFILE</span>
        <div style={{ flex: 1 }} />
        <span className="font-display t-xs faint">USER · {role}</span>
      </div>

      {/* Identity card + KPIs */}
      <div className="pxl pxl-raised" style={{ padding: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: bp.mobile
              ? '1fr'
              : 'auto minmax(0,1fr) repeat(3, minmax(120px, 1fr))',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <SpriteMascot
            seed={
              String(me.id ?? '777')
                .split('')
                .reduce((a: number, c: string) => a + c.charCodeAt(0), 0) ||
              777
            }
            size={56}
            colors={[
              'transparent',
              'var(--cyan)',
              'var(--cyan-dark)',
              'var(--amber)',
            ]}
          />
          <div className="col" style={{ minWidth: 0 }}>
            <span style={{ fontFamily: 'Silkscreen', fontSize: 18 }}>
              {(me.full_name || me.email || '—')
                .toUpperCase()
                .slice(0, 24)}
            </span>
            <span
              className="t-xs dim"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {me.email}
            </span>
            <div className="row gap-1 mt-2">
              <RankBadge
                rank={
                  role === 'ADMIN'
                    ? 'ADMIN'
                    : tier === 'WHALE'
                      ? 'WHALE'
                      : tier === 'DIAMOND'
                        ? 'DIAMOND'
                        : 'PRO'
                }
              />
              <PixelBadge tone="cyan">{tier}</PixelBadge>
            </div>
          </div>
          <KPI label="CREDITS" value={credits.toString()} tone="amber" />
          <KPI
            label="SPENT (LIFETIME)"
            value={stats.spent.toString()}
            tone="red"
          />
          <KPI
            label="EARNED"
            value={stats.gained.toString()}
            tone="green"
          />
        </div>

        {/* Push notifications + settings */}
        <div className="pxl-rule mt-3" />
        <div className="mt-3">
          <PushControls />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: bp.mobile ? '1fr' : '1fr 320px',
          gap: 16,
        }}
      >
        <PixelPanel
          title="CREDIT TRANSACTIONS"
          accent="amber"
          actions={
            <span className="font-display t-xs faint">
              {tx.length} ENTRIES
            </span>
          }
        >
          {tx.length === 0 ? (
            <EmptyState
              title="NO TRANSACTIONS"
              subtitle="Spend credits via Run AI Research."
            />
          ) : (
            <table className="pxl-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>REASON</th>
                  <th>META</th>
                  <th className="num">AMT</th>
                </tr>
              </thead>
              <tbody>
                {tx.slice(0, 60).map((t, i) => {
                  const a = Number(t.amount || 0);
                  const tone: 'green' | 'red' = a >= 0 ? 'green' : 'red';
                  const meta =
                    t.metadata && (t.metadata.symbol || t.metadata.model)
                      ? [t.metadata.symbol, t.metadata.model]
                          .filter(Boolean)
                          .join(' · ')
                      : '—';
                  return (
                    <tr key={t.id || i}>
                      <td className="t-xs faint">
                        {(t.created_at || '').slice(0, 16).replace('T', ' ')}
                      </td>
                      <td className="t-xs">
                        {String(t.reason || '—')
                          .replace(/_/g, ' ')
                          .toUpperCase()}
                      </td>
                      <td className="t-xs faint">{meta}</td>
                      <td
                        className={`num ${tone}`}
                        style={{ fontWeight: 700 }}
                      >
                        {a >= 0 ? '+' : ''}
                        {a}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </PixelPanel>

        <PixelPanel title="SPEND BY REASON" accent="cyan">
          {stats.byReason.length === 0 ? (
            <EmptyState title="NO SPEND DATA" subtitle="—" />
          ) : (
            <div className="col gap-2" style={{ padding: 14 }}>
              {stats.byReason.map(([k, v]) => {
                const maxV = stats.byReason[0][1] || 1;
                return (
                  <div
                    key={k}
                    className="row gap-2"
                    style={{ alignItems: 'center' }}
                  >
                    <span
                      className="font-display t-xs"
                      style={{ width: 110, color: 'var(--ink-dim)' }}
                    >
                      {k.replace(/_/g, ' ').toUpperCase().slice(0, 16)}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 10,
                        background: 'var(--bg-0)',
                        border: '2px solid var(--line)',
                      }}
                    >
                      <div
                        style={{
                          width: `${(v / maxV) * 100}%`,
                          height: '100%',
                          background: 'var(--cyan)',
                        }}
                      />
                    </div>
                    <span
                      className="font-mono t-xs"
                      style={{ width: 36, textAlign: 'right', fontWeight: 700 }}
                    >
                      {v}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </PixelPanel>
      </div>
    </div>
  );
}

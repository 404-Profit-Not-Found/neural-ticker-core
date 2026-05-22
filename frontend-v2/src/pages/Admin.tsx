// Admin Console — list users + grant credits / change role / change tier.
// Only accessible to role=admin (backend enforces).
import { useState, type ChangeEvent } from 'react';
import {
  PixelBadge,
  PixelIcon,
  PixelPanel,
  useBreakpoint,
} from '../components/pixel.tsx';
import { EmptyState, Spinner } from '../components/Skeletons.tsx';
import { API } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';

interface AdminUserRow {
  id: string | number;
  email?: string;
  full_name?: string;
  role?: 'admin' | 'user' | 'waitlist' | string;
  tier?: 'free' | 'pro' | 'whale' | 'diamond' | string;
  credits_balance?: number;
  created_at?: string;
}

interface AdminMsg {
  tone: 'green' | 'red';
  text: string;
}

export function AdminPage() {
  const bp = useBreakpoint();
  const [users, meta] = useApi<AdminUserRow[] | null>(
    () => API.adminUsers() as Promise<AdminUserRow[]>,
    ['admin-users'],
  );
  const items: AdminUserRow[] = Array.isArray(users) ? users : [];
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState<AdminMsg | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = items.filter((u) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (u.email || '').toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q) ||
      (u.tier || '').toLowerCase().includes(q)
    );
  });

  const showMsg = (m: AdminMsg): void => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2800);
  };

  const grantCredits = async (u: AdminUserRow): Promise<void> => {
    const raw = prompt(
      `Grant credits to ${u.email} (negative = revoke):`,
      '10',
    );
    if (!raw) return;
    const amount = Number(raw);
    if (!isFinite(amount) || amount === 0) return;
    setBusy(true);
    const res = await API.adminGrantCredits(
      String(u.id),
      amount,
      'admin_gift',
    ).catch(() => null);
    setBusy(false);
    if (res) {
      showMsg({
        tone: 'green',
        text: `${amount > 0 ? '+' : ''}${amount} credits to ${u.email}`,
      });
      meta?.reload?.();
    } else showMsg({ tone: 'red', text: 'Grant failed' });
  };

  const changeRole = async (u: AdminUserRow): Promise<void> => {
    const role = prompt(
      `Set role for ${u.email} (admin/user/waitlist):`,
      u.role || 'user',
    );
    if (!role || role === u.role) return;
    setBusy(true);
    const res = await API.adminSetRole(String(u.id), role).catch(() => null);
    setBusy(false);
    if (res) {
      showMsg({ tone: 'green', text: `Role → ${role}` });
      meta?.reload?.();
    } else showMsg({ tone: 'red', text: 'Role change failed' });
  };

  const changeTier = async (u: AdminUserRow): Promise<void> => {
    const tier = prompt(
      `Set tier for ${u.email} (free/pro/whale/diamond):`,
      u.tier || 'free',
    );
    if (!tier || tier === u.tier) return;
    setBusy(true);
    const res = await API.adminSetTier(String(u.id), tier).catch(() => null);
    setBusy(false);
    if (res) {
      showMsg({ tone: 'green', text: `Tier → ${tier}` });
      meta?.reload?.();
    } else showMsg({ tone: 'red', text: 'Tier change failed' });
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
        <span className="font-display t-xs faint">TERMINAL ▸ ADMIN</span>
        <PixelBadge tone="red">ADMIN MODE</PixelBadge>
        <div style={{ flex: 1 }} />
        <span className="font-display t-xs faint">{items.length} USERS</span>
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

      <div className="pxl pxl-raised p-3">
        <input
          className="pxl-input"
          placeholder="filter by email / name / role / tier..."
          value={filter}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setFilter(e.target.value)
          }
          style={{ paddingLeft: 10 }}
        />
      </div>

      <PixelPanel
        title="USERS"
        accent="red"
        actions={meta?.loading ? <Spinner label="LOADING" /> : undefined}
      >
        {items.length === 0 && meta?.loading && (
          <div style={{ padding: 24 }}>
            <Spinner label="FETCHING" />
          </div>
        )}
        {items.length === 0 && !meta?.loading && (
          <EmptyState
            title="NO USERS"
            subtitle="API returned empty list (or not authorised)."
          />
        )}
        {items.length > 0 && (
          <table className="pxl-table">
            <thead>
              <tr>
                <th>EMAIL</th>
                <th>NAME</th>
                <th>ROLE</th>
                <th>TIER</th>
                <th className="num">CREDITS</th>
                <th>CREATED</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((u) => {
                const created = u.created_at
                  ? new Date(u.created_at).toISOString().slice(0, 10)
                  : '—';
                return (
                  <tr key={u.id}>
                    <td className="font-mono t-xs">{u.email}</td>
                    <td className="t-xs">
                      {(u.full_name || '—').slice(0, 24)}
                    </td>
                    <td>
                      <PixelBadge
                        tone={
                          u.role === 'admin'
                            ? 'red'
                            : u.role === 'waitlist'
                              ? 'amber'
                              : 'default'
                        }
                      >
                        {String(u.role || '—').toUpperCase()}
                      </PixelBadge>
                    </td>
                    <td>
                      <PixelBadge tone="cyan">
                        {String(u.tier || '—').toUpperCase()}
                      </PixelBadge>
                    </td>
                    <td
                      className="num"
                      style={{ fontWeight: 700, color: 'var(--amber)' }}
                    >
                      {u.credits_balance ?? '—'}
                    </td>
                    <td className="t-xs faint">{created}</td>
                    <td>
                      <span className="row gap-1">
                        <button
                          className="pxl-btn sm"
                          disabled={busy}
                          onClick={() => grantCredits(u)}
                          title="Grant credits"
                        >
                          <PixelIcon name="bolt" size={8} color="currentColor" /> ¢
                        </button>
                        <button
                          className="pxl-btn sm"
                          disabled={busy}
                          onClick={() => changeRole(u)}
                          title="Change role"
                        >
                          R
                        </button>
                        <button
                          className="pxl-btn sm"
                          disabled={busy}
                          onClick={() => changeTier(u)}
                          title="Change tier"
                        >
                          T
                        </button>
                      </span>
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

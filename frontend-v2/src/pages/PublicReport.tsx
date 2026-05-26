// Publicly shared research report — landed via /v2/?share=ID:SIG.
import {
  PixelBadge,
  PixelPanel,
  useBreakpoint,
} from '../components/pixel.tsx';
import { EmptyState, Spinner } from '../components/Skeletons.tsx';
import { API } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import type { NavFn } from '../lib/types.ts';

interface PublicReportData {
  title?: string;
  tickers?: string[];
  status?: string;
  created_at?: string;
  answer_markdown?: string;
  content?: string;
  models_used?: string[];
}

export interface PublicReportPageProps {
  shareKey: string;
  onNav: NavFn;
}

export function PublicReportPage({ shareKey, onNav }: PublicReportPageProps) {
  const [id, signature] = (shareKey || '').split(':');
  const [data, meta] = useApi<PublicReportData | null>(
    () =>
      id && signature
        ? (API.researchPublic(id, signature) as Promise<PublicReportData>)
        : Promise.resolve(null),
    ['public-report', id, signature],
  );

  const bp = useBreakpoint();
  if (!id || !signature) {
    return (
      <div style={{ padding: 32 }}>
        <EmptyState
          icon="news"
          title="INVALID SHARE LINK"
          subtitle="The URL is missing report ID or signature."
        />
      </div>
    );
  }
  if (meta?.loading && !data) {
    return (
      <div style={{ padding: 32 }}>
        <Spinner label="LOADING SHARED REPORT" />
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ padding: 32 }}>
        <EmptyState
          icon="shield"
          title="REPORT NOT FOUND"
          subtitle="Either the signature is invalid or the report has been removed."
        />
      </div>
    );
  }

  const tickers = Array.isArray(data.tickers) ? data.tickers : [];
  const body = String(data.answer_markdown || data.content || '').replace(
    /[#*_`]/g,
    '',
  );
  const created = data.created_at
    ? new Date(data.created_at).toISOString().slice(0, 16).replace('T', ' ')
    : '—';

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
        <span className="font-display t-xs faint">
          TERMINAL ▸ SHARED REPORT ▸ {id.slice(0, 8)}…
        </span>
        <div style={{ flex: 1 }} />
        <PixelBadge tone="violet">PUBLIC</PixelBadge>
        <button className="pxl-btn sm" onClick={() => onNav('dashboard')}>
          ◀ DASHBOARD
        </button>
      </div>

      <PixelPanel
        title={(data.title || 'RESEARCH REPORT').toUpperCase().slice(0, 60)}
        accent="amber"
        actions={
          <span className="row gap-2" style={{ alignItems: 'center' }}>
            <PixelBadge tone="cyan">
              {data.status?.toUpperCase() || '—'}
            </PixelBadge>
            <span className="font-display t-xs faint">{created}</span>
          </span>
        }
      >
        <div style={{ padding: 18 }}>
          <div className="row gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
            {tickers.map((sym) => (
              <PixelBadge key={sym} tone="amber">
                ${sym}
              </PixelBadge>
            ))}
            {data.models_used?.length && (
              <PixelBadge tone="violet">
                {data.models_used.join(' ▸ ').toUpperCase()}
              </PixelBadge>
            )}
          </div>
          {body ? (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                maxHeight: '65vh',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                color: 'var(--ink)',
              }}
            >
              {body.slice(0, 8000)}
              {body.length > 8000 && (
                <span className="faint t-xs"> … (truncated)</span>
              )}
            </div>
          ) : (
            <EmptyState
              title="EMPTY REPORT"
              subtitle="This report has no content yet."
            />
          )}
        </div>
      </PixelPanel>
    </div>
  );
}

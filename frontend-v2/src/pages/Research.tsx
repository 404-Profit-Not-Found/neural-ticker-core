// AI Research library — list/filter user's research reports + contribute upload.
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
import type { NavFn, Ticker } from '../lib/types.ts';

type StatusFilter = 'all' | 'completed' | 'processing' | 'pending' | 'failed';

interface ResearchListRow {
  id: string | number;
  status?: string;
  created_at?: string;
  quality?: string;
  provider?: string;
  tickers?: string[];
  title?: string;
  question?: string;
  answer_markdown?: string;
  rarity?: string;
}

interface ResearchListResponse {
  data?: ResearchListRow[];
  total?: number;
}

export interface ResearchPageProps {
  onNav: NavFn;
}

export function ResearchPage({ onNav }: ResearchPageProps) {
  const bp = useBreakpoint();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const page = 1;
  const [uploadOpen, setUploadOpen] = useState(false);
  const [data, meta] = useApi<ResearchListResponse | ResearchListRow[] | null>(
    () =>
      API.researchList({
        status: filter,
        page,
        limit: 30,
      }) as Promise<ResearchListResponse>,
    ['research-list', filter, page],
  );
  const items: ResearchListRow[] = Array.isArray(data)
    ? data
    : data?.data ?? [];
  const total: number = Array.isArray(data)
    ? data.length
    : data?.total ?? items.length;

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
        style={{
          alignItems: 'center',
          gap: 12,
          padding: '12px 0',
          flexWrap: 'wrap',
        }}
      >
        <span className="font-display t-xs faint">TERMINAL ▸ AI RESEARCH</span>
        <div style={{ flex: 1 }} />
        <button
          className="pxl-btn sm"
          onClick={() => setUploadOpen(true)}
          style={{ color: 'var(--violet)', borderColor: 'var(--line)' }}
        >
          <PixelIcon name="brain" size={8} color="currentColor" /> + CONTRIBUTE
        </button>
        <span className="font-display t-xs faint">{total} REPORTS</span>
      </div>

      {uploadOpen && (
        <UploadResearchDialog
          onClose={() => {
            setUploadOpen(false);
            meta?.reload?.();
          }}
        />
      )}

      <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
        {(
          ['all', 'completed', 'processing', 'pending', 'failed'] as const
        ).map((f) => (
          <button
            key={f}
            className="pxl-btn sm"
            onClick={() => setFilter(f)}
            style={{
              color: filter === f ? 'var(--amber)' : 'var(--ink-dim)',
              borderColor: filter === f ? 'var(--amber)' : 'var(--line)',
              background:
                filter === f ? 'rgba(255,194,60,0.08)' : 'var(--bg-2)',
            }}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      <PixelPanel
        title="REPORT LIBRARY"
        accent="amber"
        actions={meta?.loading ? <Spinner label="LOADING" /> : undefined}
      >
        {items.length === 0 ? (
          <EmptyState
            title={meta?.loading ? 'FETCHING…' : 'NO REPORTS'}
            subtitle={
              meta?.loading
                ? 'Hang tight.'
                : 'Run a research ticket from the dashboard or chat overlay.'
            }
          />
        ) : (
          <div className="col">
            {items.map((r) => {
              const dt = r.created_at ? new Date(r.created_at) : null;
              const date = dt ? dt.toISOString().slice(0, 10) : '—';
              const time = dt ? dt.toISOString().slice(11, 16) : '';
              const tone: 'green' | 'amber' | 'red' | 'cyan' =
                r.status === 'completed'
                  ? 'green'
                  : r.status === 'processing' || r.status === 'pending'
                    ? 'amber'
                    : r.status === 'failed'
                      ? 'red'
                      : 'cyan';
              const tickers = Array.isArray(r.tickers)
                ? r.tickers.slice(0, 5)
                : [];
              return (
                <div
                  key={r.id}
                  style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--line-soft)',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    className="row gap-3"
                    style={{ alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <span
                      className="font-mono t-xs faint"
                      style={{ width: 84 }}
                    >
                      {date} {time}
                    </span>
                    <PixelBadge tone={tone}>
                      {(r.status || '—').toUpperCase()}
                    </PixelBadge>
                    {(r.quality || r.provider) && (
                      <PixelBadge tone={r.quality === 'deep' ? 'amber' : 'cyan'}>
                        {(r.quality || r.provider || '').toUpperCase()}
                      </PixelBadge>
                    )}
                    <div
                      className="row gap-1"
                      style={{
                        flex: 1,
                        minWidth: 100,
                        flexWrap: 'wrap',
                      }}
                    >
                      {tickers.map((sym) => (
                        <button
                          key={sym}
                          className="pxl-btn sm ghost"
                          onClick={() => {
                            const t: Ticker = {
                              sym,
                              name: sym,
                              sector: '—',
                              price: 0,
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
                            onNav('ticker', t);
                          }}
                          style={{
                            color: 'var(--cyan)',
                            padding: '2px 6px',
                            boxShadow: 'none',
                          }}
                        >
                          ${sym}
                        </button>
                      ))}
                    </div>
                    {r.rarity && (
                      <PixelBadge tone="violet">
                        {String(r.rarity).toUpperCase()}
                      </PixelBadge>
                    )}
                  </div>
                  <div className="t-sm mt-2" style={{ color: 'var(--ink)' }}>
                    {r.title || r.question || '(no title)'}
                  </div>
                  {r.answer_markdown && (
                    <div
                      className="t-xs faint mt-2"
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {String(r.answer_markdown)
                        .replace(/[#*_`]/g, '')
                        .slice(0, 220)}
                      …
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PixelPanel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UploadResearchDialog — paste markdown for AI scoring → credits
// ─────────────────────────────────────────────────────────────
interface UploadMsg {
  tone: 'green' | 'red';
  text: string;
}

interface ContributeResponse {
  credits_earned?: number;
  creditsAwarded?: number;
  score?: number;
  _err?: unknown;
}

function UploadResearchDialog({ onClose }: { onClose: () => void }) {
  const [tickersStr, setTickersStr] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<UploadMsg | null>(null);

  const submit = async (): Promise<void> => {
    const tickers = tickersStr
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) {
      setMsg({ tone: 'red', text: 'Add at least one ticker symbol.' });
      return;
    }
    if (content.trim().length < 50) {
      setMsg({
        tone: 'red',
        text: 'Content too short — paste at least 50 chars of markdown.',
      });
      return;
    }
    setBusy(true);
    const res = (await API.researchContribute(tickers, content).catch(
      (e: unknown) => ({ _err: e }),
    )) as ContributeResponse | null;
    setBusy(false);
    if (!res || res._err) {
      setMsg({
        tone: 'red',
        text: 'Contribution failed (auth or backend error)',
      });
      return;
    }
    const credits = res.credits_earned ?? res.creditsAwarded ?? res.score ?? '?';
    setMsg({ tone: 'green', text: `Accepted — earned ${credits} credit(s).` });
    setTickersStr('');
    setContent('');
    setTimeout(onClose, 1800);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 220,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '6vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pxl pxl-raised"
        style={{
          width: 'min(680px, 92vw)',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-1)',
        }}
      >
        <div className="pxl-head">
          <span>
            <span className="dot violet"></span>CONTRIBUTE RESEARCH ▸ EARN CREDITS
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
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            overflow: 'auto',
          }}
        >
          <p className="t-xs dim" style={{ lineHeight: 1.5 }}>
            Paste your own research / LLM-generated note covering one or more
            tickers. High-quality, well-cited markdown earns more credits.
            Plagiarised or trivial content is rejected.
          </p>

          <div className="col gap-1">
            <span className="font-display t-xs faint">
              TICKERS (COMMA OR SPACE SEPARATED)
            </span>
            <input
              className="pxl-input"
              placeholder="e.g. NVDA, AAPL, MSFT"
              value={tickersStr}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setTickersStr(e.target.value)
              }
              disabled={busy}
              style={{ paddingLeft: 10, textTransform: 'uppercase' }}
            />
          </div>

          <div className="col gap-1">
            <span className="font-display t-xs faint">MARKDOWN CONTENT</span>
            <textarea
              value={content}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setContent(e.target.value)
              }
              disabled={busy}
              placeholder={`# Bullish case for NVDA\n\nThesis: ...\n\nKey catalysts:\n- ...\n\nRisks:\n- ...`}
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 12,
                background: 'var(--bg-0)',
                color: 'var(--ink)',
                border: '2px solid var(--line)',
                padding: '8px 10px',
                minHeight: 240,
                resize: 'vertical',
              }}
            />
            <span className="t-xs faint" style={{ textAlign: 'right' }}>
              {content.length.toLocaleString()} chars
            </span>
          </div>

          {msg && (
            <div
              style={{
                color: `var(--${msg.tone})`,
                fontFamily: 'Silkscreen, monospace',
                fontSize: 11,
                letterSpacing: '0.06em',
              }}
            >
              ▸ {msg.text}
            </div>
          )}

          <div className="row gap-2">
            <div style={{ flex: 1 }} />
            <button className="pxl-btn" onClick={onClose} disabled={busy}>
              CANCEL
            </button>
            <button
              className="pxl-btn primary"
              onClick={submit}
              disabled={busy || !tickersStr.trim() || content.trim().length < 50}
            >
              {busy ? 'SCORING…' : '▸ SUBMIT FOR SCORING'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

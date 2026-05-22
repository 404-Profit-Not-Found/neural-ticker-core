// Dashboard view — pixel terminal
import {
  useState,
  useEffect,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import {
  PixelPanel,
  PixelBadge,
  Sparkline,
  PixelIcon,
  SegmentedBar,
  VerdictPill,
  PriceDelta,
  TickerSprite,
  PixelDonut,
  PixelHeart,
  StatusLED,
  useBreakpoint,
} from '../components/pixel.tsx';
import {
  Skel,
  SkelChart,
  Spinner,
  StatTileSkel,
  OpportunityCardSkel,
  NewsRowSkel,
  WatchlistRowSkel,
  TableRowSkel,
  AIDigestSkel,
  DonutSkel,
} from '../components/Skeletons.tsx';
import { API } from '../lib/api.ts';
import { MOCK } from '../lib/data.ts';
import { useApi } from '../lib/hooks.ts';
import { useTickersWithFallback } from '../lib/tickers.ts';
import type { NavFn, Ticker } from '../lib/types.ts';

// ── Marquee ──────────────────────────────────────────────────
interface IndexQuote {
  name: string;
  symbol?: string;
  val: number;
  ch: number;
}

export function MarketTicker() {
  const [live] = useApi<IndexQuote[]>(
    () => API.indices() as Promise<IndexQuote[]>,
    ['indices'],
    { poll: 30000 },
  );
  const items: IndexQuote[] =
    Array.isArray(live) && live.length > 0
      ? live
      : (MOCK.indices as IndexQuote[]);
  const doubled = [...items, ...items];
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        borderTop: '2px solid var(--line)',
        borderBottom: '2px solid var(--line)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div className="marquee-track" style={{ padding: '8px 0' }}>
        {doubled.map((idx, i) => {
          const up = idx.ch >= 0;
          return (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 12,
                whiteSpace: 'nowrap',
              }}
            >
              <span className="font-display t-xs faint">{idx.name}</span>
              <span style={{ fontWeight: 600 }}>
                {idx.val.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className={up ? 'green' : 'red'} style={{ fontWeight: 700 }}>
                {up ? '▲' : '▼'} {Math.abs(idx.ch).toFixed(2)}%
              </span>
              <span className="faint">│</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── StatTile ─────────────────────────────────────────────────
type Tone = 'cyan' | 'amber' | 'green' | 'red' | 'violet';

interface StatTileProps {
  label: string;
  value: string;
  sub?: ReactNode;
  icon: string;
  tone?: Tone;
  onClick?: () => void;
}

function StatTile({ label, value, sub, icon, tone = 'cyan', onClick }: StatTileProps) {
  return (
    <div
      className="pxl pxl-raised"
      style={{ padding: 12, cursor: 'pointer' }}
      onClick={onClick}
    >
      <div
        className="row"
        style={{
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span className="font-display t-xs faint">{label}</span>
        <PixelIcon name={icon} color={`var(--${tone})`} size={16} />
      </div>
      <div
        className="font-mono"
        style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}
      >
        {value}
      </div>
      {sub && <div className="mt-2">{sub}</div>}
    </div>
  );
}

// ── TopOpportunityCard ──────────────────────────────────────
function TopOpportunityCard({ t, onClick }: { t: Ticker; onClick: () => void }) {
  return (
    <div
      className="pxl pxl-raised"
      style={{ padding: 12, cursor: 'pointer', minWidth: 0 }}
      onClick={onClick}
    >
      <div className="row" style={{ alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <TickerSprite t={t} size={36} />
        <div className="col" style={{ minWidth: 0, flex: 1 }}>
          <div className="row gap-1" style={{ alignItems: 'center' }}>
            <span style={{ fontFamily: 'Silkscreen', fontSize: 13 }}>{t.sym}</span>
            <PixelHeart filled={false} size={9} />
          </div>
          <div
            className="t-xs faint"
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {t.sector}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <VerdictPill verdict={t.ai} />
      </div>

      <div
        className="row"
        style={{
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span
          className="font-mono"
          style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}
        >
          ${t.price.toFixed(2)}
        </span>
        <PriceDelta pct={t.change} />
      </div>

      <div className="minigrid" style={{ padding: '2px 0', marginBottom: 10 }}>
        <Sparkline data={t.spark} width={240} height={32} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          paddingTop: 10,
          borderTop: '1px dashed var(--line)',
        }}
      >
        <div className="col gap-1">
          <span className="font-display t-xs faint">UPSIDE</span>
          <span
            className={`font-mono ${t.upside >= 0 ? 'green' : 'red'}`}
            style={{ fontSize: 14, fontWeight: 700 }}
          >
            {t.upside >= 0 ? '+' : ''}
            {t.upside.toFixed(1)}%
          </span>
        </div>
        <div className="col gap-1">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="font-display t-xs faint">RISK</span>
            <span className="font-display t-xs faint">{t.risk}/10</span>
          </div>
          <SegmentedBar value={t.risk} segments={10} />
        </div>
      </div>
    </div>
  );
}

// ── NewsRow ─────────────────────────────────────────────────
interface DashNewsItem {
  time: string;
  src: string;
  tag: string;
  impact: 'high' | 'med' | 'low';
  title: string;
  tickers: string[];
}

function NewsRow({ n, onClick }: { n: DashNewsItem; onClick?: () => void }) {
  const impactColor: Tone =
    n.impact === 'high' ? 'red' : n.impact === 'med' ? 'amber' : 'cyan';
  return (
    <div
      className="row"
      style={{
        padding: '10px 14px',
        gap: 12,
        borderBottom: '1px solid var(--line-soft)',
        alignItems: 'flex-start',
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      <span
        className="font-mono t-xs faint"
        style={{ width: 44, flexShrink: 0, paddingTop: 2 }}
      >
        {n.time}
      </span>
      <span style={{ width: 78, flexShrink: 0, paddingTop: 1 }}>
        <PixelBadge tone={impactColor}>{n.tag}</PixelBadge>
      </span>
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--ink)' }}>{n.title}</div>
        <div className="row gap-2 mt-2" style={{ alignItems: 'center' }}>
          <span className="font-display t-xs faint">{n.src}</span>
          {n.tickers.length > 0 && <span className="faint t-xs">│</span>}
          {n.tickers.map((s) => (
            <span key={s} className="font-display t-xs cyan">
              ${s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── WatchlistRow ────────────────────────────────────────────
function WatchlistRow({ t, onClick }: { t: Ticker; onClick: () => void }) {
  return (
    <div
      className="row"
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--line-soft)',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      <TickerSprite t={t} size={26} />
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <div className="font-display t-sm">{t.sym}</div>
        <div
          className="t-xs faint"
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {t.name}
        </div>
      </div>
      <Sparkline data={t.spark} width={56} height={20} fill={false} />
      <div className="col" style={{ alignItems: 'flex-end', minWidth: 72 }}>
        <span className="font-mono t-sm" style={{ fontWeight: 700 }}>
          ${t.price.toFixed(2)}
        </span>
        <span
          className={`font-mono t-xs ${t.change >= 0 ? 'green' : 'red'}`}
        >
          {t.change >= 0 ? '+' : ''}
          {t.change.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

// ── AIDigest ────────────────────────────────────────────────
interface DigestRelated {
  symbol?: string;
  sym?: string;
  ticker?: string;
  change?: number;
  latestPrice?: { changePercent?: number };
}

interface DigestData {
  summary?: string;
  relatedTickers?: DigestRelated[];
  tickers?: string[] | DigestRelated[];
}

type DigestLine =
  | { kind: 'head'; text: string }
  | { kind: 'body'; text: string }
  | { kind: 'tag'; text: string; note: string; tone: 'red' | 'green' };

export function AIDigest({
  digest,
  fallbackTickers,
}: {
  digest: DigestData | null | undefined;
  fallbackTickers: Ticker[];
}) {
  const lines: DigestLine[] = (() => {
    if (
      digest &&
      typeof digest === 'object' &&
      (digest.summary || digest.tickers || digest.relatedTickers)
    ) {
      const ls: DigestLine[] = [];
      if (digest.summary) {
        ls.push({ kind: 'head', text: 'MARKET PULSE  ▸  AI DIGEST' });
        ls.push({ kind: 'body', text: String(digest.summary).slice(0, 600) });
      }
      const rel: DigestRelated[] = Array.isArray(digest.relatedTickers)
        ? digest.relatedTickers
        : Array.isArray(digest.tickers)
          ? digest.tickers.map((t) =>
              typeof t === 'string' ? ({ symbol: t } as DigestRelated) : t,
            )
          : [];
      if (rel.length > 0) {
        ls.push({ kind: 'head', text: 'TOP-OF-MIND  ▸  AFFECTED TICKERS' });
        for (const r of rel.slice(0, 6)) {
          const sym = r.symbol || r.sym || r.ticker || '?';
          const change = r.latestPrice?.changePercent ?? r.change ?? null;
          const tone: 'red' | 'green' =
            change != null && change < 0 ? 'red' : 'green';
          const arrow = change != null && change < 0 ? '▼' : '▲';
          const note =
            change != null
              ? `${change >= 0 ? '+' : ''}${Number(change).toFixed(2)}% today`
              : 'in digest';
          ls.push({ kind: 'tag', text: `${arrow} ${sym}`, note, tone });
        }
      }
      return ls;
    }
    if (Array.isArray(fallbackTickers) && fallbackTickers.length > 0) {
      const top = [...fallbackTickers]
        .filter((t) => Math.abs(Number(t.change || 0)) > 0.1)
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
        .slice(0, 5);
      return [
        { kind: 'head', text: "MARKET PULSE  ▸  TODAY'S MOVERS" } as DigestLine,
        {
          kind: 'body',
          text: 'Largest single-day price changes in your tracked universe.',
        } as DigestLine,
        ...top.map<DigestLine>((t) => ({
          kind: 'tag',
          text: `${t.change >= 0 ? '▲' : '▼'} ${t.sym}`,
          note: `${t.change >= 0 ? '+' : ''}${Number(t.change).toFixed(2)}% · ${t.sector || ''}`,
          tone: t.change >= 0 ? 'green' : 'red',
        })),
      ];
    }
    return [
      { kind: 'head', text: 'MARKET PULSE  ▸  GLOBAL EQUITIES' },
      {
        kind: 'body',
        text: 'Risk-on tone resumes after dovish Fed signaling. Cyclicals lead, defensives lag.',
      },
    ];
  })();

  return (
    <div className="p-4 col gap-3">
      <div className="row gap-2" style={{ alignItems: 'center' }}>
        <PixelIcon name="brain" color="var(--amber)" size={20} />
        <span className="font-display amber t-sm">DIGEST GENERATED 12:42 UTC</span>
        <span style={{ flex: 1 }} />
        <PixelBadge tone="amber">CONF 0.82</PixelBadge>
        <PixelBadge tone="cyan">12 SIGNALS</PixelBadge>
      </div>

      <div className="pxl-rule" />

      {lines.map((l, i) => {
        if (l.kind === 'head')
          return (
            <div key={i} className="tw-h mt-2">
              {l.text}
            </div>
          );
        if (l.kind === 'body')
          return (
            <p
              key={i}
              className="t-sm"
              style={{ lineHeight: 1.55, color: 'var(--ink)' }}
            >
              {l.text}
            </p>
          );
        return (
          <div key={i} className="row gap-2" style={{ alignItems: 'center' }}>
            <span
              className={`pxl-badge ${l.tone}`}
              style={{ width: 64, justifyContent: 'center' }}
            >
              {l.text}
            </span>
            <span className="t-sm">{l.note}</span>
          </div>
        );
      })}

      <div className="pxl-rule mt-2" />
      <div className="row gap-2" style={{ alignItems: 'center' }}>
        <span className="font-display t-xs faint">TRACE ▸</span>
        <span className="font-mono t-xs faint">
          gemini-2.5 ▸ gpt-5 ▸ claude-opus-4
        </span>
        <span style={{ flex: 1 }} />
        <button className="pxl-btn sm">EXPAND ▾</button>
      </div>
    </div>
  );
}

// ── AllocationPanel ─────────────────────────────────────────
interface PositionRaw {
  ticker?: {
    finnhub_industry?: string;
    sector?: string;
    name?: string;
    last_price?: number;
    logo_url?: string;
    symbol?: string;
  };
  current_value?: number;
  cost_basis?: number;
  gain_loss?: number;
  gain_loss_percent?: number;
  gain_loss_pct?: number;
  symbol?: string;
  sym?: string;
  shares?: number;
  quantity?: number;
  buy_price?: number;
  avg_price?: number;
  current_price?: number;
  latestPrice?: { close?: number };
  current_price_alt?: number;
}

interface AllocSlice {
  label: string;
  value: number;
  color: string;
}

export function AllocationPanel({
  positions,
}: {
  positions: PositionRaw[] | null;
}) {
  const bp = useBreakpoint();
  const data: AllocSlice[] = (() => {
    if (Array.isArray(positions) && positions.length > 0) {
      const map = new Map<string, number>();
      let total = 0;
      for (const p of positions) {
        const sec = (
          p.ticker?.finnhub_industry ||
          p.ticker?.sector ||
          'OTHER'
        )
          .toUpperCase()
          .slice(0, 14);
        const val = Number(p.current_value ?? 0);
        map.set(sec, (map.get(sec) || 0) + val);
        total += val;
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
        .map(([label, val], i) => ({
          label,
          value: Math.round((val / (total || 1)) * 100),
          color: colors[i % colors.length],
        }));
    }
    return [
      { label: 'SEMIS', value: 28, color: 'var(--cyan)' },
      { label: 'AI INFRA', value: 22, color: 'var(--amber)' },
      { label: 'BIOTECH', value: 14, color: 'var(--violet)' },
      { label: 'RENEWABLES', value: 12, color: 'var(--green)' },
      { label: 'DEFENSE', value: 10, color: 'var(--red)' },
      { label: 'OTHER', value: 14, color: 'var(--ink-faint)' },
    ];
  })();

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: bp.mobile ? 'column' : 'row',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <PixelDonut
          data={data}
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
                {data.length.toString().padStart(2, '0')}
              </span>
              <span className="font-display t-xs faint">ACTIVE</span>
            </div>
          }
        />
        <div className="col gap-2" style={{ flex: 1, width: '100%' }}>
          {data.map((d) => (
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
              <span className="font-display t-xs" style={{ flex: 1 }}>
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
      </div>
    </div>
  );
}

// ── PortfolioAIWidget ───────────────────────────────────────
interface AnalysisItem {
  riskAppetite?: string;
  horizon?: string;
  createdAt?: string;
  response?:
    | string
    | {
        content?: string;
        text?: string;
        summary?: string;
      };
}

interface AnalysisOpts {
  risk?: string;
  horizon?: string;
  goal?: string;
  model?: string;
}

export function PortfolioAIWidget() {
  const [data, meta] = useApi<AnalysisItem[] | null>(
    () => API.portfolioAnalyses() as Promise<AnalysisItem[]>,
    ['portfolio-analyses'],
  );
  const items: AnalysisItem[] = Array.isArray(data) ? data : [];
  const latest: AnalysisItem | undefined = items[0];

  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ tone: Tone; text: string } | null>(null);

  const runAnalysis = async (opts: AnalysisOpts = {}): Promise<void> => {
    setRunning(true);
    setMsg(null);
    const res = await API.portfolioAnalyze({
      riskAppetite: opts.risk || 'medium',
      horizon: opts.horizon || 'medium-term',
      goal: opts.goal || 'growth',
      model: opts.model || 'gemini',
    }).catch(() => null);
    setRunning(false);
    if (res) {
      setMsg({ tone: 'green', text: 'Analysis complete — refreshing.' });
      meta?.reload?.();
    } else {
      setMsg({
        tone: 'red',
        text: 'Analysis failed (insufficient credits or auth?)',
      });
    }
    setTimeout(() => setMsg(null), 3000);
  };

  if (meta?.loading && !data) {
    return (
      <div style={{ padding: 16 }}>
        <Spinner label="LOADING AI HISTORY" />
      </div>
    );
  }

  const responseText: string | null = (() => {
    if (!latest) return null;
    const r = latest.response;
    if (typeof r === 'string') return r;
    if (r && typeof r === 'object') {
      return r.content || r.text || r.summary || JSON.stringify(r).slice(0, 1200);
    }
    return null;
  })();

  return (
    <div className="col" style={{ padding: 14, gap: 10 }}>
      <div className="row gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <PixelIcon name="brain" color="var(--violet)" size={18} />
        <span className="font-display t-sm" style={{ color: 'var(--violet)' }}>
          PORTFOLIO ANALYSIS
        </span>
        <span style={{ flex: 1 }} />
        {latest && (
          <PixelBadge tone="cyan">
            {(latest.riskAppetite || '—').toUpperCase()} ·{' '}
            {(latest.horizon || '—').toUpperCase()}
          </PixelBadge>
        )}
        {latest && (
          <span className="font-display t-xs faint">
            {latest.createdAt
              ? new Date(latest.createdAt).toISOString().slice(0, 16).replace('T', ' ')
              : '—'}
          </span>
        )}
      </div>

      {msg && (
        <div className="t-xs" style={{ color: `var(--${msg.tone})` }}>
          ▸ {msg.text}
        </div>
      )}

      {latest && responseText ? (
        <div
          className="pxl-inset"
          style={{
            padding: 12,
            lineHeight: 1.5,
            fontSize: 12,
            maxHeight: 280,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            color: 'var(--ink)',
          }}
        >
          {responseText.replace(/[#*_`]/g, '').slice(0, 2400)}
          {responseText.length > 2400 && (
            <span className="faint t-xs"> … (truncated)</span>
          )}
        </div>
      ) : (
        <div
          className="font-display t-xs faint"
          style={{ textAlign: 'center', padding: 14 }}
        >
          NO ANALYSES YET — RUN ONE TO SEE AI COMMENTARY
        </div>
      )}

      <div className="row gap-2" style={{ flexWrap: 'wrap', marginTop: 4 }}>
        <button
          className="pxl-btn sm"
          disabled={running}
          onClick={() =>
            runAnalysis({
              risk: 'low',
              horizon: 'long-term',
              goal: 'preservation',
            })
          }
        >
          + CONSERVATIVE
        </button>
        <button
          className="pxl-btn sm"
          disabled={running}
          onClick={() =>
            runAnalysis({
              risk: 'medium',
              horizon: 'medium-term',
              goal: 'growth',
            })
          }
        >
          + BALANCED
        </button>
        <button
          className="pxl-btn sm"
          disabled={running}
          onClick={() =>
            runAnalysis({
              risk: 'high',
              horizon: 'short-term',
              goal: 'trading',
            })
          }
          style={{ color: 'var(--amber)' }}
        >
          + YOLO
        </button>
        <span style={{ flex: 1 }} />
        {running && <Spinner label="ANALYZING" />}
        {items.length > 1 && (
          <span className="font-display t-xs faint">
            {items.length} HISTORICAL
          </span>
        )}
      </div>
    </div>
  );
}

// ── Dashboard (main) ─────────────────────────────────────────
type OppCategory = 'yolo' | 'classic' | 'shorts';

interface Position {
  sym: string;
  qty: number;
  avg: number;
  last: number;
  pnl: number;
  pnlPct: number;
}

interface PortfolioSummary {
  value: number;
  gain: number;
  gainPct: number;
  positions: Position[];
}

interface WatchlistRaw {
  id: string;
  name?: string;
  items?: Array<{
    ticker?: {
      symbol?: string;
      name?: string;
      finnhub_industry?: string;
      sector?: string;
      last_price?: number;
      logo_url?: string;
    };
    symbol?: string;
    current_price?: number;
  }>;
}

interface AlertRaw {
  triggered_at?: string;
  status?: string;
}

interface NewsItemRaw {
  publish_time?: string;
  publishTime?: string;
  source?: string;
  publisher?: string;
  category?: string;
  tag?: string;
  impact?: 'high' | 'med' | 'low';
  sentiment?: 'positive' | 'negative' | 'neutral';
  title?: string;
  headline?: string;
  tickers?: string[];
  symbol?: string;
}

export interface DashboardProps {
  onNav: NavFn;
  loading?: boolean;
}

export function Dashboard({ onNav, loading = false }: DashboardProps) {
  const [category, setCategory] = useState<OppCategory>('yolo');
  const bp = useBreakpoint();

  // Currently selected watchlist (persisted to localStorage so it survives reloads)
  const [activeWlId, setActiveWlId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('v2_dash_active_wl') || null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!activeWlId) return;
    try {
      localStorage.setItem('v2_dash_active_wl', activeWlId);
    } catch {
      /* ignore */
    }
  }, [activeWlId]);

  const liveTickers: Ticker[] = useTickersWithFallback({ limit: 50 });
  const [tickerCount] = useApi<{ count: number } | null>(
    () => API.tickerCount() as Promise<{ count: number }>,
    ['tickerCount'],
  );
  const [strongBuy] = useApi<{ count: number } | null>(
    () => API.statsStrongBuy() as Promise<{ count: number }>,
    ['strongBuy'],
  );
  const [sellStats] = useApi<{ count: number } | null>(
    () => API.statsSell() as Promise<{ count: number }>,
    ['sellStats'],
  );
  const [livePortfolio] = useApi<PositionRaw[] | null>(
    () => API.portfolio() as Promise<PositionRaw[]>,
    ['portfolio'],
  );
  const [liveNews] = useApi<NewsItemRaw[] | null>(
    () => API.newsGeneral() as Promise<NewsItemRaw[]>,
    ['newsGeneral'],
  );
  const [liveDigest] = useApi<DigestData | null>(
    () => API.newsDigest() as Promise<DigestData>,
    ['newsDigest'],
  );
  const [liveAlerts] = useApi<AlertRaw[] | null>(
    () => API.alerts() as Promise<AlertRaw[]>,
    ['alerts'],
  );
  const [liveWatchlists] = useApi<WatchlistRaw[] | null>(
    () => API.watchlists() as Promise<WatchlistRaw[]>,
    ['watchlists'],
  );

  const portfolio: PortfolioSummary = (() => {
    if (!Array.isArray(livePortfolio) || livePortfolio.length === 0) {
      return MOCK.portfolio as unknown as PortfolioSummary;
    }
    let value = 0;
    let costSum = 0;
    const positions: Position[] = livePortfolio.map((p) => {
      const qty = Number(p.shares ?? p.quantity ?? 0);
      const buyPrice = Number(p.buy_price ?? p.avg_price ?? 0);
      const last = Number(
        p.current_price ?? p.latestPrice?.close ?? buyPrice,
      );
      const cur = Number(p.current_value ?? qty * last);
      const cost = Number(p.cost_basis ?? qty * buyPrice);
      value += cur;
      costSum += cost;
      const pnl = Number(p.gain_loss ?? cur - cost);
      const pnlPct = Number(
        p.gain_loss_percent ??
          p.gain_loss_pct ??
          (cost ? ((cur - cost) / cost) * 100 : 0),
      );
      return {
        sym: p.symbol || p.sym || p.ticker?.symbol || '?',
        qty,
        avg: buyPrice,
        last,
        pnl,
        pnlPct,
      };
    });
    const gain = value - costSum;
    const gainPct = costSum ? (gain / costSum) * 100 : 0;
    return { value, gain, gainPct, positions };
  })();

  const tickers: Ticker[] = liveTickers;

  // Responsive grid templates
  const statCols = bp.mobile
    ? 'repeat(2, 1fr)'
    : bp.tablet
      ? 'repeat(3, 1fr)'
      : 'repeat(6, 1fr)';
  const oppCols = bp.mobile
    ? '1fr'
    : bp.tablet
      ? 'repeat(2, 1fr)'
      : 'repeat(4, 1fr)';
  const splitCols = bp.mobile ? '1fr' : bp.tablet ? '1fr' : '1fr 320px';
  const splitColsB = bp.mobile ? '1fr' : bp.tablet ? '1fr' : '1fr 380px';
  const pageGutter = bp.mobile ? '0 12px' : '0 20px';

  const oppLimit = bp.desktop ? 8 : bp.tablet ? 6 : 4;
  const oppMap: Record<OppCategory, Ticker[]> = {
    yolo: tickers
      .filter((t) => ['SPECULATIVE', 'NO BRAINER', 'STRONG BUY'].includes(t.ai))
      .sort((a, b) => b.upside - a.upside)
      .slice(0, oppLimit),
    classic: tickers
      .filter((t) => ['STRONG BUY', 'NO BRAINER'].includes(t.ai) && t.risk <= 4)
      .slice(0, oppLimit),
    shorts: tickers
      .filter((t) => t.ai === 'SELL')
      .concat(tickers.filter((t) => t.ai === 'HOLD' && t.change < 0))
      .slice(0, oppLimit),
  };
  const opps: Ticker[] = oppMap[category];

  return (
    <div className="col" style={{ gap: 16 }}>
      <MarketTicker />

      <div
        style={{
          padding: pageGutter,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Hero stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: statCols, gap: 10 }}>
          {loading ? (
            <>
              <StatTileSkel />
              <StatTileSkel />
              <StatTileSkel />
              <StatTileSkel />
              <StatTileSkel />
              <StatTileSkel />
            </>
          ) : (
            <>
              <StatTile
                label="MY PORTFOLIO"
                value={`$${(portfolio.value / 1000).toFixed(1)}K`}
                sub={<PriceDelta pct={portfolio.gainPct} />}
                icon="wallet"
                tone="cyan"
                onClick={() => onNav('portfolio')}
              />
              <StatTile
                label="STRONG BUY"
                value={(
                  strongBuy?.count ??
                  tickers.filter((t) =>
                    ['STRONG BUY', 'NO BRAINER'].includes(t.ai),
                  ).length
                )
                  .toString()
                  .padStart(3, '0')}
                sub={<span className="font-display t-xs green">▲ AI BULLISH</span>}
                icon="bolt"
                tone="green"
                onClick={() => onNav('analyzer')}
              />
              <StatTile
                label="SELL"
                value={(
                  sellStats?.count ??
                  tickers.filter((t) => t.ai === 'SELL').length
                )
                  .toString()
                  .padStart(3, '0')}
                sub={<span className="font-display t-xs red">▼ AI BEARISH</span>}
                icon="bear"
                tone="red"
                onClick={() => onNav('analyzer')}
              />
              <StatTile
                label="TRACKED"
                value={
                  tickerCount?.count != null
                    ? tickerCount.count.toLocaleString()
                    : '1,284'
                }
                sub={<span className="font-display t-xs faint">SYMBOLS IN DB</span>}
                icon="chart"
                tone="cyan"
                onClick={() => onNav('analyzer')}
              />
              <StatTile
                label="AI REPORTS"
                value={(
                  (Array.isArray(liveDigest?.relatedTickers)
                    ? liveDigest.relatedTickers.length
                    : null) ??
                  (Array.isArray(liveNews) ? liveNews.length : 48)
                )
                  .toString()
                  .padStart(2, '0')}
                sub={<span className="font-display t-xs amber">RECENT</span>}
                icon="brain"
                tone="amber"
                onClick={() => onNav('research')}
              />
              <StatTile
                label="ALERTS"
                value={(Array.isArray(liveAlerts) ? liveAlerts.length : 3)
                  .toString()
                  .padStart(2, '0')}
                sub={
                  <span className="font-display t-xs amber">
                    {Array.isArray(liveAlerts)
                      ? liveAlerts.filter(
                          (a) => a.triggered_at || a.status === 'triggered',
                        ).length + ' TRIGGERED'
                      : '—'}
                  </span>
                }
                icon="bell"
                tone="amber"
                onClick={() => onNav('alerts')}
              />
            </>
          )}
        </div>

        {/* Top Opportunities + Watchlist split */}
        <div
          style={{ display: 'grid', gridTemplateColumns: splitCols, gap: 16 }}
        >
          <PixelPanel
            title="TOP OPPORTUNITIES"
            accent="green"
            actions={
              <div style={{ display: 'flex', gap: 0 }}>
                {(
                  [
                    ['yolo', 'YOLO'],
                    ['classic', 'CLASSIC'],
                    ['shorts', 'SHORTS'],
                  ] as const
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => setCategory(k)}
                    className="pxl-btn sm ghost"
                    style={{
                      color: category === k ? 'var(--amber)' : 'var(--ink-dim)',
                      borderColor:
                        category === k ? 'var(--amber)' : 'transparent',
                      background:
                        category === k
                          ? 'rgba(255,194,60,0.08)'
                          : 'transparent',
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            }
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: oppCols,
                gap: 12,
                padding: 12,
              }}
            >
              {loading
                ? Array.from({ length: oppLimit }).map((_, i) => (
                    <OpportunityCardSkel key={i} />
                  ))
                : opps.map((t) => (
                    <TopOpportunityCard
                      key={t.sym}
                      t={t}
                      onClick={() => onNav('ticker', t)}
                    />
                  ))}
            </div>
          </PixelPanel>

          {(() => {
            const lists: WatchlistRaw[] = Array.isArray(liveWatchlists)
              ? liveWatchlists
              : [];
            const active: WatchlistRaw | null =
              lists.find((l) => l.id === activeWlId) || lists[0] || null;
            const totalItems = active?.items?.length ?? tickers.length;
            return (
              <PixelPanel
                title={
                  active
                    ? `WATCHLIST ▸ ${(active.name || 'DEFAULT')
                        .toUpperCase()
                        .slice(0, 16)}`
                    : 'WATCHLIST'
                }
                accent="amber"
                actions={
                  loading ? (
                    <Spinner label="SYNCING" />
                  ) : (
                    <span
                      className="row gap-2"
                      style={{ alignItems: 'center' }}
                    >
                      {lists.length > 1 && (
                        <select
                          value={active?.id || ''}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                            setActiveWlId(e.target.value)
                          }
                          style={{
                            background: 'var(--bg-0)',
                            color: 'var(--amber)',
                            border: '2px solid var(--line)',
                            fontFamily: 'Silkscreen, monospace',
                            fontSize: 9,
                            letterSpacing: '0.06em',
                            padding: '2px 4px',
                            maxWidth: 110,
                          }}
                          title="Switch watchlist"
                        >
                          {lists.map((l) => (
                            <option key={l.id} value={l.id}>
                              {(l.name || '—').toUpperCase().slice(0, 14)}
                            </option>
                          ))}
                        </select>
                      )}
                      <span className="font-display t-xs faint">
                        {totalItems} SYM
                      </span>
                    </span>
                  )
                }
                scroll
                height={bp.mobile ? 360 : '100%'}
              >
                {loading
                  ? Array.from({ length: 7 }).map((_, i) => (
                      <WatchlistRowSkel key={i} />
                    ))
                  : !active
                    ? tickers.slice(0, 9).map((t) => (
                        <WatchlistRow
                          key={t.sym}
                          t={t}
                          onClick={() => onNav('ticker', t)}
                        />
                      ))
                    : (() => {
                        const byMap = new Map(
                          tickers.map((t) => [t.sym, t]),
                        );
                        return (active.items || []).slice(0, 12).map((it) => {
                          const sym =
                            it.ticker?.symbol || it.symbol || '';
                          const tk: Ticker =
                            byMap.get(sym) || {
                              sym,
                              name: it.ticker?.name || sym,
                              sector:
                                it.ticker?.finnhub_industry ||
                                it.ticker?.sector ||
                                '—',
                              price: Number(
                                it.current_price ??
                                  it.ticker?.last_price ??
                                  0,
                              ),
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
                            <WatchlistRow
                              key={sym}
                              t={tk}
                              onClick={() => onNav('ticker', tk)}
                            />
                          );
                        });
                      })()}
              </PixelPanel>
            );
          })()}
        </div>

        {/* News + AI Digest + Allocation */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: splitColsB,
            gap: 16,
            marginBottom: 16,
          }}
        >
          <PixelPanel
            title="AI MARKET DIGEST"
            accent="amber"
            actions={
              <span className="row gap-2" style={{ alignItems: 'center' }}>
                <StatusLED
                  tone="amber"
                  label={loading ? 'GENERATING' : 'REASONING'}
                />
                <span className="sticker">v3.4</span>
              </span>
            }
          >
            {loading ? (
              <AIDigestSkel />
            ) : (
              <AIDigest digest={liveDigest} fallbackTickers={tickers} />
            )}
          </PixelPanel>

          <PixelPanel
            title="PORTFOLIO // ALLOCATION"
            accent="green"
            actions={loading ? <Spinner /> : undefined}
          >
            {loading ? (
              <div style={{ padding: 24 }}>
                <DonutSkel size={140} />
                <div className="col gap-2 mt-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="row gap-2"
                      style={{ alignItems: 'center' }}
                    >
                      <Skel w={12} h={12} />
                      <Skel w="35%" h={9} />
                      <div style={{ flex: 1 }} />
                      <Skel w={32} h={9} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <AllocationPanel
                  positions={
                    Array.isArray(livePortfolio) ? livePortfolio : null
                  }
                />
                <div className="pxl-rule" style={{ margin: '0 16px' }} />
                <div className="p-4 col gap-2">
                  <div
                    className="row"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span className="font-display t-xs faint">TOTAL VALUE</span>
                    <span
                      className="font-mono"
                      style={{ fontWeight: 700 }}
                    >
                      ${portfolio.value.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className="row"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span className="font-display t-xs faint">DAY P&amp;L</span>
                    <span
                      className="font-mono green"
                      style={{ fontWeight: 700 }}
                    >
                      +$2,118.42
                    </span>
                  </div>
                  <div
                    className="row"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span className="font-display t-xs faint">ALL-TIME</span>
                    <span
                      className="font-mono green"
                      style={{ fontWeight: 700 }}
                    >
                      +{portfolio.gainPct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </>
            )}
          </PixelPanel>
        </div>

        {/* Portfolio AI commentary (full-width row) */}
        <PixelPanel
          title="AI ▸ YOUR PORTFOLIO"
          accent="violet"
          actions={<PixelBadge tone="violet">DEEP ANALYSIS</PixelBadge>}
        >
          <PortfolioAIWidget />
        </PixelPanel>

        {/* Live news + Positions */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: splitColsB,
            gap: 16,
            marginBottom: 24,
          }}
        >
          <PixelPanel
            title="NEWS FEED // LIVE"
            accent="cyan"
            actions={
              <span className="row gap-2" style={{ alignItems: 'center' }}>
                <StatusLED
                  tone={loading ? 'amber' : 'green'}
                  label={loading ? 'FETCHING' : '14.2 ITEMS/MIN'}
                />
                <span className="pxl-badge cyan">ALL</span>
                <span className="pxl-badge">MACRO</span>
                <span className="pxl-badge">EARNINGS</span>
              </span>
            }
          >
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <NewsRowSkel key={i} />)
              : Array.isArray(liveNews) && liveNews.length > 0
                ? liveNews.slice(0, 10).map((n, i) => {
                    const item: DashNewsItem = {
                      time:
                        ((n.publish_time || n.publishTime) ?? '').slice(11, 16) ||
                        '—',
                      src: n.source || n.publisher || '',
                      tag: (n.category || n.tag || 'NEWS')
                        .toUpperCase()
                        .slice(0, 8),
                      impact:
                        n.impact ||
                        (n.sentiment === 'negative'
                          ? 'high'
                          : n.sentiment === 'positive'
                            ? 'low'
                            : 'med'),
                      title: n.title || n.headline || '',
                      tickers:
                        n.tickers || (n.symbol ? [n.symbol] : []),
                    };
                    return <NewsRow key={i} n={item} />;
                  })
                : MOCK.news.map((n: unknown, i) => (
                    <NewsRow key={i} n={n as DashNewsItem} />
                  ))}
          </PixelPanel>

          <PixelPanel
            title="PORTFOLIO // POSITIONS"
            accent="green"
            actions={
              <span className="font-mono t-xs">
                <span
                  className={portfolio.gainPct >= 0 ? 'green' : 'red'}
                >
                  {portfolio.gainPct >= 0 ? '+' : ''}
                  {Number(portfolio.gainPct).toFixed(2)}%
                </span>
              </span>
            }
          >
            {loading ? (
              <div style={{ padding: 12 }}>
                <table className="pxl-table">
                  <thead>
                    <tr>
                      <th>SYM</th>
                      <th className="num">QTY</th>
                      <th className="num">LAST</th>
                      <th className="num">P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <TableRowSkel key={i} cols={4} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <table className="pxl-table">
                <thead>
                  <tr>
                    <th>SYM</th>
                    <th className="num">QTY</th>
                    <th className="num">LAST</th>
                    <th className="num">P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.map((p) => {
                    const tk = tickers.find((x) => x.sym === p.sym) || null;
                    return (
                      <tr key={p.sym}>
                        <td>
                          <div
                            className="row gap-2"
                            style={{ alignItems: 'center' }}
                          >
                            {tk && <TickerSprite t={tk} size={22} />}
                            <span className="font-display t-sm">{p.sym}</span>
                          </div>
                        </td>
                        <td className="num">{p.qty}</td>
                        <td className="num">${p.last.toFixed(2)}</td>
                        <td className="num">
                          <span
                            className={p.pnl >= 0 ? 'green' : 'red'}
                            style={{ fontWeight: 700 }}
                          >
                            {p.pnl >= 0 ? '+' : ''}
                            {(p.pnl / 1000).toFixed(1)}K
                          </span>
                          <div
                            className={`t-xs ${p.pnl >= 0 ? 'green' : 'red'}`}
                            style={{ opacity: 0.7 }}
                          >
                            {p.pnlPct >= 0 ? '+' : ''}
                            {p.pnlPct.toFixed(1)}%
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
      </div>
    </div>
  );
}

// Optionally re-exported (kept for compatibility — App imports Dashboard only).

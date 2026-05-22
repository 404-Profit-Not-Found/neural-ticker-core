// Newswire — live general-purpose financial news.
import {
  PixelBadge,
  PixelPanel,
  StatusLED,
  useBreakpoint,
} from '../components/pixel.tsx';
import { EmptyState } from '../components/Skeletons.tsx';
import { API } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';

interface NewsRow {
  publish_time?: string;
  publishTime?: string;
  category?: string;
  tag?: string;
  tickers?: string[];
  symbol?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  source?: string;
  publisher?: string;
  url?: string;
  title?: string;
  headline?: string;
  summary?: string;
}

export function NewsPage() {
  const bp = useBreakpoint();
  const [data, meta] = useApi<NewsRow[] | null>(
    () => API.newsGeneral() as Promise<NewsRow[]>,
    ['news-general'],
    { poll: 60000 },
  );
  const items: NewsRow[] = Array.isArray(data) ? data : [];

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
        <span className="font-display t-xs faint">TERMINAL ▸ NEWSWIRE LIVE</span>
        <div style={{ flex: 1 }} />
        <StatusLED
          tone={meta?.loading ? 'amber' : 'green'}
          label={meta?.loading ? 'FETCHING' : `${items.length} ITEMS`}
        />
      </div>

      <PixelPanel title="NEWSWIRE // LIVE" accent="cyan">
        {items.length === 0 ? (
          <EmptyState
            icon="news"
            title={meta?.loading ? 'LOADING' : 'NO NEWS'}
            subtitle={meta?.loading ? 'Polling…' : 'Check back soon.'}
          />
        ) : (
          <div className="col">
            {items.map((n, i) => {
              const tone: 'red' | 'green' | 'cyan' =
                n.sentiment === 'negative'
                  ? 'red'
                  : n.sentiment === 'positive'
                    ? 'green'
                    : 'cyan';
              const time =
                ((n.publish_time || n.publishTime) ?? '').slice(11, 16) || '—';
              const tag = (n.category || n.tag || 'NEWS')
                .toUpperCase()
                .slice(0, 12);
              const tickers: string[] =
                n.tickers || (n.symbol ? [n.symbol] : []);
              return (
                <div
                  key={i}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--line-soft)',
                  }}
                >
                  <div
                    className="row gap-3"
                    style={{ alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <span className="font-mono t-xs faint" style={{ width: 50 }}>
                      {time}
                    </span>
                    <PixelBadge tone={tone}>{tag}</PixelBadge>
                    <span className="font-display t-xs faint">
                      {n.source || n.publisher}
                    </span>
                    <div style={{ flex: 1 }} />
                    {tickers.slice(0, 5).map((s) => (
                      <span key={s} className="font-display t-xs cyan">
                        ${s}
                      </span>
                    ))}
                  </div>
                  <div className="t-sm mt-2" style={{ lineHeight: 1.4 }}>
                    {n.url ? (
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--ink)', textDecoration: 'none' }}
                      >
                        {n.title || n.headline}
                      </a>
                    ) : (
                      n.title || n.headline
                    )}
                  </div>
                  {n.summary && (
                    <div
                      className="t-xs faint mt-2"
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {String(n.summary).slice(0, 220)}
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

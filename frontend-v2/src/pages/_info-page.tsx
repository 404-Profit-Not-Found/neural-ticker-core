// Shared InfoPage shell used by About / Terms / Privacy. Renders a single
// PixelPanel with sectioned plain-text content.
import { PixelPanel, useBreakpoint } from '../components/pixel.tsx';

export interface InfoSection {
  h?: string;
  p: string;
}

export interface InfoPageProps {
  title: string;
  sections: InfoSection[];
}

export function InfoPage({ title, sections }: InfoPageProps) {
  const bp = useBreakpoint();
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
          TERMINAL ▸ {title.toUpperCase()}
        </span>
        <div style={{ flex: 1 }} />
      </div>
      <PixelPanel title={title.toUpperCase()} accent="cyan">
        <div
          style={{
            padding: 22,
            maxWidth: 720,
            lineHeight: 1.65,
            fontSize: 13,
          }}
        >
          {sections.map((s, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              {s.h && (
                <div
                  className="font-display amber t-sm mb-2"
                  style={{ letterSpacing: '0.08em' }}
                >
                  ▸ {s.h}
                </div>
              )}
              <p style={{ color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
                {s.p}
              </p>
            </div>
          ))}
        </div>
      </PixelPanel>
    </div>
  );
}

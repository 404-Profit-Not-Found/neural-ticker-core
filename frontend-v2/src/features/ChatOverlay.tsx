// AI Chat Overlay — persistent pixel-terminal prompt at the bottom of the
// screen. Streams research/thoughts via SSE (POST /api/v1/research/stream).
// Toggled by window event "v2:toggle-chat" (dispatched by command palette /
// Cmd-Shift-K shortcut / bottom strip button).
//
// Streamed event shape per backend research.controller.ts:
//   { type: "status" | "thought" | "source" | "content" | "error", data: any }
import {
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
} from 'react';
import { PixelIcon } from '../components/pixel.tsx';
import { Spinner } from '../components/Skeletons.tsx';
import { API } from '../lib/api.ts';
import type { Ticker } from '../lib/types.ts';

type LineKind =
  | 'sys'
  | 'hint'
  | 'user'
  | 'status'
  | 'thought'
  | 'source'
  | 'content'
  | 'err';

interface ChatLineModel {
  kind: LineKind;
  text: string;
}

// Streaming event payloads — kept permissive since the backend may evolve.
interface StreamData {
  message?: string;
  thought?: string;
  url?: string;
  source?: string;
  text?: string;
  content?: string;
  status?: number;
}

export interface ChatOverlayProps {
  currentTicker: Ticker | null | undefined;
}

export function ChatOverlay({ currentTicker }: ChatOverlayProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<ChatLineModel[]>(() => [
    { kind: 'sys', text: 'NEURAL//TICKER ▸ AI CHAT ▸ POWERED BY ENSEMBLE' },
    {
      kind: 'hint',
      text: 'TYPE A QUESTION ABOUT THE ACTIVE TICKER OR ANY SYMBOL. CTRL+ENTER SENDS.',
    },
  ]);
  const abortRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Listen for global toggle event
  useEffect(() => {
    const onToggle = (): void => setOpen((o) => !o);
    window.addEventListener('v2:toggle-chat', onToggle);
    return () => window.removeEventListener('v2:toggle-chat', onToggle);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  }, [open]);

  // Auto-scroll on new lines
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const sym = currentTicker?.sym || null;

  const send = (): void => {
    const text = q.trim();
    if (!text || busy) return;
    const askedTicker = sym || extractTicker(text) || null;
    setQ('');
    setLines((ls) => [
      ...ls,
      { kind: 'user', text },
      {
        kind: 'sys',
        text: askedTicker
          ? `▸ STREAMING RESEARCH ▸ ${askedTicker}`
          : '▸ STREAMING RESEARCH ▸ NO TICKER CONTEXT',
      },
    ]);

    if (!askedTicker) {
      setLines((ls) => [
        ...ls,
        {
          kind: 'err',
          text: '▸ NO TICKER — prefix a symbol like $AAPL or open a ticker first.',
        },
      ]);
      return;
    }

    setBusy(true);
    abortRef.current = API.researchStream<StreamData>(
      { ticker: askedTicker, questions: text },
      (evt) => {
        const data = evt.data ?? ({} as StreamData);
        if (evt.type === 'status') {
          setLines((ls) => [
            ...ls,
            {
              kind: 'status',
              text: `▸ ${String(data.message ?? '').toUpperCase()}`,
            },
          ]);
        } else if (evt.type === 'thought') {
          setLines((ls) => [
            ...ls,
            { kind: 'thought', text: String(data.thought ?? '') },
          ]);
        } else if (evt.type === 'source') {
          const src = data.url || data.source || JSON.stringify(evt.data);
          setLines((ls) => [...ls, { kind: 'source', text: `↳ SRC: ${src}` }]);
        } else if (evt.type === 'content') {
          const piece = String(data.text ?? data.content ?? '');
          setLines((ls) => {
            const last = ls[ls.length - 1];
            if (last && last.kind === 'content') {
              return ls
                .slice(0, -1)
                .concat({ kind: 'content', text: last.text + piece });
            }
            return [...ls, { kind: 'content', text: piece }];
          });
        } else if (evt.type === 'error') {
          const msg = data.message || `status ${data.status ?? '?'}`;
          setLines((ls) => [
            ...ls,
            {
              kind: 'err',
              text:
                data.status === 401 || data.status === 403
                  ? '▸ AUTH REQUIRED — open /auth/google in main app and retry'
                  : `▸ ERROR: ${msg}`,
            },
          ]);
          setBusy(false);
        } else if (evt.type === 'done') {
          setLines((ls) => [...ls, { kind: 'sys', text: '▸ DONE' }]);
          setBusy(false);
        }
      },
    );
  };

  const cancel = (): void => {
    if (abortRef.current) abortRef.current();
    abortRef.current = null;
    setBusy(false);
    setLines((ls) => [...ls, { kind: 'sys', text: '▸ ABORTED' }]);
  };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="AI Chat (Cmd+Shift+K)"
        style={{
          position: 'fixed',
          right: 16,
          bottom: 44,
          zIndex: 60,
          padding: '8px 14px',
          background: 'var(--bg-2)',
          border: '2px solid var(--amber)',
          color: 'var(--amber)',
          fontFamily: 'Silkscreen, monospace',
          fontSize: 11,
          letterSpacing: '0.08em',
          cursor: 'pointer',
          boxShadow:
            'inset 0 2px 0 0 rgba(255,255,255,0.04), 0 0 12px rgba(255,194,60,0.25)',
        }}
      >
        <PixelIcon name="brain" color="var(--amber)" size={12} /> AI&nbsp;CHAT
      </button>
    );
  }

  return (
    <div
      className="pxl pxl-raised"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 36,
        height: 'min(380px, 50vh)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-1)',
      }}
    >
      <div className="pxl-head" style={{ flexShrink: 0 }}>
        <span>
          <span className={`dot ${busy ? 'amber' : 'green'}`}></span>
          AI CHAT ▸ {sym ? `CONTEXT: ${sym}` : 'NO TICKER CONTEXT'}
        </span>
        <span className="row gap-2" style={{ alignItems: 'center' }}>
          {busy && <Spinner label="THINKING" />}
          <button className="pxl-btn sm ghost" onClick={cancel} disabled={!busy}>
            ABORT
          </button>
          <button className="pxl-btn sm ghost" onClick={() => setOpen(false)}>
            ✕ CLOSE
          </button>
        </span>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 12,
          lineHeight: 1.55,
          background: 'var(--bg-0)',
        }}
      >
        {lines.map((l, i) => (
          <ChatLine key={i} l={l} />
        ))}
        {busy && (
          <div style={{ color: 'var(--amber)' }}>
            <span className="pxl-spinner" /> _
          </div>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: 10,
          borderTop: '2px solid var(--line)',
          background: 'var(--bg-1)',
        }}
      >
        <div className="row gap-2" style={{ alignItems: 'stretch' }}>
          <span
            className="font-display amber"
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 8px',
              background: 'var(--bg-0)',
              border: '2px solid var(--line)',
            }}
          >
            {sym || '?'} ▸
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={sym ? `ask about ${sym}…` : 'type a question or $SYM…'}
            className="pxl-input"
            style={{ paddingLeft: 12 }}
          />
          <button
            onClick={send}
            disabled={!q.trim() || busy}
            className="pxl-btn primary"
          >
            SEND
          </button>
        </div>
        <div className="row gap-3 mt-2 t-xs faint">
          <span className="font-display">⏎ SEND</span>
          <span className="font-display">⌘⇧K TOGGLE</span>
          <span className="font-display">ESC CLOSE</span>
        </div>
      </div>
    </div>
  );
}

const LINE_STYLES: Record<LineKind, CSSProperties> = {
  sys: { color: 'var(--ink-dim)' },
  hint: { color: 'var(--ink-faint)', fontStyle: 'italic' },
  user: { color: 'var(--cyan)', marginTop: 8 },
  status: { color: 'var(--amber)' },
  thought: {
    color: 'var(--ink-dim)',
    paddingLeft: 12,
    borderLeft: '2px solid var(--line)',
    margin: '4px 0',
  },
  source: { color: 'var(--violet)', fontSize: 11 },
  content: { color: 'var(--ink)', marginTop: 4, whiteSpace: 'pre-wrap' },
  err: { color: 'var(--red)' },
};

function ChatLine({ l }: { l: ChatLineModel }) {
  const prefix = l.kind === 'user' ? '> ' : '';
  return (
    <div style={LINE_STYLES[l.kind]}>
      {prefix}
      {l.text}
    </div>
  );
}

function extractTicker(text: string): string | null {
  const m = text.match(/\$([A-Za-z][A-Za-z0-9.\-]{0,9})/);
  if (m) return m[1].toUpperCase();
  const m2 = text.match(/\b([A-Z]{2,5})\b/);
  return m2 ? m2[1] : null;
}

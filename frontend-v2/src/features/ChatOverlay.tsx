// Converted from legacy JSX. Strict TS would require rewriting; we keep the
// runtime behaviour 1:1 and accept loose types via ts-nocheck for this file.
// @ts-nocheck
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  PixelPanel,
  PixelBadge,
  Sparkline,
  CandleChart,
  PixelIcon,
  SegmentedBar,
  VerdictPill,
  PriceDelta,
  RangeBar,
  SpriteMascot,
  TickerSprite,
  VolumeBars,
  PixelDonut,
  PixelHeart,
  RankBadge,
  StatusLED,
  RiskRadar,
  useMediaQuery,
  useBreakpoint,
} from '../components/pixel.tsx';
import {
  Skel,
  SkelText,
  SkelDither,
  SkelChart,
  SkelBar,
  SkelDots,
  Spinner,
  StatTileSkel,
  OpportunityCardSkel,
  NewsRowSkel,
  WatchlistRowSkel,
  TableRowSkel,
  AIDigestSkel,
  TypedLine,
  DonutSkel,
  PanelSkel,
  LoadingOverlay,
  EmptyState,
} from '../components/Skeletons.tsx';
import { BootSequence, StatusBar } from '../components/Chrome.tsx';
import { API } from '../lib/api.ts';
import { MOCK } from '../lib/data.ts';
import { useApi, useMutation, useIsFetching, invalidateQueries } from '../lib/hooks.ts';
import {
  useLiveTickers,
  useTickersWithFallback,
  useTickerHistory,
  useTickerNews,
  useTickerComposite,
} from '../lib/tickers.ts';

// AI Chat Overlay — persistent pixel-terminal prompt at the bottom of the
// screen. Streams research/thoughts via SSE (POST /api/v1/research/stream).
// Toggled by window event "v2:toggle-chat" (dispatched by command palette /
// Cmd-Shift-K shortcut / bottom strip button).
//
// Streamed event shape per backend research.controller.ts:
//   { type: "status" | "thought" | "source" | "content" | "error", data: any }

function ChatOverlay({ currentTicker }) {
  const [open, setOpen] = useStateChat(false);
  const [q, setQ] = useStateChat("");
  const [busy, setBusy] = useStateChat(false);
  const [lines, setLines] = useStateChat(() => [
    { kind: "sys", text: "NEURAL//TICKER ▸ AI CHAT ▸ POWERED BY ENSEMBLE" },
    { kind: "hint", text: "TYPE A QUESTION ABOUT THE ACTIVE TICKER OR ANY SYMBOL. CTRL+ENTER SENDS." },
  ]);
  const abortRef = useRefChat(null);
  const scrollRef = useRefChat(null);
  const inputRef = useRefChat(null);

  // Listen for global toggle event
  useEffectChat(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("v2:toggle-chat", onToggle);
    return () => window.removeEventListener("v2:toggle-chat", onToggle);
  }, []);

  useEffectChat(() => {
    if (open) setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  }, [open]);

  // Auto-scroll on new lines
  useEffectChat(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const sym = currentTicker?.sym || null;

  const send = () => {
    const text = q.trim();
    if (!text || busy) return;
    const askedTicker = sym || extractTicker(text) || null;
    setQ("");
    setLines(ls => [
      ...ls,
      { kind: "user", text },
      { kind: "sys", text: askedTicker
          ? `▸ STREAMING RESEARCH ▸ ${askedTicker}`
          : "▸ STREAMING RESEARCH ▸ NO TICKER CONTEXT" },
    ]);

    if (!askedTicker) {
      setLines(ls => [...ls, { kind: "err", text: "▸ NO TICKER — prefix a symbol like $AAPL or open a ticker first." }]);
      return;
    }

    setBusy(true);
    let contentBuf = "";
    abortRef.current = API.researchStream(
      { ticker: askedTicker, questions: text },
      (evt) => {
        if (evt.type === "status") {
          setLines(ls => [...ls, { kind: "status", text: `▸ ${String(evt.data?.message || evt.data || "").toUpperCase()}` }]);
        } else if (evt.type === "thought") {
          setLines(ls => [...ls, { kind: "thought", text: String(evt.data?.thought || evt.data || "") }]);
        } else if (evt.type === "source") {
          const src = evt.data?.url || evt.data?.source || JSON.stringify(evt.data);
          setLines(ls => [...ls, { kind: "source", text: `↳ SRC: ${src}` }]);
        } else if (evt.type === "content") {
          const piece = String(evt.data?.text || evt.data?.content || evt.data || "");
          contentBuf += piece;
          setLines(ls => {
            const last = ls[ls.length - 1];
            if (last && last.kind === "content") {
              return ls.slice(0, -1).concat({ kind: "content", text: last.text + piece });
            }
            return [...ls, { kind: "content", text: piece }];
          });
        } else if (evt.type === "error") {
          const msg = evt.data?.message || `status ${evt.data?.status || "?"}`;
          setLines(ls => [...ls, {
            kind: "err",
            text: evt.data?.status === 401 || evt.data?.status === 403
              ? "▸ AUTH REQUIRED — open /auth/google in main app and retry"
              : `▸ ERROR: ${msg}`,
          }]);
          setBusy(false);
        } else if (evt.type === "done") {
          setLines(ls => [...ls, { kind: "sys", text: "▸ DONE" }]);
          setBusy(false);
        }
      },
    );
  };

  const cancel = () => {
    if (abortRef.current) abortRef.current();
    abortRef.current = null;
    setBusy(false);
    setLines(ls => [...ls, { kind: "sys", text: "▸ ABORTED" }]);
  };

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
    else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="AI Chat (Cmd+Shift+K)"
        style={{
          position: "fixed",
          right: 16,
          bottom: 44,
          zIndex: 60,
          padding: "8px 14px",
          background: "var(--bg-2)",
          border: "2px solid var(--amber)",
          color: "var(--amber)",
          fontFamily: "Silkscreen, monospace",
          fontSize: 11,
          letterSpacing: "0.08em",
          cursor: "pointer",
          boxShadow: "inset 0 2px 0 0 rgba(255,255,255,0.04), 0 0 12px rgba(255,194,60,0.25)",
        }}
      >
        <PixelIcon name="brain" color="var(--amber)" size={12} />{" "}AI&nbsp;CHAT
      </button>
    );
  }

  return (
    <div
      className="pxl pxl-raised"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 36,
        height: "min(380px, 50vh)",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-1)",
      }}
    >
      <div className="pxl-head" style={{ flexShrink: 0 }}>
        <span>
          <span className={`dot ${busy ? "amber" : "green"}`}></span>
          AI CHAT ▸ {sym ? `CONTEXT: ${sym}` : "NO TICKER CONTEXT"}
        </span>
        <span className="row gap-2" style={{ alignItems: "center" }}>
          {busy && <Spinner label="THINKING" />}
          <button className="pxl-btn sm ghost" onClick={cancel} disabled={!busy}>ABORT</button>
          <button className="pxl-btn sm ghost" onClick={() => setOpen(false)}>✕ CLOSE</button>
        </span>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 12,
          lineHeight: 1.55,
          background: "var(--bg-0)",
        }}
      >
        {lines.map((l, i) => <ChatLine key={i} l={l} />)}
        {busy && (
          <div style={{ color: "var(--amber)" }}>
            <span className="pxl-spinner" /> _
          </div>
        )}
      </div>

      <div style={{
        flexShrink: 0,
        padding: 10,
        borderTop: "2px solid var(--line)",
        background: "var(--bg-1)",
      }}>
        <div className="row gap-2" style={{ alignItems: "stretch" }}>
          <span className="font-display amber" style={{
            display: "flex", alignItems: "center", padding: "0 8px",
            background: "var(--bg-0)", border: "2px solid var(--line)",
          }}>{sym || "?"} ▸</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={sym ? `ask about ${sym}…` : "type a question or $SYM…"}
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

function ChatLine({ l }) {
  const styleMap = {
    sys:     { color: "var(--ink-dim)" },
    hint:    { color: "var(--ink-faint)", fontStyle: "italic" },
    user:    { color: "var(--cyan)", marginTop: 8 },
    status:  { color: "var(--amber)" },
    thought: { color: "var(--ink-dim)", paddingLeft: 12, borderLeft: "2px solid var(--line)", margin: "4px 0" },
    source:  { color: "var(--violet)", fontSize: 11 },
    content: { color: "var(--ink)", marginTop: 4, whiteSpace: "pre-wrap" },
    err:     { color: "var(--red)" },
  };
  const prefix = l.kind === "user" ? "> " : "";
  return <div style={styleMap[l.kind] || {}}>{prefix}{l.text}</div>;
}

function extractTicker(text) {
  const m = text.match(/\$([A-Za-z][A-Za-z0-9.\-]{0,9})/);
  if (m) return m[1].toUpperCase();
  const m2 = text.match(/\b([A-Z]{2,5})\b/);
  return m2 ? m2[1] : null;
}


export { ChatOverlay };


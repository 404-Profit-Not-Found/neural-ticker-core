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

// Toast bus — surfaces backend events (newly triggered price alerts, freshly
// completed research) into transient pixel-styled toasts even when the bell
// dropdown is closed.
//
// Detection strategy: poll /price-alerts every 30s (cached query) and compare
// each alert's triggered_at against a "last seen" timestamp in sessionStorage.
// Same idea for /research?status=completed.
const {
  useState: useStateToast,
  useEffect: useEffectToast,
  useRef: useRefToast,
} = React;

const TOAST_BUFFER_MS = 5000;

function ToastBus({ signedIn, onNav }) {
  const [toasts, setToasts] = useStateToast([]); // [{ id, tone, title, body, sym, kind }]
  const lastSeenAlertsRef = useRefToast(null);
  const lastSeenResearchRef = useRefToast(null);

  // Subscribe to alerts + completed research via cached useApi.
  const [alerts] = useApi
    ? useApi(() => (signedIn ? API.alerts() : Promise.resolve([])),
        ["toast", signedIn], { poll: 60_000, staleTime: 30_000 })
    : [null];
  const [completed] = useApi
    ? useApi(() => (signedIn ? API.researchList({ status: "completed", limit: 10 })
        : Promise.resolve(null)), ["toast-research", signedIn], { poll: 120_000, staleTime: 60_000 })
    : [null];

  // Initialise "last seen" from sessionStorage once.
  useEffectToast(() => {
    if (!signedIn) return;
    try {
      lastSeenAlertsRef.current = Number(sessionStorage.getItem("v2_toast_seen_alerts")) || Date.now();
      lastSeenResearchRef.current = Number(sessionStorage.getItem("v2_toast_seen_research")) || Date.now();
    } catch (e) {
      lastSeenAlertsRef.current = Date.now();
      lastSeenResearchRef.current = Date.now();
    }
  }, [signedIn]);

  // Detect newly triggered alerts since last poll.
  useEffectToast(() => {
    if (!signedIn || !Array.isArray(alerts) || lastSeenAlertsRef.current == null) return;
    const since = lastSeenAlertsRef.current;
    const fresh = [];
    let maxSeen = since;
    for (const a of alerts) {
      if (!a.triggered_at) continue;
      const ts = new Date(a.triggered_at).getTime();
      if (!isFinite(ts) || ts <= since) continue;
      fresh.push({
        id: `alert-${a.id}-${ts}`,
        kind: "alert",
        tone: "amber",
        title: `${a.symbol} ${String(a.alert_type || "").replace("_", " ").toUpperCase()}`,
        body: `Target ${a.target_value} triggered.`,
        sym: a.symbol,
      });
      if (ts > maxSeen) maxSeen = ts;
    }
    if (fresh.length === 0) return;
    lastSeenAlertsRef.current = maxSeen;
    try { sessionStorage.setItem("v2_toast_seen_alerts", String(maxSeen)); } catch (e) {}
    setToasts(prev => [...prev, ...fresh].slice(-5));
    // Auto-dismiss after 6s each
    for (const f of fresh) {
      setTimeout(() => setToasts(p => p.filter(x => x.id !== f.id)), 6000);
    }
  }, [alerts, signedIn]);

  // Detect newly completed research since last poll.
  useEffectToast(() => {
    if (!signedIn || !completed || !Array.isArray(completed.data) || lastSeenResearchRef.current == null) return;
    const since = lastSeenResearchRef.current;
    const fresh = [];
    let maxSeen = since;
    for (const r of completed.data) {
      const ts = new Date(r.created_at || 0).getTime();
      if (!isFinite(ts) || ts <= since) continue;
      const symStr = Array.isArray(r.tickers) ? r.tickers.join(", ") : "—";
      fresh.push({
        id: `research-${r.id}-${ts}`,
        kind: "research",
        tone: "green",
        title: `Research ready: ${symStr}`,
        body: r.title ? r.title.slice(0, 60) : "Click to open in detail.",
        sym: Array.isArray(r.tickers) ? r.tickers[0] : null,
        researchId: r.id,
      });
      if (ts > maxSeen) maxSeen = ts;
    }
    if (fresh.length === 0) return;
    lastSeenResearchRef.current = maxSeen;
    try { sessionStorage.setItem("v2_toast_seen_research", String(maxSeen)); } catch (e) {}
    setToasts(prev => [...prev, ...fresh].slice(-5));
    for (const f of fresh) {
      setTimeout(() => setToasts(p => p.filter(x => x.id !== f.id)), 6000);
    }
  }, [completed, signedIn]);

  const dismiss = (id) => setToasts(p => p.filter(x => x.id !== id));

  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: "fixed",
      top: 72,
      right: 16,
      zIndex: 280,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      width: "min(320px, 90vw)",
      pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => {
            if (t.sym) {
              onNav("ticker", { sym: t.sym, name: t.sym, sector: "—", price: 0, change: 0, ai: "HOLD", risk: 5, upside: 0, mc: "—", pe: null, seed: t.sym.charCodeAt(0), spark: [0, 0], candles: [], _live: true });
            } else if (t.kind === "alert") {
              onNav("alerts");
            }
            dismiss(t.id);
          }}
          className="pxl pxl-raised"
          style={{
            pointerEvents: "auto",
            cursor: "pointer",
            padding: "10px 12px",
            background: "var(--bg-1)",
            borderLeft: `4px solid var(--${t.tone})`,
            boxShadow: `0 0 18px rgba(${t.tone === "amber" ? "245,158,11" : "16,185,129"}, 0.4)`,
            animation: "phosphor 4s ease-in-out infinite",
          }}
        >
          <div className="row gap-2" style={{ alignItems: "center", marginBottom: 4 }}>
            <PixelIcon name={t.kind === "alert" ? "bell" : "brain"}
              color={`var(--${t.tone})`} size={10} />
            <span className="font-display t-xs" style={{ color: `var(--${t.tone})`, letterSpacing: "0.08em", flex: 1 }}>
              {t.kind === "alert" ? "ALERT TRIGGERED" : "RESEARCH READY"}
            </span>
            <span onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
              style={{ cursor: "pointer", color: "var(--ink-faint)", fontFamily: "Silkscreen, monospace", fontSize: 10 }}>✕</span>
          </div>
          <div className="font-mono t-sm" style={{ fontWeight: 700 }}>{t.title}</div>
          <div className="t-xs dim mt-2">{t.body}</div>
        </div>
      ))}
    </div>
  );
}


export { ToastBus };


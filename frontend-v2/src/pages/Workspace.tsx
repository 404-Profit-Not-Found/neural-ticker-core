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

// Multi-pane workspace — 2×2 grid of resizable, swappable pixel-terminal
// panes. Saves layout (column/row fractions + pane kinds + per-pane symbol)
// to localStorage. Drag the centre cross-dividers to resize.
//
// Pane "kinds" — each renders a different view bound to a symbol:
//   chart    : candlestick + volume for one symbol
//   watchlist: scrollable list of live tickers
//   news     : recent news for the bound symbol
//   verdict  : AI verdict card (uses MOCK aiVerdict + bound symbol)
//   spark    : compact sparkline cluster (mini watchlist)
//

const LS_KEY = "v2_workspace_layout_v1";

const PANE_KINDS = [
  { key: "chart",     label: "CHART",     icon: "chart" },
  { key: "watchlist", label: "WATCHLIST", icon: "star" },
  { key: "news",      label: "NEWS",      icon: "news" },
  { key: "verdict",   label: "VERDICT",   icon: "brain" },
  { key: "spark",     label: "SPARKLINES", icon: "bolt" },
];

function defaultLayout(seedSym) {
  const s = seedSym || "AAPL";
  return {
    colA: 1.4,
    colB: 1,
    rowA: 1,
    rowB: 1,
    panes: [
      { kind: "chart",     sym: s    },
      { kind: "watchlist", sym: null },
      { kind: "news",      sym: s    },
      { kind: "verdict",   sym: s    },
    ],
  };
}

function loadLayout(seedSym) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultLayout(seedSym);
    const p = JSON.parse(raw);
    if (!Array.isArray(p.panes) || p.panes.length !== 4) return defaultLayout(seedSym);
    return p;
  } catch (e) {
    return defaultLayout(seedSym);
  }
}

function saveLayout(layout) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(layout)); } catch (e) {}
}

function Workspace({ onNav }) {
  const bp = useBreakpoint();
  const tickers = useTickersWithFallback
    ? useTickersWithFallback({ limit: 50 })
    : MOCK.tickers;
  const seedSym = (tickers && tickers[0]?.sym) || "AAPL";

  const [layout, setLayout] = useStateWS(() => loadLayout(seedSym));
  const containerRef = useRefWS(null);
  // Mobile: tap a pane to maximize it; second tap restores. Persisted in state, not localStorage.
  const [focusedIdx, setFocusedIdx] = useStateWS(null);

  // If saved layout pointed at a non-existent symbol (e.g. fictional ZYRA from
  // pre-real-data state), migrate panes onto the first live ticker once.
  useEffectWS(() => {
    if (!Array.isArray(tickers) || tickers.length === 0) return;
    const known = new Set(tickers.map(t => t.sym));
    const stale = layout.panes.some(p => p.sym && !known.has(p.sym));
    if (!stale) return;
    setLayout(l => ({
      ...l,
      panes: l.panes.map(p => p.sym && !known.has(p.sym) ? { ...p, sym: seedSym } : p),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers]);

  useEffectWS(() => { saveLayout(layout); }, [layout]);

  const setColumns = (a, b) => setLayout(l => ({ ...l, colA: a, colB: b }));
  const setRows = (a, b) => setLayout(l => ({ ...l, rowA: a, rowB: b }));

  const updatePane = (idx, patch) => {
    setLayout(l => {
      const panes = l.panes.slice();
      panes[idx] = { ...panes[idx], ...patch };
      return { ...l, panes };
    });
  };

  const cyclePaneKind = (idx) => {
    const cur = layout.panes[idx].kind;
    const i = PANE_KINDS.findIndex(k => k.key === cur);
    const next = PANE_KINDS[(i + 1) % PANE_KINDS.length].key;
    updatePane(idx, { kind: next });
  };

  // Drag handlers for the central cross
  const onColDrag = (e) => {
    const c = containerRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const total = layout.colA + layout.colB;
    const move = (ev) => {
      const x = ev.clientX - rect.left;
      const ratio = Math.max(0.15, Math.min(0.85, x / rect.width));
      setColumns(ratio * total, (1 - ratio) * total);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onRowDrag = (e) => {
    const c = containerRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const total = layout.rowA + layout.rowB;
    const move = (ev) => {
      const y = ev.clientY - rect.top;
      const ratio = Math.max(0.15, Math.min(0.85, y / rect.height));
      setRows(ratio * total, (1 - ratio) * total);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const resetLayout = () => setLayout(defaultLayout(seedSym));

  // Layout on mobile: stack vertically + tap-to-focus pattern (focused pane fills viewport).
  const gridTemplate = bp.mobile
    ? {
        gridTemplateColumns: "1fr",
        gridTemplateRows: focusedIdx != null ? "1fr" : "repeat(4, 1fr)",
      }
    : {
        gridTemplateColumns: `${layout.colA}fr ${layout.colB}fr`,
        gridTemplateRows: `${layout.rowA}fr ${layout.rowB}fr`,
      };

  return (
    <div style={{
      padding: bp.mobile ? "8px 10px 12px" : "12px 16px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      height: bp.mobile ? "calc(100vh - 52px - 56px)" : "calc(100vh - 56px - 48px)",
      minHeight: bp.mobile ? 480 : 600,
    }}>
      <div className="row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="font-display t-xs faint">TERMINAL ▸ WORKSPACE</span>
        <div style={{ flex: 1 }} />
        {bp.mobile && focusedIdx != null && (
          <button className="pxl-btn sm" onClick={() => setFocusedIdx(null)} style={{ color: "var(--amber)" }}>
            ▣ ALL PANES
          </button>
        )}
        {!bp.mobile && <button className="pxl-btn sm" onClick={resetLayout}>↻ RESET LAYOUT</button>}
        <button className="pxl-btn sm" onClick={() => onNav("dashboard")}>◀ DASH</button>
      </div>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: "relative",
          display: "grid",
          gap: 4,
          ...gridTemplate,
          minHeight: 0,
        }}
      >
        {layout.panes.map((p, idx) => {
          // Mobile: only render focused pane if one is selected
          if (bp.mobile && focusedIdx != null && focusedIdx !== idx) return null;
          return (
            <PaneShell
              key={idx}
              idx={idx}
              pane={p}
              tickers={tickers}
              focused={bp.mobile && focusedIdx === idx}
              onTap={bp.mobile ? () => setFocusedIdx(focusedIdx === idx ? null : idx) : null}
              onChange={(patch) => updatePane(idx, patch)}
              onCycle={() => cyclePaneKind(idx)}
              onNavTicker={(t) => onNav("ticker", t)}
            />
          );
        })}

        {/* Central cross drag handles — desktop/tablet only */}
        {!bp.mobile && <div
          onPointerDown={onColDrag}
          title="Drag to resize columns"
          style={{
            position: "absolute",
            top: 0, bottom: 0,
            left: `calc(${(layout.colA / (layout.colA + layout.colB)) * 100}% - 4px)`,
            width: 8,
            cursor: "col-resize",
            zIndex: 5,
          }}
        >
          <div style={{
            width: 2, height: "100%",
            margin: "0 auto",
            background: "var(--line)",
          }} />
        </div>}
        {!bp.mobile && <div
          onPointerDown={onRowDrag}
          title="Drag to resize rows"
          style={{
            position: "absolute",
            left: 0, right: 0,
            top: `calc(${(layout.rowA / (layout.rowA + layout.rowB)) * 100}% - 4px)`,
            height: 8,
            cursor: "row-resize",
            zIndex: 5,
          }}
        >
          <div style={{
            height: 2, width: "100%",
            marginTop: 3,
            background: "var(--line)",
          }} />
        </div>}
      </div>
    </div>
  );
}

function PaneShell({ idx, pane, tickers, focused, onTap, onChange, onCycle, onNavTicker }) {
  const meta = PANE_KINDS.find(k => k.key === pane.kind) || PANE_KINDS[0];
  const accents = ["cyan", "amber", "green", "violet"];
  const accent = accents[idx % accents.length];
  const symbolOptions = (tickers || []).map(t => t.sym);
  return (
    <div className="pxl pxl-raised" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="pxl-head" style={{ flexShrink: 0, cursor: onTap ? "pointer" : "default" }}
        onClick={onTap ? (e) => { if (e.target.tagName !== "SELECT" && e.target.tagName !== "BUTTON") onTap(); } : undefined}>
        <span className="row gap-2" style={{ alignItems: "center" }}>
          <span className={`dot ${accent}`}></span>
          <PixelIcon name={meta.icon} color={`var(--${accent})`} size={12} />
          {meta.label}{focused && <span className="font-display t-xs faint" style={{ marginLeft: 4 }}>▣ FOCUSED</span>}
          {pane.kind !== "watchlist" && pane.kind !== "spark" && (
            <select
              value={pane.sym || ""}
              onChange={(e) => onChange({ sym: e.target.value })}
              style={{
                marginLeft: 6,
                background: "var(--bg-0)",
                color: "var(--ink)",
                border: "2px solid var(--line)",
                fontFamily: "Silkscreen, monospace",
                fontSize: 10,
                letterSpacing: "0.06em",
                padding: "2px 4px",
              }}
            >
              {symbolOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </span>
        <button
          className="pxl-btn sm ghost"
          onClick={onCycle}
          style={{ padding: "2px 6px" }}
          title="Cycle pane type"
        >
          ↻
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PaneBody pane={pane} tickers={tickers} onNavTicker={onNavTicker} />
      </div>
    </div>
  );
}

function PaneBody({ pane, tickers, onNavTicker }) {
  const t = (tickers || []).find(x => x.sym === pane.sym) || (tickers && tickers[0]);

  if (pane.kind === "chart") {
    return <ChartPane t={t} />;
  }
  if (pane.kind === "watchlist") {
    return (
      <div className="col">
        {(tickers || []).slice(0, 14).map(tk => (
          <div
            key={tk.sym}
            onClick={() => onNavTicker(tk)}
            className="row gap-2"
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid var(--line-soft)",
              cursor: "pointer",
              alignItems: "center",
            }}
          >
            <TickerSprite t={tk} size={20} />
            <span className="font-display t-sm" style={{ flex: 1 }}>{tk.sym}</span>
            <span className="font-mono t-sm" style={{ fontWeight: 700 }}>${(tk.price || 0).toFixed(2)}</span>
            <span className={`font-mono t-xs ${tk.change >= 0 ? "green" : "red"}`}>
              {tk.change >= 0 ? "+" : ""}{(tk.change || 0).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (pane.kind === "news") {
    return <NewsPane sym={pane.sym} />;
  }
  if (pane.kind === "verdict") {
    return <VerdictPane t={t} />;
  }
  if (pane.kind === "spark") {
    return (
      <div style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {(tickers || []).slice(0, 12).map(tk => (
          <div
            key={tk.sym}
            onClick={() => onNavTicker(tk)}
            className="pxl-inset"
            style={{ padding: 6, cursor: "pointer" }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="font-display t-xs">{tk.sym}</span>
              <span className={`font-mono t-xs ${tk.change >= 0 ? "green" : "red"}`}>
                {tk.change >= 0 ? "+" : ""}{(tk.change || 0).toFixed(2)}%
              </span>
            </div>
            <Sparkline data={tk.spark || [1, 1]} width={120} height={28} />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function ChartPane({ t }) {
  const wrapRef = useRefWS(null);
  const [w, setW] = useStateWS(420);
  useEffectWS(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setW(Math.max(240, Math.floor(cr.width - 16)));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const [live] = useTickerHistory
    ? useTickerHistory(t?._live ? t.sym : null, 60)
    : [null];
  const candles = (Array.isArray(live) && live.length > 0)
    ? live
    : (t?.candles?.length ? t.candles : []);

  if (!t || candles.length < 2) {
    return (
      <div style={{ padding: 24 }}>
        <SkelChart h={200} />
      </div>
    );
  }
  return (
    <div ref={wrapRef} style={{ padding: 8 }}>
      <div className="row gap-3" style={{ alignItems: "baseline", padding: "4px 4px 8px" }}>
        <span style={{ fontFamily: "Silkscreen", fontSize: 14 }}>{t.sym}</span>
        <span className="font-mono" style={{ fontWeight: 700, fontSize: 18 }}>${(t.price || 0).toFixed(2)}</span>
        <PriceDelta pct={t.change || 0} />
      </div>
      <CandleChart candles={candles.slice(-60)} width={w} height={180} />
      <VolumeBars candles={candles.slice(-60)} width={w} height={40} />
    </div>
  );
}

function NewsPane({ sym }) {
  const [live] = useTickerNews ? useTickerNews(sym) : [null];
  const news = (Array.isArray(live) && live.length > 0)
    ? live.map(n => ({
        time: (n.publish_time || "").slice(11, 16) || "—",
        src: n.source || n.publisher || "",
        tag: (n.category || "NEWS").toUpperCase(),
        impact: n.impact || "low",
        title: n.title || n.headline || "",
        tickers: n.tickers || [sym],
      }))
    : MOCK.news;

  return (
    <div className="col">
      {news.slice(0, 10).map((n, i) => {
        const tone = n.impact === "high" ? "red" : n.impact === "med" ? "amber" : "cyan";
        return (
          <div key={i} style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--line-soft)",
          }}>
            <div className="row gap-2" style={{ alignItems: "center", marginBottom: 4 }}>
              <span className="font-mono t-xs faint">{n.time}</span>
              <PixelBadge tone={tone}>{n.tag}</PixelBadge>
              <span className="font-display t-xs faint" style={{ marginLeft: "auto" }}>{n.src}</span>
            </div>
            <div className="t-sm" style={{ lineHeight: 1.4 }}>{n.title}</div>
          </div>
        );
      })}
    </div>
  );
}

function VerdictPane({ t }) {
  const v = MOCK.aiVerdict;
  if (!t) return null;
  return (
    <div style={{ padding: 14 }}>
      <div className="row gap-2 mb-3" style={{ alignItems: "center" }}>
        <TickerSprite t={t} size={28} />
        <span style={{ fontFamily: "Silkscreen", fontSize: 14 }}>{t.sym}</span>
        <VerdictPill verdict={t.ai} />
      </div>
      <p className="t-sm dim" style={{ marginBottom: 10 }}>{v.summary}</p>
      <div className="tw-h">BULL</div>
      <ul style={{ listStyle: "none", margin: "4px 0 10px" }}>
        {v.pros.map((p, i) => (
          <li key={i} className="t-xs" style={{ paddingLeft: 10, marginBottom: 2 }}>
            <span className="green">▸ </span>{p}
          </li>
        ))}
      </ul>
      <div className="tw-h">BEAR</div>
      <ul style={{ listStyle: "none", margin: "4px 0" }}>
        {v.cons.map((c, i) => (
          <li key={i} className="t-xs" style={{ paddingLeft: 10, marginBottom: 2 }}>
            <span className="red">▸ </span>{c}
          </li>
        ))}
      </ul>
    </div>
  );
}


export { Workspace };


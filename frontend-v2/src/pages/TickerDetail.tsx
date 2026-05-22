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

// Ticker detail view — pixel terminal deep-dive

// Build view-model from a /composite payload's risk_analysis + scenarios so
// the verdict / risk / scenarios panels render with real DB data.
function buildLiveVerdict(composite, t) {
  const r = composite.risk_analysis || {};
  const clamp = (n) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));
  const num = (n, d = 0) => {
    const x = Number(n);
    return isFinite(x) ? x : d;
  };

  const scenarioRows = Array.isArray(r.scenarios) ? r.scenarios : [];
  const findS = (kind) =>
    scenarioRows.find(s => (s.scenario_type || s.scenario || "").toLowerCase() === kind);
  const sBull = findS("bull");
  const sBase = findS("base");
  const sBear = findS("bear");

  const scenarios = ["BULL", "BASE", "BEAR"].map((name) => {
    const s = name === "BULL" ? sBull : name === "BASE" ? sBase : sBear;
    if (!s) return { name, prob: 0, target: t.price || 0, label: "—" };
    return {
      name,
      prob: num(s.probability, 0),
      target: num(s.price_mid ?? s.price_high ?? s.price_low, t.price || 0),
      label: s.description ? truncate(s.description, 80) : "—",
    };
  });

  const summary = sBase?.description ||
    `${r.sentiment ? r.sentiment + " — " : ""}Overall score ${num(r.overall_score).toFixed(1)}/10, upside ${num(r.upside_percent).toFixed(1)}% to ${num(r.price_target).toFixed(2)} target.`;

  // Catalysts → pros, red flags → cons
  const catalysts = Array.isArray((composite.risk_analysis || {}).catalysts)
    ? composite.risk_analysis.catalysts.slice(0, 5)
    : [];
  const pros = catalysts.length > 0
    ? catalysts.map(c => c.description || c.title || c.name || String(c)).filter(Boolean)
    : (sBull?.key_drivers || []).slice(0, 5);
  const cons = Array.isArray(r.red_flags) && r.red_flags.length > 0
    ? r.red_flags.slice(0, 5)
    : (sBear?.key_drivers || []).slice(0, 5);

  return {
    summary,
    pros: pros.length ? pros : ["No catalysts recorded."],
    cons: cons.length ? cons : ["No red flags recorded."],
    scenarios,
    risks: {
      financial: clamp(r.financial_risk),
      execution: clamp(r.execution_risk),
      dilution: clamp(r.dilution_risk),
      competitive: clamp(r.competitive_risk),
      regulatory: clamp(r.regulatory_risk),
    },
    sentiment: r.sentiment,
    overall_score: num(r.overall_score),
    upside_percent: num(r.upside_percent),
    _live: true,
  };
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatMC(n) {
  const x = Number(n);
  if (!isFinite(x) || x === 0) return null;
  const abs = Math.abs(x);
  if (abs >= 1e12) return (x / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (x / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (x / 1e6).toFixed(2) + "M";
  return x.toFixed(0);
}

// Short "5m ago" / "2h ago" / "3d ago" stamp for social posts.
function __agoStr(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return "—";
  const diff = Math.max(0, (Date.now() - t) / 1000);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

// Deterministic candle stub for instant render while history is fetching.
function __stubCandles(seed, n, anchor) {
  let s = (seed || 1) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = [];
  let close = anchor || 100;
  for (let i = 0; i < n; i++) {
    const open = close;
    const range = 2 + rnd() * 6;
    const dir = rnd() > 0.45 ? 1 : -1;
    close = open + dir * rnd() * range;
    const high = Math.max(open, close) + rnd() * 2;
    const low = Math.min(open, close) - rnd() * 2;
    out.push({ o: open, h: high, l: low, c: close });
  }
  return out;
}

// Range presets for the chart range selector. Backend supports interval ∈
// {1m,5m,15m,1h,1d}, days, from. We use intraday for 1D/5D, daily otherwise.
const RANGE_PRESETS = {
  "1D":  { days: 1,    interval: "15m" },
  "5D":  { days: 5,    interval: "1h"  },
  "1M":  { days: 30,   interval: "1d"  },
  "3M":  { days: 90,   interval: "1d"  },
  "YTD": { _ytd: true, interval: "1d"  },
  "1Y":  { days: 365,  interval: "1d"  },
  "5Y":  { days: 1825, interval: "1d"  },
  "MAX": { days: 3650, interval: "1d"  },
};

function rangePresetOpts(key) {
  const p = RANGE_PRESETS[key] || RANGE_PRESETS["1M"];
  if (p._ytd) {
    const from = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    return { from, interval: p.interval };
  }
  return { days: p.days, interval: p.interval };
}

function TickerDetail({ t, onBack }) {
  const [tab, setTab] = useStateT("overview");
  const [actionPanel, setActionPanel] = useStateT(null); // null | "alert" | "buy" | "watchlist"
  const [actionMsg, setActionMsg] = useStateT(null);
  const [range, setRange] = useStateT("1M");
  const bp = useBreakpoint();
  const m = MOCK;

  // Lazy-load real candles + news + composite (risk/scenarios/fundamentals)
  // when this is a live ticker.
  const [liveCandles, candlesMeta] = useTickerHistory
    ? useTickerHistory(t._live ? t.sym : null, rangePresetOpts(range))
    : [null, {}];
  const [liveNews] = useTickerNews
    ? useTickerNews(t._live ? t.sym : null)
    : [null];
  const [composite] = useTickerComposite
    ? useTickerComposite(t._live ? t.sym : null)
    : [null];

  // Build the verdict view-model: prefer live composite.risk_analysis, fall
  // back to MOCK for the demo flow.
  const v = composite && composite.risk_analysis
    ? buildLiveVerdict(composite, t)
    : m.aiVerdict;
  const fundamentals = composite && composite.fundamentals
    ? composite.fundamentals
    : null;

  const candles = (Array.isArray(liveCandles) && liveCandles.length > 0)
    ? liveCandles
    : (Array.isArray(t.candles) && t.candles.length > 0)
      ? t.candles
      : __stubCandles(t.seed, 60, t.price);

  const newsList = Array.isArray(liveNews) && liveNews.length > 0
    ? liveNews.map(n => ({
        time: (n.publish_time || "").slice(11, 16) || "—",
        src: n.source || n.publisher || "",
        tag: (n.category || "NEWS").toUpperCase(),
        impact: n.impact || "low",
        title: n.title || n.headline || "",
        tickers: n.tickers || [t.sym],
      }))
    : m.news;

  const high = Math.max(...candles.map(c => c.h));
  const low = Math.min(...candles.map(c => c.l));

  // Responsive widths
  const heroGrid = bp.mobile ? "1fr" : bp.tablet ? "1fr 1fr" : "1.2fr 1.5fr 1.3fr";
  const tabsGrid = bp.mobile ? "1fr" : bp.tablet ? "1fr" : "1.6fr 1fr";
  const sideGrid = bp.mobile ? "1fr" : "1fr 320px";
  const chartW = bp.mobile ? 340 : bp.tablet ? 620 : 720;
  const pageGutter = bp.mobile ? "0 12px 24px" : "0 20px 32px";

  return (
    <div style={{ padding: pageGutter, display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header / breadcrumb */}
      <div className="row" style={{ alignItems: "center", gap: 8, padding: "12px 0", flexWrap: "wrap" }}>
        <button className="pxl-btn sm" onClick={onBack}>◀ BACK</button>
        {!bp.mobile && <span className="font-display t-xs faint">TERMINAL ▸ ANALYZER ▸ {t.sym}</span>}
        <div style={{ flex: 1 }} />
        <button
          className="pxl-btn sm"
          onClick={() => setActionPanel(p => p === "alert" ? null : "alert")}
          style={{
            borderColor: actionPanel === "alert" ? "var(--amber)" : undefined,
            color: actionPanel === "alert" ? "var(--amber)" : undefined,
          }}
        >
          <PixelIcon name="bell" size={8} color="currentColor" /> {!bp.mobile && "ALERT"}
        </button>
        <button
          className="pxl-btn sm"
          onClick={async () => {
            setActionPanel(null);
            if (!API) return;
            const res = await API.favoritesToggle(t.sym).catch(() => null);
            // Invalidate watchlist queries so sidebar + watchlist page refresh
            if (invalidateQueries) invalidateQueries("/watchlists");
            if (res?.added != null) {
              setActionMsg({ tone: res.added ? "green" : "amber", text: res.added ? `Added ${t.sym} to favourites` : `Removed ${t.sym} from favourites` });
              setTimeout(() => setActionMsg(null), 2400);
            } else {
              setActionMsg({ tone: "red", text: "Favourite toggle failed (auth?)" });
              setTimeout(() => setActionMsg(null), 2400);
            }
          }}
          style={{ color: "var(--amber)", borderColor: "var(--amber-dark)" }}
        >
          <PixelIcon name="star" size={8} color="currentColor" /> {!bp.mobile && "WATCHLIST"}
        </button>
        <button
          className="pxl-btn sm"
          onClick={() => setActionPanel(p => p === "research" ? null : "research")}
          style={{
            borderColor: actionPanel === "research" ? "var(--violet)" : undefined,
            color: actionPanel === "research" ? "var(--violet)" : undefined,
          }}
        >
          <PixelIcon name="brain" size={8} color="currentColor" /> {!bp.mobile && "RUN AI"}
        </button>
        <button
          className="pxl-btn sm primary"
          onClick={() => setActionPanel(p => p === "buy" ? null : "buy")}
        >+ BUY</button>
      </div>

      {actionMsg && (
        <div className="pxl pxl-raised" style={{
          padding: "10px 14px",
          color: `var(--${actionMsg.tone})`,
          fontFamily: "Silkscreen, monospace",
          fontSize: 11,
          letterSpacing: "0.06em",
        }}>
          ▸ {actionMsg.text}
        </div>
      )}

      {actionPanel === "alert" && (
        <AlertCreatePanel t={t}
          onClose={() => setActionPanel(null)}
          onDone={(msg) => { setActionMsg(msg); setActionPanel(null); setTimeout(() => setActionMsg(null), 2800); }} />
      )}
      {actionPanel === "buy" && (
        <BuyPositionPanel t={t}
          onClose={() => setActionPanel(null)}
          onDone={(msg) => { setActionMsg(msg); setActionPanel(null); setTimeout(() => setActionMsg(null), 2800); }} />
      )}
      {actionPanel === "research" && (
        <RunResearchPanel t={t}
          onClose={() => setActionPanel(null)}
          onDone={(msg) => { setActionMsg(msg); setActionPanel(null); setTimeout(() => setActionMsg(null), 4000); }} />
      )}

      {/* HERO — dense single-panel layout */}
      <div className="pxl pxl-raised" style={{ padding: bp.mobile ? 12 : 14 }}>
        {/* Top row: identity (left) | price (centre) | radar (right) */}
        <div style={{
          display: "grid",
          gridTemplateColumns: bp.mobile ? "1fr" : "minmax(0, 1.2fr) minmax(0, 1.4fr) 160px",
          gap: bp.mobile ? 12 : 18,
          alignItems: "center",
        }}>
          {/* Identity column */}
          <div className="row gap-3" style={{ alignItems: "center", minWidth: 0 }}>
            <TickerSprite t={t} size={bp.mobile ? 40 : 48} />
            <div className="col" style={{ gap: 2, minWidth: 0 }}>
              <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "Silkscreen", fontSize: bp.mobile ? 18 : 22, letterSpacing: "0.02em" }}>{t.sym}</span>
                <VerdictPill verdict={t.ai} />
              </div>
              <div className="t-xs dim" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.name}
              </div>
              <div className="row gap-1 mt-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
                <PixelBadge>{(t.sector || "—").toString().slice(0, 18)}</PixelBadge>
                <PixelBadge tone="cyan">MKT OPEN</PixelBadge>
              </div>
            </div>
          </div>

          {/* Price column */}
          <div className="col" style={{ alignItems: bp.mobile ? "flex-start" : "center", gap: 4 }}>
            <div className="row gap-2" style={{ alignItems: "baseline" }}>
              <span className="font-mono" style={{
                fontSize: bp.mobile ? 36 : 46, fontWeight: 700, letterSpacing: "-0.04em",
                lineHeight: 1,
              }}>
                ${t.price.toFixed(2)}
              </span>
              <PriceDelta pct={t.change} />
            </div>
            <div className="row gap-3 t-xs faint" style={{ marginTop: 2 }}>
              <span><span className="dim">OPEN</span>&nbsp;<span className="font-mono ink">${(t.price - t.change * 0.6).toFixed(2)}</span></span>
              <span><span className="dim">VOL</span>&nbsp;<span className="font-mono ink">12.4M</span></span>
              <span><span className="dim">AVG</span>&nbsp;<span className="font-mono ink">9.2M</span></span>
            </div>
            {/* 52W range tucked under price */}
            <div style={{ width: "100%", maxWidth: 320, marginTop: 4 }}>
              <RangeBar low={low * 0.85} high={high * 1.15} current={t.price} />
            </div>
          </div>

          {/* Radar column (only on desktop/tablet; collapses on mobile) */}
          {!bp.mobile && (
            <div className="col gap-1" style={{ alignItems: "center" }}>
              <RiskRadar
                size={150}
                labels={["FIN", "EXC", "DIL", "COM", "REG"]}
                values={[
                  v.risks.financial, v.risks.execution, v.risks.dilution,
                  v.risks.competitive, v.risks.regulatory,
                ]}
                color={
                  Math.max(v.risks.financial, v.risks.execution, v.risks.dilution,
                           v.risks.competitive, v.risks.regulatory) >= 7
                    ? "var(--red)"
                    : "var(--amber)"
                }
              />
            </div>
          )}
        </div>

        {/* Dense fundamentals strip — 6 KPIs in a row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: bp.mobile ? "repeat(3, 1fr)" : "repeat(6, 1fr)",
          gap: 6,
          marginTop: 12,
          paddingTop: 12,
          borderTop: "2px dashed var(--line)",
        }}>
          {(() => {
            const f = fundamentals || {};
            const mc = formatMC(f.market_cap) || t.mc;
            const pe = (f.pe_ttm ?? f.trailing_pe ?? t.pe);
            const peStr = (pe != null && isFinite(Number(pe))) ? Number(pe).toFixed(1) : "—";
            const divYld = (f.dividend_yield != null && isFinite(Number(f.dividend_yield)))
              ? (Number(f.dividend_yield) * 100).toFixed(2) + "%"
              : "—";
            const beta = (f.beta != null && isFinite(Number(f.beta))) ? Number(f.beta).toFixed(2) : "—";
            const eps = (f.eps_ttm != null && isFinite(Number(f.eps_ttm))) ? "$" + Number(f.eps_ttm).toFixed(2) : "—";
            const fcfFmt = formatMC(f.free_cash_flow_ttm ?? f.free_cash_flow ?? f.fcf);
            const fcf = fcfFmt ? "$" + fcfFmt : "—";
            return [
              ["MKT CAP", mc],
              ["P/E TTM", peStr],
              ["DIV YLD", divYld],
              ["BETA", beta],
              ["EPS", eps],
              ["FCF", fcf],
            ];
          })().map(([lbl, val]) => (
            <div key={lbl} className="pxl-inset" style={{ padding: "5px 8px" }}>
              <div className="font-display t-xs faint" style={{ lineHeight: 1 }}>{lbl}</div>
              <div className="font-mono t-sm" style={{ fontWeight: 700, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="row" style={{ gap: 0, borderBottom: "2px solid var(--line)", marginTop: -8 }}>
        {[
          ["overview", "OVERVIEW"],
          ["research", "AI RESEARCH"],
          ["financials", "FINANCIALS"],
          ["social", "SOCIAL / EVENTS"]
        ].map(([k, lbl]) => (
          <button key={k} className={`pxl-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {lbl}
          </button>
        ))}
      </div>

      {/* TAB: Overview */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: tabsGrid, gap: 16 }}>
          {/* Chart */}
          <PixelPanel
            title={`${t.sym} ▸ PRICE / VOL`}
            accent="cyan"
            actions={
              <span className="row gap-1" style={{ flexWrap: "wrap" }}>
                {(bp.mobile ? ["1D", "1M", "1Y"] : ["1D", "5D", "1M", "3M", "YTD", "1Y", "5Y", "MAX"]).map(p => (
                  <button key={p}
                    onClick={() => setRange(p)}
                    className="pxl-btn sm ghost"
                    style={{
                      color: range === p ? "var(--amber)" : "var(--ink-dim)",
                      borderColor: range === p ? "var(--amber)" : "transparent",
                      background: range === p ? "rgba(255,194,60,0.08)" : "transparent",
                    }}>
                    {p}
                  </button>
                ))}
                {candlesMeta?.loading && <Spinner />}
              </span>
            }
          >
            <div style={{ padding: 12, overflowX: "auto" }}>
              <CandleChart candles={candles} width={chartW} height={bp.mobile ? 200 : 260} />
              <VolumeBars candles={candles} width={chartW} height={bp.mobile ? 48 : 60} />
            </div>
          </PixelPanel>

          {/* AI verdict */}
          <PixelPanel
            title="AI ANALYSIS"
            accent="amber"
            actions={<span className="sticker">v3.4 ENSEMBLE</span>}
          >
            <div style={{ padding: 14 }}>
              <div className="row gap-2 mb-3" style={{ alignItems: "center" }}>
                <PixelIcon name="brain" color="var(--amber)" size={16} />
                <span className="font-display t-sm amber">VERDICT</span>
                <VerdictPill verdict={t.ai} />
              </div>
              <p style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.55, marginBottom: 14 }}>
                {v.summary}
              </p>

              <div className="font-display t-xs green mb-2">▲ BULL FACTORS</div>
              <ul style={{ listStyle: "none", marginBottom: 12 }}>
                {v.pros.map((p, i) => (
                  <li key={i} className="t-sm" style={{ paddingLeft: 12, position: "relative", marginBottom: 4 }}>
                    <span style={{ position: "absolute", left: 0, color: "var(--green)" }}>▸</span>
                    {p}
                  </li>
                ))}
              </ul>

              <div className="font-display t-xs red mb-2">▼ BEAR FACTORS</div>
              <ul style={{ listStyle: "none" }}>
                {v.cons.map((c, i) => (
                  <li key={i} className="t-sm" style={{ paddingLeft: 12, position: "relative", marginBottom: 4 }}>
                    <span style={{ position: "absolute", left: 0, color: "var(--red)" }}>▸</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </PixelPanel>

          {/* Scenarios */}
          <PixelPanel title="PRICE SCENARIOS" accent="violet">
            <div style={{ padding: 14 }}>
              {v.scenarios.map(s => {
                const isBull = s.name === "BULL";
                const isBear = s.name === "BEAR";
                const color = isBull ? "green" : isBear ? "red" : "cyan";
                const delta = ((s.target - t.price) / t.price) * 100;
                return (
                  <div key={s.name} className="row gap-3 mb-3" style={{ alignItems: "center" }}>
                    <span className={`pxl-badge ${color}`} style={{ width: 56, justifyContent: "center" }}>{s.name}</span>
                    <div className="col gap-1" style={{ flex: 1 }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <span className="font-mono t-sm" style={{ fontWeight: 700 }}>${s.target.toFixed(2)}</span>
                        <span className={`font-mono t-xs ${delta >= 0 ? "green" : "red"}`}>
                          {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                        </span>
                      </div>
                      <div className="t-xs faint">{s.label}</div>
                      <div style={{ display: "flex", gap: 2, height: 6 }}>
                        {Array.from({ length: 20 }).map((_, i) => (
                          <span key={i} style={{
                            flex: 1,
                            background: i < Math.round(s.prob * 20) ? `var(--${color})` : "var(--bg-3)"
                          }} />
                        ))}
                      </div>
                      <span className="font-mono t-xs faint">{(s.prob * 100).toFixed(0)}% PROBABILITY</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </PixelPanel>

          {/* Recent news (sidebar) */}
          <PixelPanel title="RELATED NEWS" accent="cyan" scroll height={280}>
            {newsList.filter(n => (n.tickers || []).includes(t.sym) || (n.tickers || []).length === 0).slice(0, 5).map((n, i) => (
              <NewsRow key={i} n={n} />
            ))}
          </PixelPanel>
        </div>
      )}

      {/* TAB: Research */}
      {tab === "research" && <ResearchTab t={t} bp={bp} />}

      {/* TAB: Financials */}
      {tab === "financials" && <FinancialsTab t={t} bp={bp} />}

      {/* TAB: Social */}
      {tab === "social" && <SocialTab t={t} bp={bp} />}
    </div>
  );
}

function ResearchTab({ t, bp }) {
  // Pull this ticker's recent research notes from the live backend (paginated).
  // Falls back to a tiny mocked timeline when API not reachable.
  const [liveData] = useApi
    ? useApi(
        () => (t._live && API
          ? API.researchList({ ticker: t.sym, limit: 12, status: "all" })
          : Promise.resolve(null)),
        [t.sym, t._live],
      )
    : [null];

  const liveReports = (liveData && Array.isArray(liveData.data)) ? liveData.data : null;
  const latest = liveReports && liveReports.find(r => r.status === "completed");
  const reports = liveReports
    ? liveReports.map(r => ({
        id: r.id,
        date: r.created_at ? r.created_at.slice(0, 10) : "—",
        model: ((r.models_used && r.models_used.join(" / ")) || r.provider || "—").toUpperCase().slice(0, 40),
        quality: (r.quality || "—").toUpperCase(),
        verdict: r.numeric_context?.[t.sym]?.risk_reward?.sentiment?.toUpperCase()
                 || r.status?.toUpperCase()
                 || "—",
        tokens: r.tokens_out
          ? `${Math.round((r.tokens_in || 0) + (r.tokens_out || 0)) / 1000 | 0}K`
          : "—",
        by: r.user?.email?.split("@")[0] || "you",
        title: r.title,
      }))
    : [
        { date: "2026-05-18", model: "GEMINI-2.5 / ENSEMBLE", quality: "DEEP", verdict: "STRONG BUY", tokens: "184K", by: "you" },
        { date: "2026-05-12", model: "GPT-5 / SOLO", quality: "HIGH", verdict: "STRONG BUY", tokens: "92K", by: "you" },
      ];

  // Markdown → plain text (very rough — strips #, *, _, `)
  const stripMd = (s) => String(s || "").replace(/[#*_`]/g, "").replace(/\n{3,}/g, "\n\n");
  const latestBody = latest?.answer_markdown ? stripMd(latest.answer_markdown) : null;
  const latestModels = latest?.models_used?.length
    ? latest.models_used.join(" ▸ ").toUpperCase()
    : "GEMINI ▸ GPT ▸ CLAUDE";
  const latestDate = latest?.created_at ? latest.created_at.slice(0, 19).replace("T", " ") : "—";
  const latestTokensIn = latest?.tokens_in || 0;
  const latestTokensOut = latest?.tokens_out || 0;
  const totalTokens = latestTokensIn + latestTokensOut;

  return (
    <div style={{ display: "grid", gridTemplateColumns: bp?.mobile ? "1fr" : "1fr 320px", gap: 16 }}>
      <PixelPanel title="LATEST REPORT" accent="amber"
        actions={<span className="sticker">DEEP // ENSEMBLE</span>}
      >
        <div style={{ padding: 18 }}>
          <div className="row gap-3 mb-3" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <PixelIcon name="brain" color="var(--amber)" size={16} />
            <span className="font-display amber">{latestModels}</span>
            <span className="t-xs faint">{latestDate}</span>
          </div>

          <div className="row gap-2 mb-3 font-display t-xs" style={{ flexWrap: "wrap" }}>
            {latest?.quality_score != null && (
              <PixelBadge tone="amber">QUALITY {Number(latest.quality_score).toFixed(2)}</PixelBadge>
            )}
            {latest?.quality && <PixelBadge tone="cyan">{String(latest.quality).toUpperCase()}</PixelBadge>}
            {totalTokens > 0 && <PixelBadge>{totalTokens.toLocaleString()} TOKENS</PixelBadge>}
            {latest?.rarity && <PixelBadge tone="violet">{String(latest.rarity).toUpperCase()}</PixelBadge>}
          </div>

          {latestBody ? (
            <div style={{
              fontSize: 13, lineHeight: 1.6, marginBottom: 20,
              maxHeight: 320, overflow: "auto",
              whiteSpace: "pre-wrap",
              color: "var(--ink)",
            }}>
              {latestBody.slice(0, 2400)}
              {latestBody.length > 2400 && (
                <span className="faint t-xs"> … (truncated — {latestBody.length.toLocaleString()} chars total)</span>
              )}
            </div>
          ) : (
            <div className="t-sm faint" style={{ marginBottom: 20 }}>
              {liveReports
                ? "No completed report yet for this ticker. Run a new research ticket via the chat overlay."
                : "Loading report…"}
            </div>
          )}

          <div className="pxl-inset" style={{ padding: 12 }}>
            <span className="font-display t-xs amber">ASK A FOLLOW-UP</span>
            <div className="row gap-2 mt-2">
              <input type="text" className="pxl-input" placeholder="> ask follow-up..." style={{ paddingLeft: 10 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target.value.trim()) {
                    window.dispatchEvent(new CustomEvent("v2:toggle-chat"));
                  }
                }}
              />
              <button className="pxl-btn primary" onClick={() => window.dispatchEvent(new CustomEvent("v2:toggle-chat"))}>RUN</button>
            </div>
          </div>
        </div>
      </PixelPanel>

      <PixelPanel title="REPORT HISTORY" accent="cyan"
        actions={<button className="pxl-btn sm primary">+ NEW</button>}
      >
        <div className="col">
          {reports.map((r, i) => (
            <ReportHistoryRow key={r.id || i} r={r} />
          ))}
        </div>
      </PixelPanel>
    </div>
  );
}

function FinancialsTab({ t, bp }) {
  // Pull live composite for analyst ratings (and yearly financials if Yahoo has them).
  const [composite] = useTickerComposite
    ? useTickerComposite(t._live ? t.sym : null)
    : [null];

  // Group analyst ratings into buckets used by the consensus widget.
  const live = (() => {
    const ratings = composite?.ratings;
    if (!Array.isArray(ratings) || ratings.length === 0) return null;
    const buckets = { "STRONG BUY": 0, "BUY": 0, "HOLD": 0, "SELL": 0, "STRONG SELL": 0 };
    const targets = [];
    for (const r of ratings) {
      const k = String(r.rating || "").toLowerCase();
      if (k.includes("strong") && k.includes("buy")) buckets["STRONG BUY"]++;
      else if (k === "buy" || k.includes("outperform") || k.includes("overweight")) buckets["BUY"]++;
      else if (k.includes("strong") && k.includes("sell")) buckets["STRONG SELL"]++;
      else if (k === "sell" || k.includes("underperform") || k.includes("underweight")) buckets["SELL"]++;
      else buckets["HOLD"]++;
      const pt = Number(r.price_target);
      if (isFinite(pt) && pt > 0) targets.push(pt);
    }
    const mean = targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : null;
    const total = ratings.length;
    return { buckets, mean, total };
  })();

  // Yearly revenue / earnings — composite's fundamentals.yahoo_metadata may have it
  const yearly = (() => {
    const arr = composite?.fundamentals?.yahoo_metadata?.summary?.financialsChart?.yearly;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.map(y => ({
      y: y.date != null ? `FY${String(y.date).slice(-2)}` : "—",
      revB: y.revenue ? Number(y.revenue) / 1e9 : 0,
      earnB: y.earnings ? Number(y.earnings) / 1e9 : 0,
    })).slice(-4);
  })();

  // Build a single-column "current TTM" income statement from fundamentals
  // when the multi-year yearly array isn't available. Honest about what's known.
  const fundB = composite?.fundamentals || {};
  const fmtB = (n) => {
    if (n == null || !isFinite(Number(n))) return "—";
    const x = Number(n);
    const abs = Math.abs(x);
    const sign = x < 0 ? "-" : "";
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  };
  const fmtPct = (n) => (n == null || !isFinite(Number(n))) ? "—" : `${(Number(n) * 100).toFixed(1)}%`;

  const haveLive = composite && composite.fundamentals;
  const years = (yearly && yearly.length > 0)
    ? yearly.map(y => y.y)
    : (haveLive ? ["TTM"] : ["FY22", "FY23", "FY24", "FY25E"]);

  const rows = (yearly && yearly.length > 0)
    ? [
        { label: "REVENUE",    vals: yearly.map(y => fmtB(y.revB * 1e9)) },
        { label: "EARNINGS",   vals: yearly.map(y => fmtB(y.earnB * 1e9)) },
      ]
    : haveLive ? [
        { label: "REVENUE",      vals: [fmtB(fundB.revenue_ttm)] },
        { label: "GROSS MARGIN", vals: [fmtPct(fundB.gross_margin)] },
        { label: "OPER. MARGIN", vals: [fmtPct(fundB.operating_margin)] },
        { label: "NET INCOME",   vals: [fmtB(fundB.net_income_ttm)] },
        { label: "EPS TTM",      vals: [fundB.eps_ttm != null && isFinite(Number(fundB.eps_ttm)) ? `$${Number(fundB.eps_ttm).toFixed(2)}` : "—"] },
        { label: "FCF",          vals: [fmtB(fundB.free_cash_flow_ttm ?? fundB.free_cash_flow)] },
        { label: "CASH",         vals: [fmtB(fundB.total_cash)] },
        { label: "DEBT",         vals: [fmtB(fundB.total_debt ?? fundB.debt)] },
        { label: "DEBT / EQ",    vals: [fundB.debt_to_equity != null && isFinite(Number(fundB.debt_to_equity)) ? Number(fundB.debt_to_equity).toFixed(2) : "—"] },
        { label: "BOOK / SHARE", vals: [fmtB(fundB.book_value_per_share)] },
      ]
    : [
        { label: "REVENUE",      vals: ["$2.84B", "$3.92B", "$5.21B", "$6.84B"] },
        { label: "GROSS PROFIT", vals: ["$1.04B", "$1.61B", "$2.34B", "$3.21B"] },
        { label: "GROSS MARGIN", vals: ["36.6%",  "41.1%",  "44.9%",  "46.9%"] },
        { label: "OP INCOME",    vals: ["-$120M", "$84M",   "$412M",  "$612M"] },
        { label: "NET INCOME",   vals: ["-$210M", "$22M",   "$304M",  "$498M"] },
        { label: "EPS DILUTED",  vals: ["-$1.20", "$0.13",  "$1.75",  "$2.84"] },
        { label: "FCF",          vals: ["-$92M",  "$48M",   "$224M",  "$312M"] },
        { label: "CASH",         vals: ["$612M",  "$840M",  "$1.04B", "$1.22B"] },
        { label: "DEBT",         vals: ["$480M",  "$420M",  "$380M",  "$340M"] },
      ];

  const bars = (yearly && yearly.length > 0)
    ? yearly.map(y => ({ y: y.y, v: y.revB }))
    : [
        { y: "FY22", v: 2.84 }, { y: "FY23", v: 3.92 },
        { y: "FY24", v: 5.21 }, { y: "FY25E", v: 6.84 }
      ];
  const maxV = Math.max(...bars.map(b => Math.abs(b.v))) || 1;

  return (
    <div style={{ display: "grid", gridTemplateColumns: bp?.mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
      <PixelPanel title="INCOME STATEMENT" accent="cyan">
        <table className="pxl-table">
          <thead>
            <tr>
              <th>METRIC</th>
              {years.map(y => <th key={y} className="num">{y}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td><span className="font-display t-xs faint">{r.label}</span></td>
                {r.vals.map((v, i) => (
                  <td key={i} className="num" style={{ fontWeight: i === r.vals.length - 1 ? 700 : 400, color: i === r.vals.length - 1 ? "var(--amber)" : "var(--ink)" }}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </PixelPanel>

      <div className="col gap-4">
        <PixelPanel title="REVENUE TRAJECTORY" accent="green">
          {(yearly && yearly.length > 0) ? (
            <div style={{ padding: 20, display: "flex", gap: 16, alignItems: "flex-end", height: 220 }}>
              {bars.map((b, i) => {
                const h = (Math.abs(b.v) / maxV) * 160;
                const isE = String(b.y).endsWith("E");
                return (
                  <div key={i} className="col" style={{ flex: 1, alignItems: "center", gap: 6 }}>
                    <span className="font-mono t-xs amber">${b.v.toFixed(2)}B</span>
                    <div style={{
                      width: "100%",
                      height: h,
                      background: isE ? "var(--amber)" : (b.v < 0 ? "var(--red)" : "var(--green)"),
                      border: "2px solid var(--line)",
                      boxShadow: "inset 0 4px 0 0 rgba(255,255,255,0.1), inset 0 -4px 0 0 rgba(0,0,0,0.2)"
                    }} />
                    <span className="font-display t-xs faint">{b.y}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: 24 }}>
              <EmptyState icon="chart" title={haveLive ? "ANNUAL FINANCIALS UNAVAILABLE" : "LOADING"}
                subtitle={haveLive
                  ? `Yahoo did not return a multi-year financials chart for ${t.sym}. Showing TTM figures only.`
                  : "Fetching composite payload…"} />
            </div>
          )}
        </PixelPanel>

        <PixelPanel title="ANALYST CONSENSUS" accent="amber">
          <div style={{ padding: 16 }}>
            <div className="col gap-2">
              {(() => {
                const buckets = live?.buckets || { "STRONG BUY": 18, "BUY": 9, "HOLD": 4, "SELL": 1, "STRONG SELL": 0 };
                const total = live?.total || Object.values(buckets).reduce((a, b) => a + b, 0) || 1;
                const max = Math.max(1, ...Object.values(buckets));
                return [
                  ["STRONG BUY", buckets["STRONG BUY"], "green"],
                  ["BUY",         buckets["BUY"],         "green"],
                  ["HOLD",        buckets["HOLD"],        "cyan"],
                  ["SELL",        buckets["SELL"],        "red"],
                  ["STRONG SELL", buckets["STRONG SELL"], "red"],
                ].map(([lbl, n, c]) => (
                  <div key={lbl} className="row gap-2" style={{ alignItems: "center" }}>
                    <span className="font-display t-xs" style={{ width: 96, color: `var(--${c})` }}>{lbl}</span>
                    <div style={{ flex: 1, height: 12, background: "var(--bg-0)", border: "2px solid var(--line)", position: "relative" }}>
                      <div style={{ width: `${(n / max) * 100}%`, height: "100%", background: `var(--${c})` }} />
                    </div>
                    <span className="font-mono t-xs" style={{ width: 24, textAlign: "right" }}>{n.toString().padStart(2, "0")}</span>
                  </div>
                ));
              })()}
            </div>
            <div className="pxl-rule" style={{ margin: "14px 0" }} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="font-display t-xs faint">PRICE TARGET (MEAN)</span>
              <span className="font-mono t-base" style={{ fontWeight: 700 }}>
                {live?.mean != null ? `$${live.mean.toFixed(2)}` : "$214.50"}
              </span>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

function SocialTab({ t, bp }) {
  // Live community comments for this ticker (with MOCK fallback for the demo flow).
  const [liveComments, commentsMeta] = useApi
    ? useApi(
        () => (t._live && API ? API.socialComments(t.sym) : Promise.resolve(null)),
        [t.sym, t._live],
      )
    : [null, {}];
  const [watchersData] = useApi
    ? useApi(
        () => (t._live && API ? API.socialWatchers(t.sym) : Promise.resolve(null)),
        [t.sym, t._live],
      )
    : [null];

  // StockTwits public sentiment + watchers history (no auth required).
  const [stAnalysis] = useApi
    ? useApi(
        () => (t._live && API ? API.stocktwitsAnalysis(t.sym) : Promise.resolve(null)),
        [t.sym, t._live],
      )
    : [null];
  const [stWatchers] = useApi
    ? useApi(
        () => (t._live && API ? API.stocktwitsWatchers(t.sym) : Promise.resolve(null)),
        [t.sym, t._live],
      )
    : [null];

  // Live posts when API responds with an array; fall back to a small mocked seed.
  const liveList = Array.isArray(liveComments)
    ? liveComments
    : (liveComments && Array.isArray(liveComments.items) ? liveComments.items
      : (liveComments && Array.isArray(liveComments.data) ? liveComments.data : null));
  const posts = liveList && liveList.length > 0
    ? liveList.map(c => ({
        id: c.id,
        user: c.user?.email?.split("@")[0] || c.user?.name || c.author || "anon",
        time: c.created_at ? __agoStr(c.created_at) : "—",
        tone: (c.sentiment === "bullish" || c.sentiment === "positive") ? "bull"
              : (c.sentiment === "bearish" || c.sentiment === "negative") ? "bear"
              : "neutral",
        text: c.body || c.text || c.content || "",
        likes: Number(c.likes_count ?? c.likes ?? 0),
      }))
    : (t._live ? [] : [
        { user: "kai_77", time: "12m", tone: "bull", text: "Long ZYRA into print. Backlog disclosure on the Q is the line in the sand. Looking for 28%+ GM commentary.", likes: 42 },
        { user: "macroratter", time: "1h", tone: "bear", text: "Capex sensitivity here is non-trivial — if ISM new orders re-roll, the multiple compresses fast. Sized small.", likes: 18 },
        { user: "helix.fund", time: "3h", tone: "bull", text: "Helix-7 is a real platform shift. Pricing power into 2027 looks underwritten by the order book.", likes: 91 },
        { user: "ts_quant", time: "5h", tone: "neutral", text: "Cup-and-handle on the daily, breakout level $192 with volume confirmation. Watching the close.", likes: 31 }
      ]);

  // Watchers count for the panel header
  const watchersCount = watchersData?.count ?? watchersData?.watchers ?? null;

  // Upcoming events derived from composite.risk_analysis.catalysts when present.
  const [composite] = useTickerComposite
    ? useTickerComposite(t._live ? t.sym : null)
    : [null];
  const liveCatalysts = Array.isArray(composite?.risk_analysis?.catalysts)
    ? composite.risk_analysis.catalysts
    : null;
  const liveEvents = liveCatalysts && liveCatalysts.length > 0
    ? liveCatalysts.slice(0, 6).map((c) => {
        const dt = c.expected_date || c.date || c.deadline || c.event_date;
        const d = dt ? new Date(dt) : null;
        const label = (c.description || c.title || c.name || "—").toString();
        const tone = (c.impact === "high" || c.priority === "high") ? "amber"
                   : (c.impact === "low" || c.priority === "low") ? "default"
                   : "cyan";
        const tag = (c.category || c.type || "CATALYST").toString().toUpperCase().slice(0, 10);
        return {
          date: d
            ? `${d.toLocaleString("en", { month: "short" }).toUpperCase()} ${String(d.getDate()).padStart(2, "0")}`
            : "TBD",
          label: label.length > 60 ? label.slice(0, 57) + "…" : label,
          tag, tone,
        };
      })
    : null;

  const events = liveEvents || [
    { date: "JUN 12", label: "Q3 EARNINGS PRINT", tag: "EARNINGS", tone: "amber" },
    { date: "JUN 24", label: "ANALYST DAY — HELIX-7 RAMP", tag: "INVESTOR", tone: "cyan" },
    { date: "JUL 08", label: "EU-MERIDIAN CONTRACT DECISION", tag: "CATALYST", tone: "green" },
    { date: "JUL 22", label: "EX-DIVIDEND — $0.24", tag: "DIV", tone: "cyan" },
    { date: "AUG 04", label: "OPTIONS EXPIRATION", tag: "OPTIONS", tone: "default" }
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: bp?.mobile ? "1fr" : "1fr 320px", gap: 16 }}>
      <div className="col gap-4">
      {stAnalysis && <StockTwitsWidget analysis={stAnalysis} watchers={stWatchers} sym={t.sym} />}
      <PixelPanel
        title="COMMUNITY DISCUSSION"
        accent="cyan"
        actions={
          <span className="row gap-2" style={{ alignItems: "center" }}>
            {watchersCount != null && (
              <PixelBadge tone="amber">{watchersCount} WATCHERS</PixelBadge>
            )}
            <span className="font-display t-xs faint">{posts.length} POSTS</span>
          </span>
        }
      >
        <div className="p-3" style={{ borderBottom: "2px solid var(--line)" }}>
          <div className="pxl-inset" style={{ padding: 10 }}>
            <textarea
              placeholder="> post to community..."
              style={{
                width: "100%", background: "transparent", border: "none", outline: "none",
                fontFamily: "JetBrains Mono", fontSize: 12, color: "var(--ink)", resize: "none", minHeight: 60
              }}
            />
            <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
              <span className="row gap-2">
                <PixelBadge tone="green">▲ BULL</PixelBadge>
                <PixelBadge tone="red">▼ BEAR</PixelBadge>
                <PixelBadge>NEUTRAL</PixelBadge>
              </span>
              <button className="pxl-btn sm primary">POST</button>
            </div>
          </div>
        </div>
        {posts.length === 0 ? (
          <EmptyState
            icon="news"
            title={commentsMeta?.loading ? "LOADING" : "NO POSTS YET"}
            subtitle={commentsMeta?.loading
              ? "Fetching community feed…"
              : `Be the first to post about ${t.sym}.`}
          />
        ) : posts.map((p, i) => {
          const toneColor = p.tone === "bull" ? "green" : p.tone === "bear" ? "red" : "cyan";
          return (
            <div key={p.id || i} className="col gap-2" style={{ padding: 14, borderBottom: "1px solid var(--line-soft)" }}>
              <div className="row gap-2" style={{ alignItems: "center" }}>
                <div style={{
                  width: 24, height: 24, background: `var(--${toneColor}-dark)`,
                  border: `2px solid var(--${toneColor})`,
                  fontFamily: "Silkscreen", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center"
                }}>{(p.user || "").slice(0, 2).toUpperCase()}</div>
                <span className="font-display t-xs">@{p.user}</span>
                <PixelBadge tone={toneColor}>{p.tone.toUpperCase()}</PixelBadge>
                <span className="t-xs faint">{p.time}</span>
              </div>
              <div className="t-sm">{p.text}</div>
              <div className="row gap-3 t-xs faint">
                <span>♥ {p.likes}</span>
                <span>↩ REPLY</span>
                <span>⤴ SHARE</span>
              </div>
            </div>
          );
        })}
      </PixelPanel>
      </div>

      <PixelPanel
        title={liveCatalysts ? "CATALYSTS // EVENTS" : "UPCOMING EVENTS"}
        accent="amber"
        actions={liveCatalysts && <span className="font-display t-xs faint">{liveCatalysts.length} TRACKED</span>}
      >
        {events.map((e, i) => (
          <div key={i} className="row gap-3" style={{ padding: 12, borderBottom: "1px solid var(--line-soft)", alignItems: "center" }}>
            <div className="col" style={{ width: 52, alignItems: "center" }}>
              <span className="font-display t-xs faint">{e.date.split(" ")[0]}</span>
              <span className="font-mono t-lg amber" style={{ fontWeight: 700, lineHeight: 1 }}>{e.date.split(" ")[1]}</span>
            </div>
            <div className="col gap-1" style={{ flex: 1 }}>
              <span className="font-display t-xs">{e.label}</span>
              <PixelBadge tone={e.tone}>{e.tag}</PixelBadge>
            </div>
          </div>
        ))}
      </PixelPanel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AlertCreatePanel — inline form, POSTs /price-alerts
// ─────────────────────────────────────────────────────────────
function AlertCreatePanel({ t, onClose, onDone }) {
  const [type, setType] = useStateT("price_above");
  const [target, setTarget] = useStateT(String((t.price * 1.05).toFixed(2)));
  const [busy, setBusy] = useStateT(false);

  const submit = async () => {
    if (!API) return;
    const num = Number(target);
    if (!isFinite(num) || num <= 0) {
      onDone({ tone: "red", text: "Invalid target value" });
      return;
    }
    setBusy(true);
    const res = await API.alertCreate({
      symbol: t.sym,
      alert_type: type,
      target_value: num,
    }).catch((e) => ({ _err: e }));
    setBusy(false);
    if (res && !res._err) {
      onDone({ tone: "green", text: `Alert armed: ${t.sym} ${type.replace("_", " ")} ${num}` });
    } else {
      onDone({ tone: "red", text: "Alert create failed (auth?)" });
    }
  };

  return (
    <div className="pxl pxl-raised">
      <div className="pxl-head">
        <span><span className="dot amber"></span>NEW PRICE ALERT ▸ {t.sym}</span>
        <span className="font-display t-xs faint" style={{ cursor: "pointer" }} onClick={onClose}>✕</span>
      </div>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
        <div className="col gap-1">
          <span className="font-display t-xs faint">TYPE</span>
          <select value={type} onChange={e => setType(e.target.value)}
            style={{
              background: "var(--bg-0)", color: "var(--ink)",
              border: "2px solid var(--line)", padding: "8px 10px",
              fontFamily: "JetBrains Mono, monospace", fontSize: 12,
            }}>
            <option value="price_above">PRICE ABOVE</option>
            <option value="price_below">PRICE BELOW</option>
            <option value="percent_change_up">% CHANGE UP</option>
            <option value="percent_change_down">% CHANGE DOWN</option>
          </select>
        </div>
        <div className="col gap-1">
          <span className="font-display t-xs faint">TARGET</span>
          <input
            type="number"
            value={target}
            onChange={e => setTarget(e.target.value)}
            className="pxl-input"
            style={{ paddingLeft: 10 }}
            step="0.01"
          />
        </div>
        <button className="pxl-btn primary" onClick={submit} disabled={busy}>
          {busy ? "ARMING…" : "▸ ARM"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BuyPositionPanel — inline form, POSTs /portfolio/positions
// ─────────────────────────────────────────────────────────────
function BuyPositionPanel({ t, onClose, onDone }) {
  const [shares, setShares] = useStateT("10");
  const [price, setPrice] = useStateT(String((t.price || 0).toFixed(2)));
  const [date, setDate] = useStateT(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useStateT(false);

  const submit = async () => {
    if (!API) return;
    const n = Number(shares), p = Number(price);
    if (!isFinite(n) || n <= 0 || !isFinite(p) || p <= 0) {
      onDone({ tone: "red", text: "Invalid shares/price" });
      return;
    }
    setBusy(true);
    const res = await API.portfolioCreate({
      symbol: t.sym,
      shares: n,
      buy_price: p,
      buy_date: date,
    }).catch(() => null);
    setBusy(false);
    if (res && res.id) {
      onDone({ tone: "green", text: `Added ${n} ${t.sym} @ $${p.toFixed(2)}` });
    } else {
      onDone({ tone: "red", text: "Position add failed (auth?)" });
    }
  };

  return (
    <div className="pxl pxl-raised">
      <div className="pxl-head">
        <span><span className="dot green"></span>ADD POSITION ▸ {t.sym}</span>
        <span className="font-display t-xs faint" style={{ cursor: "pointer" }} onClick={onClose}>✕</span>
      </div>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
        <div className="col gap-1">
          <span className="font-display t-xs faint">SHARES</span>
          <input type="number" value={shares} onChange={e => setShares(e.target.value)}
            className="pxl-input" style={{ paddingLeft: 10 }} step="0.01" min="0.01" />
        </div>
        <div className="col gap-1">
          <span className="font-display t-xs faint">BUY PRICE</span>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)}
            className="pxl-input" style={{ paddingLeft: 10 }} step="0.01" min="0.01" />
        </div>
        <div className="col gap-1">
          <span className="font-display t-xs faint">DATE</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="pxl-input" style={{ paddingLeft: 10 }} />
        </div>
        <button className="pxl-btn primary" onClick={submit} disabled={busy}>
          {busy ? "SAVING…" : "▸ BUY"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ReportHistoryRow — single research entry + Share button
// ─────────────────────────────────────────────────────────────
function ReportHistoryRow({ r }) {
  const [shareBusy, setShareBusy] = useStateT(false);
  const [shareMsg, setShareMsg] = useStateT(null);

  const onShare = async (e) => {
    e.stopPropagation();
    if (!r.id || !API) return;
    setShareBusy(true);
    const res = await API.researchPublicLink(r.id).catch(() => null);
    setShareBusy(false);
    if (res && (res.signature || res.path)) {
      const sig = res.signature || (res.path || "").split("/").pop();
      const url = `${window.location.origin}/v2/?share=${encodeURIComponent(r.id + ":" + sig)}`;
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg({ tone: "green", text: "Share link copied to clipboard" });
      } catch (err) {
        setShareMsg({ tone: "amber", text: url });
      }
    } else {
      setShareMsg({ tone: "red", text: "Couldn't generate share link" });
    }
    setTimeout(() => setShareMsg(null), 3200);
  };

  return (
    <div className="col gap-1" style={{
      padding: "12px 14px",
      borderBottom: "1px solid var(--line-soft)",
      cursor: "pointer",
    }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="font-mono t-xs faint">{r.date}</span>
        <span className="row gap-2" style={{ alignItems: "center" }}>
          <VerdictPill verdict={r.verdict} />
          {r.id && (
            <button
              className="pxl-btn sm ghost"
              onClick={onShare}
              disabled={shareBusy}
              title="Copy public share link"
              style={{ padding: "2px 6px", color: "var(--violet)", boxShadow: "none" }}
            >
              {shareBusy ? "…" : "↗ SHARE"}
            </button>
          )}
        </span>
      </div>
      <div className="font-display t-xs">{r.model}</div>
      <div className="row gap-2 t-xs faint">
        <PixelBadge tone={r.quality === "DEEP" ? "amber" : "cyan"}>{r.quality}</PixelBadge>
        <span>{r.tokens}</span>
        <span>·</span>
        <span>@{r.by}</span>
      </div>
      {shareMsg && (
        <div className="t-xs mt-2" style={{
          color: `var(--${shareMsg.tone})`,
          wordBreak: "break-all",
          fontFamily: "JetBrains Mono, monospace",
        }}>
          ▸ {shareMsg.text}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// StockTwitsWidget — sentiment gauge + watchers trend (public)
// ─────────────────────────────────────────────────────────────
function StockTwitsWidget({ analysis, watchers, sym }) {
  if (!analysis) return null;
  const score = Number(analysis.sentiment_score ?? analysis.weighted_sentiment_score ?? 0);
  const pct = Math.max(0, Math.min(1, (score + 1) / 2)); // -1..1 → 0..1
  const tone = score > 0.2 ? "green" : score < -0.2 ? "red" : "amber";
  const posts = analysis.posts_analyzed ?? 0;
  const summary = String(analysis.summary || "").slice(0, 360);

  // Watchers trend: take last 30 data points
  const trend = Array.isArray(watchers)
    ? watchers.slice(-30).map(w => Number(w.count || 0))
    : null;
  const watcherMin = trend && trend.length > 0 ? Math.min(...trend) : 0;
  const watcherMax = trend && trend.length > 0 ? Math.max(...trend) : 0;
  const watcherDelta = trend && trend.length > 1
    ? trend[trend.length - 1] - trend[0]
    : 0;

  return (
    <PixelPanel
      title={`STOCKTWITS ▸ ${sym}`}
      accent={tone}
      actions={
        <span className="row gap-2" style={{ alignItems: "center" }}>
          <PixelBadge tone={tone}>
            {String(analysis.sentiment_label || "—").toUpperCase()}
          </PixelBadge>
          <span className="font-display t-xs faint">{posts} POSTS</span>
        </span>
      }
    >
      {/* Dense 3-column layout: gauge | summary | watchers — single ~110px row */}
      <div style={{
        padding: 12,
        display: "grid",
        gridTemplateColumns: "140px minmax(0, 1fr) 220px",
        gap: 14,
        alignItems: "center",
      }}>
        {/* Compact gauge with inline score */}
        <div className="col" style={{ alignItems: "center", gap: 2 }}>
          <svg className="pixel-svg" width="130" height="70" viewBox="0 0 160 90">
            <path d="M 14 80 A 70 70 0 0 1 146 80"
              fill="none" stroke="var(--bg-3)" strokeWidth="10" />
            <path d="M 14 80 A 70 70 0 0 1 46 20"
              fill="none" stroke="var(--red)" strokeWidth="10" strokeOpacity={pct < 0.33 ? 1 : 0.18} />
            <path d="M 46 20 A 70 70 0 0 1 114 20"
              fill="none" stroke="var(--amber)" strokeWidth="10" strokeOpacity={pct >= 0.33 && pct < 0.66 ? 1 : 0.18} />
            <path d="M 114 20 A 70 70 0 0 1 146 80"
              fill="none" stroke="var(--green)" strokeWidth="10" strokeOpacity={pct >= 0.66 ? 1 : 0.18} />
            {(() => {
              const angle = Math.PI - pct * Math.PI;
              const x2 = 80 + Math.cos(angle) * 60;
              const y2 = 80 - Math.sin(angle) * 60;
              return (
                <>
                  <line x1="80" y1="80" x2={x2} y2={y2} stroke={`var(--${tone})`} strokeWidth="3" />
                  <circle cx="80" cy="80" r="4" fill={`var(--${tone})`} />
                </>
              );
            })()}
          </svg>
          <span className="font-mono" style={{
            fontSize: 18, fontWeight: 700, color: `var(--${tone})`, lineHeight: 1, marginTop: -4,
          }}>
            {score >= 0 ? "+" : ""}{score.toFixed(2)}
          </span>
        </div>

        {/* Summary — dense, no extra padding */}
        <div className="t-xs" style={{
          lineHeight: 1.45,
          color: "var(--ink)",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 5,
          WebkitBoxOrient: "vertical",
        }}>
          {summary}{analysis.summary && analysis.summary.length > 360 ? "…" : ""}
        </div>

        {/* Watchers trend on right */}
        {trend && trend.length > 1 ? (
          <div className="col gap-1">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="font-display t-xs faint">WATCHERS</span>
              <span className={`font-mono t-xs ${watcherDelta >= 0 ? "green" : "red"}`} style={{ fontWeight: 700 }}>
                {watcherDelta >= 0 ? "+" : ""}{watcherDelta.toLocaleString()}
              </span>
            </div>
            <Sparkline data={trend} width={210} height={32}
              color={watcherDelta >= 0 ? "var(--green)" : "var(--red)"} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="font-mono t-xs faint">{watcherMin.toLocaleString()}</span>
              <span className="font-mono t-xs amber" style={{ fontWeight: 700 }}>
                {trend[trend.length - 1].toLocaleString()}
              </span>
              <span className="font-mono t-xs faint">{watcherMax.toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <div className="font-display t-xs faint" style={{ textAlign: "center" }}>NO WATCHERS DATA</div>
        )}
      </div>
    </PixelPanel>
  );
}

// ─────────────────────────────────────────────────────────────
// RunResearchPanel — inline form, POST /research/ask + poll
// ─────────────────────────────────────────────────────────────
function RunResearchPanel({ t, onClose, onDone }) {
  const [provider, setProvider] = useStateT("gemini");
  const [quality, setQuality]   = useStateT("medium");
  const [question, setQuestion] = useStateT(
    `Analyze the risk/reward profile for ${t.sym}. What are the key catalysts and downside vectors over the next 12 months?`
  );
  const [busy, setBusy]   = useStateT(false);
  const [phase, setPhase] = useStateT(null); // null | "submitting" | "polling" | "done"
  const [ticket, setTicket] = useStateT(null);
  const [progress, setProgress] = useStateT(0);

  const submit = async () => {
    if (!API) return;
    setBusy(true); setPhase("submitting"); setProgress(2);
    const res = await API.researchAsk({
      tickers: [t.sym],
      question,
      provider,
      quality,
    }).catch((e) => ({ _err: e }));

    if (!res || res._err || !res.id) {
      onDone({ tone: "red", text: res?._err?.body?.message
        ? `Research failed: ${res._err.body.message}`
        : "Research failed (insufficient credits or auth?)" });
      setBusy(false);
      return;
    }
    setTicket(res); setPhase("polling"); setProgress(10);
    pollUntilDone(res.id);
  };

  const pollUntilDone = async (id) => {
    let attempt = 0;
    const tick = async () => {
      attempt++;
      const r = await API.researchGet(id).catch(() => null);
      if (!r) return setTimeout(tick, 3000);
      setProgress(Math.min(95, 10 + attempt * 4));
      if (r.status === "completed") {
        setPhase("done"); setProgress(100); setBusy(false);
        onDone({ tone: "green", text: `Research complete for ${t.sym} — see AI RESEARCH tab.` });
      } else if (r.status === "failed") {
        setPhase("done"); setBusy(false);
        onDone({ tone: "red", text: `Research failed: ${r.error || "unknown"}` });
      } else {
        setTimeout(tick, 3000);
      }
    };
    setTimeout(tick, 1500);
  };

  return (
    <div className="pxl pxl-raised">
      <div className="pxl-head">
        <span><span className="dot violet"></span>RUN AI RESEARCH ▸ {t.sym}</span>
        <span className="font-display t-xs faint" style={{ cursor: "pointer" }} onClick={onClose}>✕</span>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>

        <div className="col gap-1">
          <span className="font-display t-xs faint">QUESTION</span>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            disabled={busy}
            style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: 12,
              background: "var(--bg-0)", color: "var(--ink)",
              border: "2px solid var(--line)", padding: "8px 10px",
              minHeight: 70, resize: "vertical",
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="col gap-1">
            <span className="font-display t-xs faint">PROVIDER</span>
            <div className="row gap-1">
              {["gemini", "openai", "ensemble"].map(p => (
                <button key={p}
                  className="pxl-btn sm"
                  onClick={() => setProvider(p)}
                  disabled={busy}
                  style={{
                    flex: 1,
                    color: provider === p ? "var(--amber)" : "var(--ink-dim)",
                    borderColor: provider === p ? "var(--amber)" : "var(--line)",
                    background: provider === p ? "rgba(255,194,60,0.08)" : "var(--bg-2)",
                  }}>
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="col gap-1">
            <span className="font-display t-xs faint">QUALITY</span>
            <div className="row gap-1">
              {["low", "medium", "high", "deep"].map(q => (
                <button key={q}
                  className="pxl-btn sm"
                  onClick={() => setQuality(q)}
                  disabled={busy}
                  style={{
                    flex: 1,
                    color: quality === q ? "var(--cyan)" : "var(--ink-dim)",
                    borderColor: quality === q ? "var(--cyan)" : "var(--line)",
                    background: quality === q ? "rgba(88,211,255,0.08)" : "var(--bg-2)",
                  }}>
                  {q.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {phase === "polling" && (
          <div className="col gap-2">
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <Spinner label="ANALYZING" />
              <span className="font-mono t-xs faint" style={{ marginLeft: "auto" }}>
                TICKET {ticket?.id?.slice(0, 8)}…
              </span>
            </div>
            <div style={{ height: 8, background: "var(--bg-0)", border: "2px solid var(--line)", position: "relative" }}>
              <div style={{
                width: `${progress}%`, height: "100%",
                background: "linear-gradient(90deg, var(--violet), var(--amber))",
                transition: "width 0.4s steps(20)",
              }} />
            </div>
            <div className="font-mono t-xs faint">
              Deep mode can take 60-180s. You can close this and check the AI RESEARCH tab later.
            </div>
          </div>
        )}

        {!busy && (
          <div className="row gap-2" style={{ marginTop: 4 }}>
            <div style={{ flex: 1 }} />
            <button className="pxl-btn" onClick={onClose}>CANCEL</button>
            <button className="pxl-btn primary" onClick={submit} disabled={!question.trim()}>
              ▸ RUN  ({provider.toUpperCase()} / {quality.toUpperCase()})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


export { TickerDetail };
export { ResearchTab };
export { FinancialsTab };
export { SocialTab };
export { AlertCreatePanel };
export { BuyPositionPanel };
export { ReportHistoryRow };
export { StockTwitsWidget };
export { RunResearchPanel };


// Top-level App shell — converted from app.jsx.
// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
} from './components/pixel.tsx';
import {
  Skel,
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
} from './components/Skeletons.tsx';
import { BootSequence, StatusBar } from './components/Chrome.tsx';
import { API } from './lib/api.ts';
import { MOCK } from './lib/data.ts';
import { useApi, useMutation, useIsFetching, invalidateQueries } from './lib/hooks.ts';
import {
  useLiveTickers,
  useTickersWithFallback,
  useTickerHistory,
  useTickerNews,
  useTickerComposite,
} from './lib/tickers.ts';
import {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRow,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakSelect,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton,
} from './features/TweaksPanel.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Analyzer } from './pages/Analyzer.tsx';
import { TickerDetail } from './pages/TickerDetail.tsx';
import { Workspace } from './pages/Workspace.tsx';
import { ComparePage } from './pages/Compare.tsx';
import { PortfolioPage } from './pages/Portfolio.tsx';
import { ResearchPage } from './pages/Research.tsx';
import { WatchlistPage } from './pages/Watchlist.tsx';
import { AlertsPage } from './pages/Alerts.tsx';
import { NewsPage } from './pages/News.tsx';
import { ProfilePage } from './pages/Profile.tsx';
import { AdminPage } from './pages/Admin.tsx';
import { PublicReportPage } from './pages/PublicReport.tsx';
import { AboutPage } from './pages/About.tsx';
import { TermsPage } from './pages/Terms.tsx';
import { PrivacyPage } from './pages/Privacy.tsx';
import { CommandPalette, useGlobalShortcuts } from './features/CommandPalette.tsx';
import { ChatOverlay } from './features/ChatOverlay.tsx';
import { HelpDialog } from './features/HelpDialog.tsx';
import { ToastBus } from './features/ToastBus.tsx';


// Tweaks defaults — JSON between markers so host can persist
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "neural",
  "scanlines": 1,
  "crtVignette": true,
  "chromatic": true,
  "pixelScale": 1,
  "tickerTape": true,
  "glow": true,
  "statusBar": true,
  "showLoading": false
}/*EDITMODE-END*/;

const PALETTES = {
  phosphor: {
    "--bg-0": "#07090f", "--bg-1": "#0c1220", "--bg-2": "#131c30", "--bg-3": "#1a2540",
    "--bg-row": "#0f1626", "--line": "#233052", "--line-soft": "#1a2440",
    "--ink": "#d6dff0", "--ink-dim": "#8693ad", "--ink-faint": "#4d5a78",
    "--green": "#5ce8a0", "--green-dark": "#1b6b41",
    "--red": "#ff5577", "--red-dark": "#7a1d33",
    "--amber": "#ffc23c", "--amber-dark": "#7a5a10",
    "--cyan": "#58d3ff", "--cyan-dark": "#155e7a",
    "--violet": "#b67bff"
  },
  amber: {
    /* Refined sepia CRT — warmer, less yellow */
    "--bg-0": "#0c0805", "--bg-1": "#181208", "--bg-2": "#22190d", "--bg-3": "#2e2210",
    "--bg-row": "#140e07", "--line": "#3e2f18", "--line-soft": "#241a0c",
    "--ink": "#f8e5b0", "--ink-dim": "#a68c5e", "--ink-faint": "#5a4828",
    "--green": "#b4e85c", "--green-dark": "#4a6b1b",
    "--red": "#ff8a5c", "--red-dark": "#7a2d1d",
    "--amber": "#f5b740", "--amber-dark": "#7a5400",
    "--cyan": "#ffd87a", "--cyan-dark": "#7a6028",
    "--violet": "#ff9558"
  },
  neural: {
    /* MEGA DARK — pure-black base, panels barely lifted, accents pop hard. */
    "--bg-0": "#000000", "--bg-1": "#070709", "--bg-2": "#0d0d11", "--bg-3": "#16161c",
    "--bg-row": "#040406", "--line": "#1a1a22", "--line-soft": "#0f0f14",
    "--ink": "#fafafa", "--ink-dim": "#8a8a93", "--ink-faint": "#4a4a52",
    "--green": "#10b981", "--green-dark": "#064e3b",
    "--red": "#f43f5e", "--red-dark": "#7f1d1d",
    "--amber": "#f59e0b", "--amber-dark": "#78350f",
    "--cyan": "#3b82f6", "--cyan-dark": "#1e3a8a",
    "--violet": "#a855f7"
  },
  rgb: {
    /* Gaming RGB — same dark base as Neural, but borders go rainbow.
       The rainbow effect is in CSS body[data-palette="rgb"] selectors. */
    "--bg-0": "#050507", "--bg-1": "#0e0e12", "--bg-2": "#18181f", "--bg-3": "#252530",
    "--bg-row": "#0a0a0e", "--line": "#2a2a36", "--line-soft": "#1a1a22",
    "--ink": "#fafafa", "--ink-dim": "#a1a1aa", "--ink-faint": "#52525b",
    "--green": "#00ff88", "--green-dark": "#0a6b48",
    "--red": "#ff0066", "--red-dark": "#7a1d32",
    "--amber": "#ffaa00", "--amber-dark": "#7c5a0a",
    "--cyan": "#00ddff", "--cyan-dark": "#0c4a6e",
    "--violet": "#bb44ff"
  },
  cyber: {
    "--bg-0": "#04060a", "--bg-1": "#080d18", "--bg-2": "#0e1626", "--bg-3": "#152040",
    "--bg-row": "#0a1020", "--line": "#2a1f5e", "--line-soft": "#1a1442",
    "--ink": "#e0d8ff", "--ink-dim": "#8278c0", "--ink-faint": "#4a3e88",
    "--green": "#3effc8", "--green-dark": "#0a6b50",
    "--red": "#ff3da8", "--red-dark": "#7a1855",
    "--amber": "#ffe43d", "--amber-dark": "#7a6a10",
    "--cyan": "#7adbff", "--cyan-dark": "#155e7a",
    "--violet": "#c855ff"
  },
  matrix: {
    "--bg-0": "#020604", "--bg-1": "#061108", "--bg-2": "#0a1c10", "--bg-3": "#0e2a18",
    "--bg-row": "#08160c", "--line": "#1c4028", "--line-soft": "#102a18",
    "--ink": "#c8f0d0", "--ink-dim": "#5e9070", "--ink-faint": "#2e5a3c",
    "--green": "#5cff8a", "--green-dark": "#1b6b34",
    "--red": "#ff8855", "--red-dark": "#7a3a1d",
    "--amber": "#d4ff5c", "--amber-dark": "#5a7a14",
    "--cyan": "#5cffd4", "--cyan-dark": "#1b6b58",
    "--violet": "#a8ff5c"
  },
  paper: {
    /* Warm light terminal — receipt-printer / old Mac vibe */
    "--bg-0": "#ece6d4", "--bg-1": "#f6f1e1", "--bg-2": "#e6dfca", "--bg-3": "#d9d0b4",
    "--bg-row": "#efe9d6", "--line": "#a89a72", "--line-soft": "#cdc09c",
    "--ink": "#1a1812", "--ink-dim": "#5a523c", "--ink-faint": "#8a805e",
    "--green": "#176a3a", "--green-dark": "#a8d4b8",
    "--red": "#a81d34", "--red-dark": "#e8b8c0",
    "--amber": "#9a6800", "--amber-dark": "#e8c878",
    "--cyan": "#0c5a82", "--cyan-dark": "#a8c8dc",
    "--violet": "#5a2ab8"
  },
  graphite: {
    /* Cool neutral gray — concrete / iPad-os dark gray */
    "--bg-0": "#1c1c1e", "--bg-1": "#28282b", "--bg-2": "#33333a", "--bg-3": "#42424a",
    "--bg-row": "#222226", "--line": "#525258", "--line-soft": "#3a3a40",
    "--ink": "#f0f0f2", "--ink-dim": "#a8a8ae", "--ink-faint": "#6a6a72",
    "--green": "#5ce8a0", "--green-dark": "#1b6b41",
    "--red": "#ff5577", "--red-dark": "#7a1d33",
    "--amber": "#ffc23c", "--amber-dark": "#7a5a10",
    "--cyan": "#58d3ff", "--cyan-dark": "#155e7a",
    "--violet": "#b67bff"
  }
};

function applyPalette(name) {
  const p = PALETTES[name] || PALETTES.phosphor;
  const root = document.documentElement;
  Object.entries(p).forEach(([k, v]) => root.style.setProperty(k, v));
  // Tag body so light-mode-specific tweaks can kick in via CSS
  document.body.setAttribute("data-palette", name);
  document.body.setAttribute("data-light", name === "paper" ? "1" : "0");
}

// ─────────────────────────────────────────────────────────────
// SyncingDot — tiny pulsing indicator that lights up while any
// background refetch is inflight. With persisted cache, the user
// sees data immediately on reload — this dot shows that data is
// being validated against the backend in the background.
// ─────────────────────────────────────────────────────────────
function SyncingDot() {
  const fetching = useIsFetching ? useIsFetching() : 0;
  const active = fetching > 0;
  return (
    <span
      title={active ? `SYNCING ${fetching} ${fetching === 1 ? "QUERY" : "QUERIES"}` : "ALL SYNCED"}
      style={{
        width: 8, height: 8,
        background: active ? "var(--cyan)" : "var(--green-dark, var(--green))",
        opacity: active ? 1 : 0.35,
        boxShadow: active ? "0 0 6px var(--cyan)" : "none",
        animation: active ? "phosphor 1.2s ease-in-out infinite" : "none",
        transition: "opacity 240ms ease, background 240ms ease",
        flexShrink: 0,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// NotificationsBell — header bell that opens a dropdown of
// recent triggered price alerts + recently completed research.
// ─────────────────────────────────────────────────────────────
function NotificationsBell({ signedIn, onNav }) {
  const [open, setOpen] = useState(false);
  const [readKey, setReadKey] = useState(() => {
    try { return Number(localStorage.getItem("v2_notif_read_until")) || 0; }
    catch (e) { return 0; }
  });

  const [alerts] = useApi
    ? useApi(() => (signedIn ? API.alerts() : Promise.resolve([])), [signedIn], { poll: 60000, staleTime: 30000 })
    : [null];
  const [completed] = useApi
    ? useApi(() => (signedIn ? API.researchList({ status: "completed", limit: 5 }) : Promise.resolve(null)), [signedIn], { staleTime: 60000 })
    : [null];

  // Build unified list
  const items = [];
  if (Array.isArray(alerts)) {
    for (const a of alerts) {
      if (!a.triggered_at) continue;
      items.push({
        id: `alert-${a.id}`,
        kind: "alert",
        ts: a.triggered_at,
        title: `${a.symbol} ${String(a.alert_type || "").replace("_", " ").toUpperCase()} ${a.target_value}`,
        sym: a.symbol,
      });
    }
  }
  if (completed && Array.isArray(completed.data)) {
    for (const r of completed.data) {
      items.push({
        id: `research-${r.id}`,
        kind: "research",
        ts: r.created_at,
        title: r.title || (Array.isArray(r.tickers) ? `Research ready: ${r.tickers.join(", ")}` : "Research ready"),
        sym: Array.isArray(r.tickers) ? r.tickers[0] : null,
        researchId: r.id,
      });
    }
  }
  items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const unread = items.filter(i => new Date(i.ts).getTime() > readKey).length;

  const markAllRead = () => {
    const now = Date.now();
    setReadKey(now);
    try { localStorage.setItem("v2_notif_read_until", String(now)); } catch (e) {}
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const el = document.getElementById("v2-notif-dropdown");
      if (el && !el.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  const formatTs = (iso) => {
    if (!iso) return "—";
    const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${Math.floor(diff)}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  return (
    <div className="row gap-2" style={{ alignItems: "center", position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        title="Notifications"
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          padding: 4,
          cursor: "pointer",
        }}
      >
        <PixelIcon name="bell" color="var(--amber)" size={16} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -2, right: -4,
            background: "var(--red)", color: "#fff",
            fontFamily: "Silkscreen", fontSize: 8,
            padding: "1px 3px", letterSpacing: 0,
            pointerEvents: "none",
          }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div
          id="v2-notif-dropdown"
          className="pxl pxl-raised"
          style={{
            position: "absolute",
            top: 36,
            right: -10,
            width: 340,
            maxHeight: 460,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-1)",
            zIndex: 120,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pxl-head" style={{ flexShrink: 0 }}>
            <span><span className="dot amber"></span>NOTIFICATIONS</span>
            <span className="row gap-2" style={{ alignItems: "center" }}>
              <span className="font-display t-xs faint">{items.length} TOTAL</span>
              {items.length > 0 && (
                <button className="pxl-btn sm ghost" onClick={markAllRead} style={{ padding: "2px 6px" }}>
                  MARK READ
                </button>
              )}
            </span>
          </div>
          <div style={{ overflowY: "auto" }}>
            {!signedIn ? (
              <div style={{ padding: 20, textAlign: "center" }}>
                <span className="font-display t-xs faint">SIGN IN TO RECEIVE ALERTS</span>
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center" }}>
                <PixelIcon name="bell" color="var(--ink-faint)" size={20} />
                <div className="font-display t-xs faint mt-2">ALL CAUGHT UP</div>
                <div className="t-xs faint mt-2">Triggered alerts and completed research will land here.</div>
              </div>
            ) : (
              items.slice(0, 12).map(it => {
                const isUnread = new Date(it.ts).getTime() > readKey;
                const onClick = () => {
                  setOpen(false);
                  if (it.kind === "research" && it.sym) {
                    onNav("ticker", { sym: it.sym, name: it.sym, sector: "—", price: 0, change: 0, ai: "HOLD", risk: 5, upside: 0, mc: "—", pe: null, seed: it.sym.charCodeAt(0), spark: [0, 0], candles: [], _live: true });
                  } else if (it.kind === "alert") {
                    onNav("alerts");
                  }
                };
                return (
                  <div
                    key={it.id}
                    onClick={onClick}
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--line-soft)",
                      cursor: "pointer",
                      background: isUnread ? "rgba(255,194,60,0.06)" : "transparent",
                      borderLeft: isUnread ? "3px solid var(--amber)" : "3px solid transparent",
                    }}
                  >
                    <div className="row gap-2" style={{ alignItems: "center" }}>
                      <PixelIcon
                        name={it.kind === "alert" ? "bell" : "brain"}
                        color={it.kind === "alert" ? "var(--amber)" : "var(--violet)"}
                        size={10}
                      />
                      <span className="font-display t-xs" style={{ color: it.kind === "alert" ? "var(--amber)" : "var(--violet)" }}>
                        {it.kind === "alert" ? "TRIGGERED" : "RESEARCH"}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span className="font-mono t-xs faint">{formatTs(it.ts)} ago</span>
                    </div>
                    <div className="t-sm mt-2" style={{ lineHeight: 1.4 }}>{it.title}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ route, onNav, query, setQuery }) {
  const [now, setNow] = useState(new Date());
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const bp = useBreakpoint();

  // Real user from /auth/profile; null when unauth.
  const [profile, profileMeta] = useApi
    ? useApi(() => API.profile(), [])
    : [null, {}];
  const signedIn = !!profile;

  // Display name + rank
  const userName = profile?.name
    ? profile.name.toUpperCase().replace(/\s+/g, "_").slice(0, 14)
    : (profile?.email ? profile.email.split("@")[0].toUpperCase().slice(0, 14) : "GUEST");
  const userRank = profile?.role === "admin" ? "ADMIN"
    : profile?.tier === "pro" ? "PRO"
    : profile?.tier === "premium" ? "DIAMOND"
    : profile ? "PRO" : "WHALE";

  // Live ticker search (debounced) against /tickers?search=
  useEffect(() => {
    if (!query || query.length < 1) { setSearchResults(null); return; }
    let abort = false;
    const t = setTimeout(() => {
      if (API && signedIn) {
        API.tickers(query).then((rows) => {
          if (abort) return;
          if (Array.isArray(rows) && rows.length > 0) {
            setSearchResults(rows.slice(0, 8).map(r => ({
              sym: r.symbol,
              name: r.name,
              sector: r.sector || r.industry || r.finnhub_industry || "—",
              price: 0,
              change: 0,
              ai: "HOLD", risk: 5, upside: 0, mc: "—", pe: null,
              seed: (r.symbol || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0),
              logo: r.logo_url,
              spark: [0, 0],
              candles: [],
              _live: true,
            })));
          } else {
            setSearchResults([]); // empty — show "no matches"
          }
        }).catch(() => setSearchResults(null));
      } else {
        setSearchResults(null);
      }
    }, 200);
    return () => { abort = true; clearTimeout(t); };
  }, [query, signedIn]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const tabs = [
    ["dashboard", "DASH"],
    ["workspace", "WORKSPACE"],
    ["analyzer", "ANALYZER"],
    ["watchlist", "WATCHLIST"],
    ["research", "RESEARCH"],
    ["portfolio", "PORTFOLIO"],
    ["alerts", "ALERTS"],
    ["news", "NEWS"]
  ];

  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // MOBILE HEADER
  if (bp.mobile) {
    return (
      <header style={{
        background: "var(--bg-1)",
        borderBottom: "2px solid var(--line)",
        padding: "0 12px",
        position: "sticky",
        top: 0,
        zIndex: 50
      }}>
        <div className="row" style={{ alignItems: "center", gap: 10, height: 52 }}>
          <div className="row gap-2" style={{ alignItems: "center", cursor: "pointer", flex: 1, minWidth: 0 }} onClick={() => onNav("dashboard")}>
            <div style={{
              width: 28, height: 28,
              background: "var(--amber)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 0 2px var(--amber-dark), inset 0 -3px 0 0 rgba(0,0,0,0.25)",
              flexShrink: 0
            }}>
              <span style={{ fontFamily: "Silkscreen, monospace", fontSize: 16, color: "#1a1200", fontWeight: 700 }}>N</span>
            </div>
            <div className="col" style={{ lineHeight: 1.1, minWidth: 0 }}>
              <span style={{ fontFamily: "Silkscreen, monospace", fontSize: 12, letterSpacing: "0.04em" }}>
                NEURAL<span className="amber">//</span>TICKER
              </span>
              <span className="font-mono t-xs green" style={{ fontWeight: 700 }}>● {time}</span>
            </div>
          </div>

          <button className="pxl-btn sm ghost"
            onClick={() => setMobileSearchOpen(o => !o)}
            style={{ padding: 8, minWidth: 36, justifyContent: "center" }}
          >
            <PixelIcon name="search" color="var(--ink)" size={14} />
          </button>

          <SyncingDot />
          <NotificationsBell signedIn={signedIn} onNav={onNav} />

          <SpriteMascot seed={777} size={28} colors={["transparent", "var(--cyan)", "var(--cyan-dark)", "var(--amber)"]} />
        </div>

        {/* Mobile expanding search */}
        {mobileSearchOpen && (
          <div style={{ padding: "0 0 10px", position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: 10 }}>
              <PixelIcon name="search" color="var(--ink-faint)" size={14} />
            </span>
            <input
              type="text"
              placeholder="> search ticker..."
              className="pxl-input"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && query) {
                  const t = (searchResults && searchResults[0]) ||
                            MOCK.tickers.find(x => x.sym.toLowerCase() === query.toLowerCase());
                  if (t) { onNav("ticker", t); setQuery(""); setMobileSearchOpen(false); }
                }
              }}
            />
            {query && (
              <div className="pxl pxl-raised" style={{ marginTop: 8 }}>
                {(searchResults || MOCK.tickers
                  .filter(t => t.sym.toLowerCase().includes(query.toLowerCase()) || t.name.toLowerCase().includes(query.toLowerCase()))
                  .slice(0, 6)
                ).map(t => (
                    <div key={t.sym}
                      onClick={() => { onNav("ticker", t); setQuery(""); setMobileSearchOpen(false); }}
                      className="row gap-2"
                      style={{ padding: 10, alignItems: "center", borderBottom: "1px solid var(--line-soft)", cursor: "pointer" }}
                    >
                      <span className="font-display t-sm" style={{ width: 56 }}>{t.sym}</span>
                      <span className="t-xs faint" style={{ flex: 1 }}>{t.name}</span>
                      <PriceDelta pct={t.change} />
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </header>
    );
  }

  // DESKTOP / TABLET HEADER — two-row layout for breathing room
  return (
    <header style={{
      background: "var(--bg-1)",
      borderBottom: "2px solid var(--line)",
      padding: "0 20px",
      position: "sticky",
      top: 0,
      zIndex: 50
    }}>
      {/* ROW 1: logo + search + user cluster */}
      <div className="row" style={{ alignItems: "center", gap: 16, height: 52 }}>
        {/* Logo */}
        <div className="row gap-2" style={{ alignItems: "center", cursor: "pointer" }} onClick={() => onNav("dashboard")}>
          <div style={{
            width: 28, height: 28,
            background: "var(--amber)",
            position: "relative",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 0 2px var(--amber-dark), inset 0 -3px 0 0 rgba(0,0,0,0.25)"
          }}>
            <span style={{
              fontFamily: "Silkscreen, monospace", fontSize: 16,
              color: "#1a1200", fontWeight: 700
            }}>N</span>
          </div>
          <div className="col" style={{ lineHeight: 1.1 }}>
            <span style={{ fontFamily: "Silkscreen, monospace", fontSize: 14, letterSpacing: "0.04em" }}>
              NEURAL<span className="amber">//</span>TICKER
            </span>
            <span className="font-display t-xs faint">v3.4 • TERMINAL EDITION</span>
          </div>
        </div>

        {/* Search — takes the centre flex space on row 1; dropdown lives inside for clean anchoring */}
        <div style={{ flex: 1, position: "relative", maxWidth: 520, marginLeft: 16 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", zIndex: 1 }}>
            <PixelIcon name="search" color="var(--ink-faint)" size={16} />
          </span>
          <input
            type="text"
            placeholder="> search ticker..."
            className="pxl-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && query) {
                const t = (searchResults && searchResults[0]) ||
                          MOCK.tickers.find(x => x.sym.toLowerCase() === query.toLowerCase());
                if (t) { onNav("ticker", t); setQuery(""); }
              }
            }}
          />
          {query && (
            <div className="pxl pxl-raised" style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 100,
            }}>
              {((searchResults && searchResults.length > 0)
                  ? searchResults
                  : (searchResults?.length === 0
                      ? []
                      : MOCK.tickers
                          .filter(t => t.sym.toLowerCase().includes(query.toLowerCase()) || t.name.toLowerCase().includes(query.toLowerCase()))
                          .slice(0, 6))
              ).map(t => (
                <div
                  key={t.sym}
                  onClick={() => { onNav("ticker", t); setQuery(""); }}
                  className="row gap-2"
                  style={{
                    padding: 10, alignItems: "center",
                    borderBottom: "1px solid var(--line-soft)", cursor: "pointer"
                  }}
                >
                  <span className="font-display t-sm" style={{ width: 60 }}>{t.sym}</span>
                  <span className="t-xs faint" style={{ flex: 1 }}>{t.name}</span>
                  {t.price > 0 && <span className="font-mono t-xs">${t.price.toFixed(2)}</span>}
                  {t.change !== 0 && <PriceDelta pct={t.change} />}
                </div>
              ))}
              {searchResults?.length === 0 && (
                <div className="font-display t-xs faint" style={{ padding: 14, textAlign: "center" }}>
                  NO MATCHES IN /TICKERS
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status cluster — market status moved to bottom status bar to free up header room */}
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <SyncingDot />
          <NotificationsBell signedIn={signedIn} onNav={onNav} />
          <div style={{ width: 1, height: 32, background: "var(--line)" }} />

          {signedIn ? (
            <div className="row gap-2" style={{ alignItems: "center", position: "relative" }}>
              <SpriteMascot seed={(profile.id || "777").split("").reduce((a, c) => a + c.charCodeAt(0), 0) || 777}
                size={32}
                colors={["transparent", "var(--cyan)", "var(--cyan-dark)", "var(--amber)"]} />
              <div
                className="col"
                style={{ lineHeight: 1.1, cursor: "pointer", userSelect: "none" }}
                onClick={() => setUserMenuOpen(o => !o)}
              >
                <span className="font-display t-xs">{userName}</span>
                <RankBadge rank={userRank} />
              </div>
              {userMenuOpen && (
                <div className="pxl pxl-raised" style={{
                  position: "absolute", top: 40, right: 0,
                  minWidth: 200, padding: 6, zIndex: 100,
                }}>
                  <div className="t-xs faint" style={{ padding: "4px 8px" }}>{profile?.email}</div>
                  <button className="pxl-btn sm" style={{ width: "100%", marginTop: 4, justifyContent: "flex-start" }}
                    onClick={() => { setUserMenuOpen(false); onNav("profile"); }}>
                    <PixelIcon name="shield" size={8} color="currentColor" /> PROFILE & CREDITS
                  </button>
                  {profile?.role === "admin" && (
                    <button className="pxl-btn sm" style={{ width: "100%", marginTop: 4, justifyContent: "flex-start", color: "var(--red)" }}
                      onClick={() => { setUserMenuOpen(false); onNav("admin"); }}>
                      <PixelIcon name="bolt" size={8} color="currentColor" /> ADMIN CONSOLE
                    </button>
                  )}
                  <button className="pxl-btn sm" style={{ width: "100%", marginTop: 4, justifyContent: "flex-start" }}
                    onClick={() => {
                      API.logout()
                        .then(() => window.location.reload());
                    }}>
                    <PixelIcon name="bolt" size={8} color="currentColor" /> LOG OUT
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className="pxl-btn sm primary"
              onClick={() => setLoginOpen(true)}
              disabled={profileMeta?.loading}
            >
              <PixelIcon name="shield" size={8} color="currentColor" />
              {profileMeta?.loading ? "…" : "SIGN IN"}
            </button>
          )}
        </div>
      </div>

      {/* ROW 2: nav tabs — full-width strip with proper breathing room */}
      <nav className="row" style={{
        gap: 4,
        borderTop: "2px solid var(--line-soft)",
        padding: "4px 0 6px",
        overflowX: "auto",
        whiteSpace: "nowrap",
      }}>
        {tabs.map(([k, lbl]) => (
          <button
            key={k}
            onClick={() => onNav(k)}
            className="pxl-btn sm ghost"
            style={{
              color: route === k ? "var(--amber)" : "var(--ink-dim)",
              borderColor: route === k ? "var(--amber)" : "transparent",
              borderBottomColor: route === k ? "var(--amber)" : "var(--line)",
              background: route === k ? "rgba(255,194,60,0.08)" : "transparent",
              boxShadow: "none",
              borderRadius: 0,
              padding: "6px 14px",
              flexShrink: 0,
            }}
          >
            {lbl}
          </button>
        ))}
      </nav>

      {/* Login modal */}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </header>
  );
}

// -----------------------------------------------------------
// LoginModal — Google OAuth + Dev token shortcut
// -----------------------------------------------------------
function LoginModal({ onClose }) {
  const [devEmail, setDevEmail] = useState("dev@test.com");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const runDevLogin = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await API.devLogin(devEmail);
      if (res && res.access_token) {
        window.location.reload();
      } else {
        setErr("Dev login refused. Make sure NODE_ENV is not production.");
      }
    } catch (e) {
      setErr("Network error: " + (e.message || "unknown"));
    }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()}
        className="pxl pxl-raised"
        style={{ width: "min(420px, 92vw)", background: "var(--bg-1)" }}>
        <div className="pxl-head">
          <span><span className="dot amber"></span>SIGN IN TO NEURAL//TICKER</span>
          <span className="font-display t-xs faint" style={{ cursor: "pointer" }} onClick={onClose}>✕ CLOSE</span>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="t-sm dim" style={{ lineHeight: 1.5 }}>
            Sign in to load your real portfolio, watchlists, alerts and AI research.
            Without auth the v2 dashboard falls back to mock seed data.
          </p>

          <a href="/api/auth/google" className="pxl-btn primary" style={{
            textDecoration: "none", justifyContent: "center", padding: "10px 12px",
          }}>
            <PixelIcon name="bolt" size={10} color="currentColor" />
            CONTINUE WITH GOOGLE
          </a>

          <details style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>
            <summary className="t-xs faint" style={{ cursor: "pointer", letterSpacing: "0.04em" }}>
              ▸ OAUTH 404? — REDIRECT URI MUST BE WHITELISTED
            </summary>
            <div className="pxl-inset mt-2" style={{ padding: 10, fontSize: 11, lineHeight: 1.5 }}>
              <div className="dim">Add this exact URL to your Google Cloud Console → APIs &amp; Services → Credentials → OAuth client → <span className="amber">Authorized redirect URIs</span>:</div>
              <code style={{
                display: "block", marginTop: 6, padding: "6px 8px",
                background: "var(--bg-0)", color: "var(--green)",
                border: "2px solid var(--line)", wordBreak: "break-all",
              }}>{typeof window !== "undefined" ? window.location.origin : ""}/api/auth/google/callback</code>
              <div className="dim mt-2">Or use Dev Login below — no OAuth roundtrip required.</div>
            </div>
          </details>

          <div className="pxl-rule" />

          <span className="font-display t-xs faint">DEV LOGIN (non-prod backends only)</span>
          <input
            type="email"
            className="pxl-input"
            placeholder="dev@test.com"
            value={devEmail}
            onChange={e => setDevEmail(e.target.value)}
          />
          <button className="pxl-btn" onClick={runDevLogin} disabled={busy || !devEmail}>
            {busy ? "SIGNING IN…" : "▸ DEV LOGIN"}
          </button>
          {err && <span className="t-xs red">{err}</span>}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// BottomTabBar — mobile-only nav at the screen bottom
// -----------------------------------------------------------
function BottomTabBar({ route, onNav }) {
  const tabs = [
    ["dashboard", "DASH",     "chart"],
    ["analyzer",  "ANALYZER", "search"],
    ["research",  "RESEARCH", "brain"],
    ["portfolio", "WALLET",   "wallet"],
    ["news",      "NEWS",     "news"],
  ];
  return (
    <nav style={{
      position: "fixed",
      bottom: 0, left: 0, right: 0,
      height: 56,
      background: "var(--bg-1)",
      borderTop: "2px solid var(--line)",
      display: "flex",
      zIndex: 41,
      paddingBottom: "env(safe-area-inset-bottom)"
    }}>
      {tabs.map(([k, lbl, icon]) => {
        const active = route === k || (route === "ticker" && k === "analyzer");
        return (
          <button
            key={k}
            onClick={() => onNav(k)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              background: "transparent",
              border: "none",
              borderTop: active ? "2px solid var(--amber)" : "2px solid transparent",
              marginTop: -2,
              color: active ? "var(--amber)" : "var(--ink-dim)",
              cursor: "pointer",
              padding: "6px 2px"
            }}
          >
            <PixelIcon name={icon} color="currentColor" size={16} />
            <span style={{ fontFamily: "Silkscreen, monospace", fontSize: 8, letterSpacing: "0.06em" }}>
              {lbl}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function PlaceholderPage({ title, icon, tone, lines }) {
  return (
    <div style={{ padding: "0 20px 32px" }}>
      <div className="pxl pxl-raised" style={{ padding: 32, marginTop: 16, textAlign: "center" }}>
        <PixelIcon name={icon} color={`var(--${tone})`} size={48} />
        <h2 className="font-display t-xl mt-3" style={{ color: `var(--${tone})` }}>{title}</h2>
        <p className="dim mt-2">This screen is reachable from the dashboard.</p>
        <div className="pxl-inset mt-4" style={{ padding: 14, textAlign: "left", maxWidth: 560, margin: "16px auto" }}>
          {lines.map((l, i) => (
            <div key={i} className="font-mono t-sm" style={{ color: i === lines.length - 1 ? "var(--green)" : "var(--ink-dim)" }}>
              <span className="faint">{(i + 1).toString().padStart(2, "0")} │</span> {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [route, setRoute] = useState("dashboard");
  const [ticker, setTicker] = useState(null);
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [signInToast, setSignInToast] = useState(false);
  const [booted, setBooted] = useState(() => {
    try { return sessionStorage.getItem("nt_booted") === "1"; } catch (e) { return false; }
  });
  const bp = useBreakpoint();

  // Detect post-OAuth landing (oauth-callback/index.html redirects with ?signed_in=1)
  // and shared-report URLs (?share=ID:SIG) on load.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("signed_in") === "1") {
      setSignInToast(true);
      params.delete("signed_in");
      const qs = params.toString();
      window.history.replaceState({}, "",
        window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
      setTimeout(() => setSignInToast(false), 4200);
    }
    if (params.get("share")) {
      setRoute("share");
    }
  }, []);

  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Live tickers list — fuels command palette + future watchlist features.
  const paletteTickers = useTickersWithFallback
    ? useTickersWithFallback({ limit: 80 })
    : MOCK.tickers;

  // Profile (shared via query cache with Header's hook)
  const [appProfile] = useApi
    ? useApi(() => API.profile(), [])
    : [null];
  const appSignedIn = !!appProfile;

  // Apply palette + crt vars when tweaks change
  useEffect(() => {
    applyPalette(tweaks.palette);
    document.documentElement.style.setProperty("--scanline-opacity", tweaks.scanlines);
  }, [tweaks.palette, tweaks.scanlines]);

  const handleBootDone = () => {
    try { sessionStorage.setItem("nt_booted", "1"); } catch (e) {}
    setBooted(true);
  };

  const navigate = (r, t) => {
    if (t) setTicker(t);
    setRoute(r);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  // ── Global keyboard shortcuts + command palette ──
  const PALETTE_LIST = ["neural", "rgb", "phosphor", "amber", "cyber", "matrix", "graphite", "paper"];
  const handleAction = useCallback((a) => {
    if (a === "replayBoot") {
      try { sessionStorage.removeItem("nt_booted"); } catch (e) {}
      setBooted(false);
    } else if (a === "openDesignSystem") {
      window.open("Design System.html", "_blank");
    } else if (a === "cyclePalette") {
      const i = PALETTE_LIST.indexOf(tweaks.palette);
      const next = PALETTE_LIST[(i + 1) % PALETTE_LIST.length];
      setTweak("palette", next);
    } else if (a === "toggleChat") {
      window.dispatchEvent(new CustomEvent("v2:toggle-chat"));
    } else if (a === "showHelp") {
      setHelpOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweaks.palette]);

  if (useGlobalShortcuts) {
    useGlobalShortcuts({
      onPalette: () => setPaletteOpen(true),
      onNav: (r) => navigate(r),
      onAction: handleAction,
    });
  }

  let content;
  switch (route) {
    case "dashboard":
      content = <Dashboard onNav={navigate} loading={tweaks.showLoading} />;
      break;
    case "ticker":
      content = ticker
        ? <TickerDetail t={ticker} onBack={() => navigate("dashboard")} />
        : <Dashboard onNav={navigate} />;
      break;
    case "analyzer":
      content = <Analyzer onNav={navigate} />;
      break;
    case "workspace":
      content = window.Workspace
        ? <window.Workspace onNav={navigate} />
        : <Dashboard onNav={navigate} />;
      break;
    case "research":
      content = window.ResearchPage
        ? <window.ResearchPage onNav={navigate} />
        : <PlaceholderPage title="AI RESEARCH FEED" icon="brain" tone="amber" lines={["[ LOADING ]"]} />;
      break;
    case "watchlist":
      content = window.WatchlistPage
        ? <window.WatchlistPage onNav={navigate} />
        : <PlaceholderPage title="WATCHLISTS" icon="star" tone="amber" lines={["[ LOADING ]"]} />;
      break;
    case "profile":
      content = window.ProfilePage
        ? <window.ProfilePage />
        : <PlaceholderPage title="PROFILE" icon="shield" tone="cyan" lines={["[ LOADING ]"]} />;
      break;
    case "admin":
      content = window.AdminPage
        ? <window.AdminPage />
        : <PlaceholderPage title="ADMIN" icon="shield" tone="red" lines={["[ LOADING ]"]} />;
      break;
    case "compare":
      content = window.ComparePage
        ? <window.ComparePage onNav={navigate} />
        : <PlaceholderPage title="COMPARE" icon="chart" tone="cyan" lines={["[ LOADING ]"]} />;
      break;
    case "share": {
      const params = new URLSearchParams(window.location.search);
      content = window.PublicReportPage
        ? <window.PublicReportPage shareKey={params.get("share")} onNav={navigate} />
        : <PlaceholderPage title="SHARED REPORT" icon="news" tone="violet" lines={["[ LOADING ]"]} />;
      break;
    }
    case "about":
      content = window.AboutPage ? <window.AboutPage /> : <PlaceholderPage title="ABOUT" icon="brain" tone="cyan" lines={["[ LOADING ]"]} />;
      break;
    case "terms":
      content = window.TermsPage ? <window.TermsPage /> : <PlaceholderPage title="TERMS" icon="shield" tone="cyan" lines={["[ LOADING ]"]} />;
      break;
    case "privacy":
      content = window.PrivacyPage ? <window.PrivacyPage /> : <PlaceholderPage title="PRIVACY" icon="shield" tone="cyan" lines={["[ LOADING ]"]} />;
      break;
    case "portfolio":
      content = window.PortfolioPage
        ? <window.PortfolioPage onNav={navigate} />
        : <PlaceholderPage title="PORTFOLIO COMMAND" icon="wallet" tone="green" lines={["[ LOADING ]"]} />;
      break;
    case "alerts":
      content = window.AlertsPage
        ? <window.AlertsPage onNav={navigate} />
        : <PlaceholderPage title="PRICE ALERTS" icon="bell" tone="amber" lines={["[ LOADING ]"]} />;
      break;
    case "news":
      content = window.NewsPage
        ? <window.NewsPage />
        : <PlaceholderPage title="NEWSWIRE // LIVE" icon="news" tone="cyan" lines={["[ LOADING ]"]} />;
      break;
    default:
      content = <Dashboard onNav={navigate} />;
  }

  return (
    <div className="app-root" style={{
      paddingBottom: bp.mobile ? 72 : 48
    }}>
      <Header route={route === "ticker" ? "analyzer" : route} onNav={navigate} query={query} setQuery={setQuery} />
      {content}

      {/* CRT overlays — driven by tweaks */}
      <style>{`
        :root { --scanline-opacity: ${tweaks.scanlines}; }
      `}</style>

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Palette" />
        <TweakSelect
          label="Theme"
          value={tweaks.palette}
          options={[
            { label: "Neural (RGB mega-dark)", value: "neural" },
            { label: "RGB (animated rainbow)", value: "rgb" },
            { label: "Phosphor (cool blue)",   value: "phosphor" },
            { label: "Amber (sepia CRT)",      value: "amber" },
            { label: "Cyber (neon noir)",      value: "cyber" },
            { label: "Matrix (terminal)",      value: "matrix" },
            { label: "Graphite (gray)",        value: "graphite" },
            { label: "Paper (light)",          value: "paper" }
          ]}
          onChange={v => setTweak("palette", v)}
        />

        <TweakSection label="Atmosphere" />
        <TweakSlider
          label="Scanlines"
          value={tweaks.scanlines}
          min={0} max={2} step={0.1}
          onChange={v => setTweak("scanlines", v)}
        />
        <TweakToggle
          label="Vignette"
          value={tweaks.crtVignette}
          onChange={v => setTweak("crtVignette", v)}
        />
        <TweakToggle
          label="Chromatic aberration"
          value={tweaks.chromatic}
          onChange={v => setTweak("chromatic", v)}
        />
        <TweakToggle
          label="Text glow"
          value={tweaks.glow}
          onChange={v => setTweak("glow", v)}
        />

        <TweakSection label="System" />
        <TweakToggle
          label="Show status bar"
          value={tweaks.statusBar}
          onChange={v => setTweak("statusBar", v)}
        />
        <TweakToggle
          label="Loading states"
          value={tweaks.showLoading}
          onChange={v => setTweak("showLoading", v)}
        />
        <a
          href="Design System.html"
          className="pxl-btn sm"
          style={{ marginTop: 8, textDecoration: "none", justifyContent: "center" }}
        >▸ DESIGN SYSTEM</a>
        <button
          className="pxl-btn sm"
          style={{ marginTop: 4 }}
          onClick={() => {
            try { sessionStorage.removeItem("nt_booted"); } catch (e) {}
            setBooted(false);
          }}
        >REPLAY BOOT</button>
      </TweaksPanel>

      <div className="crt-bg" />
      {tweaks.crtVignette && <div className="crt-vignette" />}
      {tweaks.chromatic && <div className="crt-aberration" />}
      <div className="crt-curve" />

      {tweaks.statusBar && !bp.mobile && <StatusBar route={route} />}

      {bp.mobile && <BottomTabBar route={route} onNav={navigate} />}

      {!booted && <BootSequence onDone={handleBootDone} />}

      {/* Sign-in success toast after OAuth round-trip — top-right so AI CHAT button stays clickable */}
      {signInToast && (
        <div className="pxl pxl-raised" style={{
          position: "fixed",
          top: 72,
          right: 16,
          zIndex: 250,
          padding: "12px 20px",
          background: "var(--bg-1)",
          color: "var(--green)",
          fontFamily: "Silkscreen, monospace",
          fontSize: 12,
          letterSpacing: "0.08em",
          boxShadow: "0 0 24px rgba(16,185,129,0.4)",
          animation: "phosphor 4s ease-in-out infinite",
        }}>
          ▸ SIGN-IN OK ▸ WELCOME BACK
        </div>
      )}

      {/* v2-only: command palette (Cmd-K) */}
      {window.CommandPalette && (
        <window.CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNav={navigate}
          tickers={paletteTickers}
          onAction={handleAction}
        />
      )}

      {/* v2-only: AI chat overlay (Cmd-Shift-K) */}
      {window.ChatOverlay && <window.ChatOverlay currentTicker={ticker} />}

      {/* Background notification toasts (triggered alerts + completed research) */}
      {window.ToastBus && <window.ToastBus signedIn={appSignedIn} onNav={navigate} />}

      {/* Settings (Tweaks) toggle — floating button bottom-left so it doesn't
          clash with AI CHAT (bottom-right). Works in standalone mode where the
          design-host postMessage protocol isn't running. */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("v2:toggle-tweaks"))}
        title="Settings (themes, atmosphere, system)"
        style={{
          position: "fixed",
          left: 16,
          bottom: bp.mobile ? 76 : 44,
          zIndex: 60,
          padding: "8px 12px",
          background: "var(--bg-2)",
          border: "2px solid var(--cyan)",
          color: "var(--cyan)",
          fontFamily: "Silkscreen, monospace",
          fontSize: 11,
          letterSpacing: "0.08em",
          cursor: "pointer",
          boxShadow: "inset 0 2px 0 0 rgba(255,255,255,0.04), 0 0 12px rgba(88,211,255,0.25)",
        }}
      >
        ⚙ SETTINGS
      </button>

      {/* v2-only: keyboard shortcuts help (Shift+?) */}
      {window.HelpDialog && (
        <window.HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      )}
    </div>
  );
}


export default App;

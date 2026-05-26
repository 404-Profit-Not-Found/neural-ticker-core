// Top-level app — header, nav, route switch, tweaks
const { useState: useStateApp, useEffect: useEffectApp } = React;

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

function Header({ route, onNav, query, setQuery }) {
  const [now, setNow] = useStateApp(new Date());
  const [mobileSearchOpen, setMobileSearchOpen] = useStateApp(false);
  const bp = useBreakpoint();

  useEffectApp(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const tabs = [
    ["dashboard", "DASH"],
    ["analyzer", "ANALYZER"],
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

          <div style={{ position: "relative" }}>
            <PixelIcon name="bell" color="var(--amber)" size={16} />
            <span style={{
              position: "absolute", top: -4, right: -6,
              background: "var(--red)", color: "#fff",
              fontFamily: "Silkscreen", fontSize: 8,
              padding: "1px 3px", letterSpacing: 0
            }}>3</span>
          </div>

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
                  const t = window.MOCK.tickers.find(x => x.sym.toLowerCase() === query.toLowerCase());
                  if (t) { onNav("ticker", t); setQuery(""); setMobileSearchOpen(false); }
                }
              }}
            />
            {query && (
              <div className="pxl pxl-raised" style={{ marginTop: 8 }}>
                {window.MOCK.tickers
                  .filter(t => t.sym.toLowerCase().includes(query.toLowerCase()) || t.name.toLowerCase().includes(query.toLowerCase()))
                  .slice(0, 6)
                  .map(t => (
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

  // DESKTOP / TABLET HEADER
  return (
    <header style={{
      background: "var(--bg-1)",
      borderBottom: "2px solid var(--line)",
      padding: "0 20px",
      position: "sticky",
      top: 0,
      zIndex: 50
    }}>
      <div className="row" style={{ alignItems: "center", gap: 16, height: 56 }}>
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

        {/* Nav tabs */}
        <nav className="row gap-1" style={{ marginLeft: 16 }}>
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
                borderRadius: 0
              }}
            >
              {lbl}
            </button>
          ))}
        </nav>

        {/* Search */}
        <div style={{ flex: 1, position: "relative", maxWidth: 360, marginLeft: "auto" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
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
                const t = window.MOCK.tickers.find(x => x.sym.toLowerCase() === query.toLowerCase());
                if (t) { onNav("ticker", t); setQuery(""); }
              }
            }}
          />
        </div>

        {/* Status cluster */}
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <div className="col" style={{ textAlign: "right", lineHeight: 1.1 }}>
            <span className="font-mono t-xs green" style={{ fontWeight: 700 }}>● MARKET OPEN</span>
            <span className="font-mono t-xs faint">NYSE • {time} EST</span>
          </div>
          <div style={{ width: 1, height: 32, background: "var(--line)" }} />
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <PixelIcon name="bell" color="var(--amber)" size={16} />
              <span style={{
                position: "absolute", top: -4, right: -6,
                background: "var(--red)", color: "#fff",
                fontFamily: "Silkscreen", fontSize: 8,
                padding: "1px 3px", letterSpacing: 0
              }}>3</span>
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: "var(--line)" }} />
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <SpriteMascot seed={777} size={32} colors={["transparent", "var(--cyan)", "var(--cyan-dark)", "var(--amber)"]} />
            <div className="col" style={{ lineHeight: 1.1 }}>
              <span className="font-display t-xs">KAI_77</span>
              <RankBadge rank="WHALE" />
            </div>
          </div>
        </div>
      </div>

      {/* Search results dropdown */}
      {query && (
        <div className="pxl pxl-raised" style={{
          position: "absolute",
          top: 56,
          right: 200,
          width: 360,
          zIndex: 100
        }}>
          {window.MOCK.tickers
            .filter(t => t.sym.toLowerCase().includes(query.toLowerCase()) || t.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 6)
            .map(t => (
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
                <span className="font-mono t-xs">${t.price.toFixed(2)}</span>
                <PriceDelta pct={t.change} />
              </div>
            ))}
        </div>
      )}
    </header>
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
window.BottomTabBar = BottomTabBar;

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
  const [route, setRoute] = useStateApp("dashboard");
  const [ticker, setTicker] = useStateApp(null);
  const [query, setQuery] = useStateApp("");
  const [booted, setBooted] = useStateApp(() => {
    try { return sessionStorage.getItem("nt_booted") === "1"; } catch (e) { return false; }
  });
  const bp = useBreakpoint();

  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply palette + crt vars when tweaks change
  useEffectApp(() => {
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
    case "research":
      content = <PlaceholderPage title="AI RESEARCH FEED" icon="brain" tone="amber" lines={[
        "▸ AGGREGATED RESEARCH ACROSS YOUR WATCHLIST",
        "▸ 48 NEW REPORTS IN LAST 24H — 12 STRONG BUY, 3 SELL",
        "▸ TOP MODEL: GEMINI-2.5 PRO ▸ GPT-5 ENSEMBLE",
        "▸ AVG CONFIDENCE: 0.78 │ AVG TOKENS: 142K",
        "[ READY ]"
      ]} />;
      break;
    case "portfolio":
      content = <PlaceholderPage title="PORTFOLIO COMMAND" icon="wallet" tone="green" lines={[
        "▸ TOTAL VALUE  : $184,230.55",
        "▸ DAY P&L      : +$2,118.42 (+1.16%)",
        "▸ POSITIONS    : 06 OPEN",
        "▸ CASH         : $24,118.00",
        "[ READY ]"
      ]} />;
      break;
    case "alerts":
      content = <PlaceholderPage title="PRICE ALERTS" icon="bell" tone="amber" lines={[
        "▸ ZYRA  ▸ ABOVE $190.00     ▸ TRIGGERED 12:42",
        "▸ HALO  ▸ BELOW $900.00     ▸ ARMED",
        "▸ AURA  ▸ CHANGE ±5% DAILY  ▸ TRIGGERED 11:18",
        "[ READY ]"
      ]} />;
      break;
    case "news":
      content = <PlaceholderPage title="NEWSWIRE // LIVE" icon="news" tone="cyan" lines={[
        "▸ INGEST RATE   : 14.2 ITEMS/MIN",
        "▸ TODAY         : 384 PROCESSED",
        "▸ TAGGED MACRO  : 92  │  EARNINGS: 41  │  M&A: 18",
        "[ READY ]"
      ]} />;
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
    </div>
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById("app"));
root.render(<App />);

// Register service worker for PWA offline support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

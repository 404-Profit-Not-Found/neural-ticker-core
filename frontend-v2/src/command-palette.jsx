// Command palette (Cmd-K) + global keyboard navigation
// — Cmd/Ctrl+K opens palette
// — Type to filter actions + tickers (debounced)
// — Vim-style g-leader shortcuts: gd dashboard / ga analyzer / gr research /
//   gp portfolio / gl alerts / gn news / gw workspace
// — / focuses palette in ticker-search mode
// — Esc closes
const { useState: useStateCmd, useEffect: useEffectCmd, useRef: useRefCmd, useMemo: useMemoCmd } = React;

const PALETTE_SECTIONS = [
  {
    label: "NAVIGATE",
    items: [
      { id: "nav:dashboard", title: "Go to Dashboard",   hint: "g d",        kind: "nav", to: "dashboard" },
      { id: "nav:analyzer",  title: "Go to Analyzer",    hint: "g a",        kind: "nav", to: "analyzer" },
      { id: "nav:research",  title: "Go to AI Research", hint: "g r",        kind: "nav", to: "research" },
      { id: "nav:portfolio", title: "Go to Portfolio",   hint: "g p",        kind: "nav", to: "portfolio" },
      { id: "nav:alerts",    title: "Go to Alerts",      hint: "g l",        kind: "nav", to: "alerts" },
      { id: "nav:news",      title: "Go to News",        hint: "g n",        kind: "nav", to: "news" },
      { id: "nav:workspace", title: "Open Workspace",    hint: "g w",        kind: "nav", to: "workspace" },
      { id: "nav:watchlist", title: "Open Watchlists",   hint: "g s",        kind: "nav", to: "watchlist" },
      { id: "nav:compare",   title: "Compare Tickers",   hint: "g c",        kind: "nav", to: "compare" },
      { id: "nav:profile",   title: "Open Profile & Credits", hint: "g u",   kind: "nav", to: "profile" },
      { id: "nav:admin",     title: "Open Admin Console (admin)", hint: "g x", kind: "nav", to: "admin" },
    ],
  },
  {
    label: "ACTIONS",
    items: [
      { id: "act:chat",     title: "Toggle AI Chat",        hint: "⌘ ⇧ K", kind: "action", action: "toggleChat" },
      { id: "act:replay",   title: "Replay boot sequence",  hint: "",      kind: "action", action: "replayBoot" },
      { id: "act:design",   title: "Open Design System",    hint: "",      kind: "action", action: "openDesignSystem" },
      { id: "act:theme",    title: "Cycle palette",         hint: "⌘ ⇧ T", kind: "action", action: "cyclePalette" },
      { id: "act:help",     title: "Show keyboard shortcuts", hint: "?",   kind: "action", action: "showHelp" },
    ],
  },
];

function fuzzyScore(needle, hay) {
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  if (h.includes(n)) return 1000 - (h.indexOf(n) * 4) - h.length;
  // letter sub-sequence scoring
  let i = 0;
  let score = 0;
  for (let j = 0; j < h.length && i < n.length; j++) {
    if (h[j] === n[i]) { score += 6 - Math.min(5, j - i); i++; }
  }
  return i === n.length ? score : -1;
}

function CommandPalette({ open, onClose, onNav, tickers, onAction }) {
  const [q, setQ] = useStateCmd("");
  const [active, setActive] = useStateCmd(0);
  const inputRef = useRefCmd(null);

  useEffectCmd(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
    }
  }, [open]);

  const flat = useMemoCmd(() => {
    const base = [];
    for (const sec of PALETTE_SECTIONS) {
      for (const it of sec.items) base.push({ ...it, section: sec.label });
    }
    // tickers
    if (Array.isArray(tickers)) {
      for (const t of tickers.slice(0, 60)) {
        base.push({
          id: `sym:${t.sym}`,
          title: `${t.sym} — ${t.name}`,
          hint: `$${(t.price || 0).toFixed(2)}`,
          kind: "ticker",
          ticker: t,
          section: "TICKERS",
        });
      }
    }
    return base;
  }, [tickers]);

  const filtered = useMemoCmd(() => {
    if (!q) return flat.slice(0, 40);
    const scored = flat
      .map((it) => ({ it, s: Math.max(fuzzyScore(q, it.title), it.id.startsWith("sym:") ? fuzzyScore(q, it.ticker.sym) * 1.4 : -1) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map((x) => x.it);
    return scored;
  }, [q, flat]);

  useEffectCmd(() => { setActive(0); }, [q]);

  if (!open) return null;

  const choose = (it) => {
    if (!it) return;
    if (it.kind === "nav") onNav(it.to);
    else if (it.kind === "ticker") onNav("ticker", it.ticker);
    else if (it.kind === "action") onAction(it.action);
    onClose();
  };

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter")     { e.preventDefault(); choose(filtered[active]); }
  };

  // Group filtered by section preserving order
  const grouped = [];
  let cur = null;
  for (const it of filtered) {
    if (!cur || cur.label !== it.section) { cur = { label: it.section, items: [] }; grouped.push(cur); }
    cur.items.push(it);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "10vh"
      }}
    >
      <div
        className="pxl pxl-raised"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 92vw)",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-1)",
        }}
      >
        <div className="pxl-head">
          <span><span className="dot amber"></span>COMMAND ▸ TYPE TO FILTER</span>
          <span className="font-display t-xs faint">ESC TO CLOSE</span>
        </div>
        <div style={{ padding: 12, borderBottom: "2px solid var(--line)", position: "relative" }}>
          <span style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)" }}>
            <PixelIcon name="search" color="var(--amber)" size={16} />
          </span>
          <input
            ref={inputRef}
            type="text"
            className="pxl-input"
            placeholder="> filter actions, tickers, or paste a symbol..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            style={{ fontSize: 13 }}
          />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {grouped.length === 0 && (
            <div style={{ padding: 24, textAlign: "center" }} className="font-display t-xs faint">
              NO MATCHES — TRY A SHORTER QUERY
            </div>
          )}
          {grouped.map((g) => (
            <div key={g.label}>
              <div className="font-display t-xs faint" style={{
                padding: "10px 14px 4px",
                letterSpacing: "0.1em"
              }}>{g.label}</div>
              {g.items.map((it) => {
                const idx = filtered.indexOf(it);
                const isActive = idx === active;
                return (
                  <div
                    key={it.id}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => choose(it)}
                    style={{
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                      background: isActive ? "var(--bg-3)" : "transparent",
                      borderLeft: isActive ? "3px solid var(--amber)" : "3px solid transparent",
                    }}
                  >
                    {it.kind === "ticker" ? (
                      <TickerSprite t={it.ticker} size={22} />
                    ) : (
                      <PixelIcon
                        name={it.kind === "nav" ? "chart" : it.kind === "action" ? "bolt" : "search"}
                        color={isActive ? "var(--amber)" : "var(--ink-dim)"}
                        size={14}
                      />
                    )}
                    <span style={{ flex: 1, fontSize: 13, color: isActive ? "var(--ink)" : "var(--ink-dim)" }}>
                      {it.title}
                    </span>
                    {it.hint && (
                      <span className="font-display t-xs faint" style={{ letterSpacing: "0.08em" }}>
                        {it.hint}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 14px", borderTop: "2px solid var(--line)", display: "flex", gap: 14 }}>
          <span className="font-display t-xs faint">↑↓ MOVE</span>
          <span className="font-display t-xs faint">↵ SELECT</span>
          <span className="font-display t-xs faint">G+X NAV</span>
          <span style={{ flex: 1 }} />
          <span className="font-display t-xs amber">⌘ K</span>
        </div>
      </div>
    </div>
  );
}

// Global keyboard hook used by App
function useGlobalShortcuts({ onPalette, onNav, onAction }) {
  useEffectCmd(() => {
    let gPressed = false;
    let gTimer = null;
    const armG = () => {
      gPressed = true;
      if (gTimer) clearTimeout(gTimer);
      gTimer = setTimeout(() => { gPressed = false; }, 900);
    };

    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      // Cmd/Ctrl+K — open palette (works even in inputs)
      if (meta && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        onPalette();
        return;
      }
      // Cmd/Ctrl+Shift+K — toggle chat
      if (meta && e.shiftKey && (e.key === "K" || e.key === "k")) {
        e.preventDefault();
        onAction("toggleChat");
        return;
      }
      // Cmd/Ctrl+Shift+T — cycle palette/theme
      if (meta && e.shiftKey && (e.key === "T" || e.key === "t")) {
        e.preventDefault();
        onAction("cyclePalette");
        return;
      }
      if (isTypingTarget(e.target)) return; // don't hijack while typing
      // / — open palette in ticker-search mode
      if (e.key === "/") { e.preventDefault(); onPalette(); return; }
      // ? (Shift+/) — open keyboard help dialog
      if (e.key === "?") { e.preventDefault(); onAction("showHelp"); return; }
      // g leader
      if (e.key === "g") { armG(); return; }
      if (gPressed) {
        const map = { d: "dashboard", a: "analyzer", r: "research", p: "portfolio", l: "alerts", n: "news", w: "workspace", s: "watchlist", u: "profile", x: "admin", c: "compare" };
        const dest = map[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          onNav(dest);
          gPressed = false;
          if (gTimer) { clearTimeout(gTimer); gTimer = null; }
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [onPalette, onNav, onAction]);
}

window.CommandPalette = CommandPalette;
window.useGlobalShortcuts = useGlobalShortcuts;

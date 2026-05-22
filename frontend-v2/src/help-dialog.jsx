// Help dialog — shows all global keyboard shortcuts. Triggered by Shift+/
// (which is "?" on most layouts) or via command palette action.
const { useEffect: useEffectHelp, useState: useStateHelp } = React;

const HELP_SECTIONS = [
  {
    label: "COMMAND",
    rows: [
      ["⌘ K  /  CTRL K", "Open command palette"],
      ["/", "Open palette in search mode"],
      ["?", "Open this help dialog"],
      ["ESC", "Close any open dialog / panel"],
    ],
  },
  {
    label: "NAVIGATION (g-leader)",
    rows: [
      ["G  D", "Dashboard"],
      ["G  W", "Workspace"],
      ["G  A", "Analyzer"],
      ["G  S", "Watchlists"],
      ["G  R", "Research"],
      ["G  P", "Portfolio"],
      ["G  L", "Alerts"],
      ["G  N", "News"],
      ["G  U", "Profile & Credits"],
      ["G  X", "Admin Console (admin only)"],
    ],
  },
  {
    label: "AI / RESEARCH",
    rows: [
      ["⌘ ⇧ K", "Toggle AI Chat overlay"],
      ["⌘ ⇧ T", "Cycle theme palette"],
      ["⏎  (inside chat)", "Send message"],
    ],
  },
  {
    label: "TICKER DETAIL",
    rows: [
      ["RUN AI button", "Deep research dialog (POST /research/ask)"],
      ["WATCHLIST button", "Toggle favourites for current ticker"],
      ["ALERT button", "Create price alert (price-above / below / % change)"],
      ["+ BUY button", "Add portfolio position"],
    ],
  },
  {
    label: "PALETTE THEMES",
    rows: [
      ["Tweaks panel", "Bottom-right gear icon ▸ Theme selector"],
      ["Available", "Neural · RGB · Phosphor · Amber · Cyber · Matrix · Graphite · Paper"],
    ],
  },
];

function HelpDialog({ open, onClose }) {
  useEffectHelp(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 220,
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(2px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: "8vh",
    }}>
      <div onClick={(e) => e.stopPropagation()}
        className="pxl pxl-raised"
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "82vh",
          display: "flex", flexDirection: "column",
          background: "var(--bg-1)",
        }}>
        <div className="pxl-head" style={{ flexShrink: 0 }}>
          <span><span className="dot cyan"></span>KEYBOARD SHORTCUTS &amp; HELP</span>
          <span className="font-display t-xs faint" style={{ cursor: "pointer" }} onClick={onClose}>✕ CLOSE</span>
        </div>
        <div style={{ padding: 18, overflowY: "auto", display: "grid",
          gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {HELP_SECTIONS.map((s) => (
            <div key={s.label} className="col gap-2">
              <div className="font-display t-xs faint" style={{
                letterSpacing: "0.12em",
                borderBottom: "2px dashed var(--line)",
                paddingBottom: 4,
                color: "var(--amber)",
              }}>
                {s.label}
              </div>
              {s.rows.map(([key, desc], i) => (
                <div key={i} className="row gap-3" style={{ alignItems: "baseline" }}>
                  <span style={{
                    fontFamily: "Silkscreen, monospace",
                    fontSize: 10,
                    background: "var(--bg-0)",
                    border: "2px solid var(--line)",
                    color: "var(--cyan)",
                    padding: "3px 6px",
                    letterSpacing: "0.08em",
                    minWidth: 120,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}>
                    {key}
                  </span>
                  <span className="t-xs" style={{ color: "var(--ink-dim)", lineHeight: 1.4 }}>
                    {desc}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{
          flexShrink: 0,
          padding: "10px 14px",
          borderTop: "2px solid var(--line)",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}>
          <span className="font-display t-xs faint">PRESS ESC OR CLICK BACKDROP TO CLOSE</span>
          <span style={{ flex: 1 }} />
          <span className="font-display t-xs amber">NEURAL//TICKER v2</span>
        </div>
      </div>
    </div>
  );
}

window.HelpDialog = HelpDialog;

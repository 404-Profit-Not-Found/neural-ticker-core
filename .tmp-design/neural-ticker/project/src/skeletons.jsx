// Pixel skeleton / loading-state primitives
// Loaded as type="text/babel" after components.jsx

// -----------------------------------------------------------
// Skel — basic chunky shimmer block
// -----------------------------------------------------------
function Skel({ w, h = 14, style = {} }) {
  const widthStyle = typeof w === "number" ? `${w}px` : (w || "100%");
  return (
    <span className="pxl-skel" style={{
      display: "inline-block",
      width: widthStyle,
      height: h,
      ...style
    }} />
  );
}

// Multi-line text skeleton
function SkelText({ lines = 3, lastWidth = "60%" }) {
  return (
    <div className="col gap-2" style={{ width: "100%" }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skel
          key={i}
          w={i === lines - 1 ? lastWidth : "100%"}
          h={10}
        />
      ))}
    </div>
  );
}

// Dithered loading block (alternate to shimmer)
function SkelDither({ w = "100%", h = 60 }) {
  return (
    <div className="pxl-skel-dither" style={{
      width: w,
      height: h
    }} />
  );
}

// Scanning chart placeholder
function SkelChart({ w = "100%", h = 240 }) {
  // Generate a dummy waveform path with dim color
  const points = [];
  for (let i = 0; i < 24; i++) {
    points.push(Math.sin(i * 0.4) * 30 + 50 + Math.random() * 10);
  }
  const path = points.map((y, i) => `${i === 0 ? "M" : "L"} ${i * (100/23)} ${y}`).join(" ");

  return (
    <div className="pxl-scan" style={{
      width: w,
      height: h,
      border: "2px solid var(--line)",
      position: "relative"
    }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ opacity: 0.18 }}>
        {/* Grid lines */}
        {[20, 40, 60, 80].map(y => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--line)" strokeWidth="0.4" strokeDasharray="1 2" />
        ))}
        <path d={path} fill="none" stroke="var(--ink-dim)" strokeWidth="1" />
      </svg>
      <div style={{
        position: "absolute",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        textAlign: "center"
      }}>
        <div className="pxl-loading-text">ACQUIRING DATA</div>
        <div className="font-mono t-xs faint mt-2">▸ SCANNING WAVEFORM</div>
      </div>
    </div>
  );
}

// Loading bar with progress segments
function SkelBar({ width = "100%", segments = 10 }) {
  return (
    <div className="pxl-progress" style={{ width }}>
      {Array.from({ length: segments }).map((_, i) => <i key={i} />)}
    </div>
  );
}

// Animated dots (typing indicator)
function SkelDots() {
  return <span className="pxl-loading-text" />;
}

// ASCII spinner
function Spinner({ label }) {
  return (
    <span className="row gap-2" style={{ alignItems: "center" }}>
      <span className="pxl-spinner" />
      {label && <span className="font-display t-xs amber" style={{ letterSpacing: "0.08em" }}>{label}</span>}
    </span>
  );
}

// -----------------------------------------------------------
// Composite skeletons matching real components
// -----------------------------------------------------------

// StatTile skeleton
function StatTileSkel() {
  return (
    <div className="pxl pxl-raised" style={{ padding: 12 }}>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Skel w={70} h={9} />
        <Skel w={16} h={16} />
      </div>
      <Skel w="60%" h={22} style={{ marginBottom: 8 }} />
      <Skel w={50} h={10} />
    </div>
  );
}

// Top opportunity card skeleton
function OpportunityCardSkel() {
  return (
    <div className="pxl pxl-raised" style={{ padding: 12 }}>
      <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Skel w={36} h={36} />
        <div className="col gap-2" style={{ flex: 1 }}>
          <Skel w="40%" h={11} />
          <Skel w="70%" h={9} />
        </div>
      </div>
      <Skel w={90} h={16} style={{ marginBottom: 10 }} />
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <Skel w={100} h={20} />
        <Skel w={50} h={16} />
      </div>
      <Skel w="100%" h={36} style={{ marginBottom: 10 }} />
      <div className="row gap-3" style={{ paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
        <div className="col gap-1" style={{ flex: 1 }}>
          <Skel w={40} h={8} />
          <Skel w="60%" h={14} />
        </div>
        <div className="col gap-1" style={{ flex: 1 }}>
          <Skel w={40} h={8} />
          <Skel w="100%" h={8} />
        </div>
      </div>
    </div>
  );
}

// News row skeleton
function NewsRowSkel() {
  return (
    <div className="row" style={{
      padding: "10px 14px",
      gap: 12,
      borderBottom: "1px solid var(--line-soft)",
      alignItems: "flex-start"
    }}>
      <Skel w={44} h={10} />
      <Skel w={62} h={14} />
      <div className="col gap-2" style={{ flex: 1 }}>
        <Skel w="90%" h={13} />
        <Skel w="40%" h={10} />
      </div>
    </div>
  );
}

// Watchlist row skeleton
function WatchlistRowSkel() {
  return (
    <div className="row" style={{
      padding: "8px 12px",
      borderBottom: "1px solid var(--line-soft)",
      alignItems: "center",
      gap: 10
    }}>
      <Skel w={26} h={26} />
      <div className="col gap-2" style={{ flex: 1 }}>
        <Skel w="35%" h={11} />
        <Skel w="75%" h={9} />
      </div>
      <Skel w={56} h={20} />
      <div className="col gap-1" style={{ alignItems: "flex-end" }}>
        <Skel w={58} h={11} />
        <Skel w={42} h={9} />
      </div>
    </div>
  );
}

// Table row skeleton (for analyzer)
function TableRowSkel({ cols = 10 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: 10 }}>
          <Skel w={i === 0 ? 90 : "70%"} h={12} />
        </td>
      ))}
    </tr>
  );
}

// AI Digest skeleton — special "generating" state with typed-out reasoning
function AIDigestSkel({ stage = "thinking" }) {
  // stage: "thinking" | "streaming"
  const reasoning = [
    "▸ INGESTING MARKET FEED ▸ 184 SIGNALS",
    "▸ CROSS-CHECKING 12 SOURCES ▸ REUTERS WSJ BLOOMBERG FT…",
    "▸ ROUTING TO GEMINI-2.5 PRO ▸ DEEP MODE",
    "▸ ROUTING TO GPT-5 ▸ ENSEMBLE WEIGHT 0.42",
    "▸ ROUTING TO CLAUDE OPUS-4 ▸ ENSEMBLE WEIGHT 0.38",
    "▸ RECONCILING DIVERGENT VERDICTS ▸ CONF 0.84",
    "▸ COMPILING DIGEST ▸ 8 SECTIONS"
  ];

  return (
    <div className="p-4 col gap-3">
      <div className="row gap-2" style={{ alignItems: "center" }}>
        <PixelIcon name="brain" color="var(--amber)" size={20} />
        <span className="pxl-loading-text">REASONING</span>
        <span style={{ flex: 1 }} />
        <Spinner />
      </div>

      <div className="pxl-rule" />

      <SkelBar segments={12} />

      <div className="font-mono t-sm" style={{ lineHeight: 1.6 }}>
        {reasoning.map((line, i) => (
          <TypedLine key={i} text={line} delay={i * 600} />
        ))}
      </div>

      <div className="pxl-rule mt-2" />
      <div className="row gap-2" style={{ alignItems: "center" }}>
        <span className="font-display t-xs faint">ETA</span>
        <span className="font-mono t-xs amber">~ 0:08</span>
        <span style={{ flex: 1 }} />
        <button className="pxl-btn sm">ABORT</button>
      </div>
    </div>
  );
}

// Single typed-out line — characters appear in chunks
function TypedLine({ text, delay = 0, charsPerTick = 3, tickMs = 50 }) {
  const [shown, setShown] = React.useState(0);
  const [started, setStarted] = React.useState(delay === 0);

  React.useEffect(() => {
    if (delay > 0) {
      const t = setTimeout(() => setStarted(true), delay);
      return () => clearTimeout(t);
    }
  }, [delay]);

  React.useEffect(() => {
    if (!started || shown >= text.length) return;
    const id = setTimeout(() => setShown(s => Math.min(s + charsPerTick, text.length)), tickMs);
    return () => clearTimeout(id);
  }, [started, shown, text.length]);

  if (!started) return <div style={{ height: "1.6em" }}>&nbsp;</div>;

  const done = shown >= text.length;
  return (
    <div style={{ color: done ? "var(--green)" : "var(--ink)" }}>
      {text.slice(0, shown)}
      {!done && <span className="pxl-cursor" style={{ marginLeft: 0 }}>&nbsp;</span>}
    </div>
  );
}

// Donut allocation skeleton
function DonutSkel({ size = 140 }) {
  return (
    <div className="col" style={{ alignItems: "center" }}>
      <div className="pxl-pulse" style={{
        width: size,
        height: size,
        borderRadius: 0,
        position: "relative",
        clipPath: `circle(${size / 2}px at center)`
      }}>
        <div style={{
          position: "absolute", inset: "18px",
          background: "var(--bg-1)",
          clipPath: `circle(${size / 2 - 18}px at center)`,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <Spinner />
        </div>
      </div>
    </div>
  );
}

// Full panel skeleton — title bar + body of repeating items
function PanelSkel({ title, rows = 4, kind = "row" }) {
  return (
    <PixelPanel title={title || <Skel w={120} h={10} />} accent="cyan"
      actions={<Spinner label={kind === "loading" ? "LOADING" : null} />}
    >
      {kind === "card" && (
        <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {Array.from({ length: rows }).map((_, i) => <OpportunityCardSkel key={i} />)}
        </div>
      )}
      {kind === "row" && Array.from({ length: rows }).map((_, i) => <NewsRowSkel key={i} />)}
      {kind === "chart" && <div style={{ padding: 12 }}><SkelChart h={240} /></div>}
    </PixelPanel>
  );
}

// Toast-style "loading overlay" that floats over content
function LoadingOverlay({ label = "SYNCING" }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "rgba(7, 9, 15, 0.7)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10
    }}>
      <div className="pxl pxl-raised" style={{ padding: 20, minWidth: 240, textAlign: "center" }}>
        <Spinner label={label} />
        <div className="mt-3"><SkelBar segments={10} /></div>
        <div className="font-mono t-xs faint mt-2">▸ ESTABLISHING UPLINK…</div>
      </div>
    </div>
  );
}

// Empty state — for "no data" rather than loading
function EmptyState({ icon = "search", title = "NO RESULTS", subtitle = "Try a different filter or query." }) {
  return (
    <div className="col" style={{
      alignItems: "center",
      justifyContent: "center",
      padding: 48,
      gap: 12
    }}>
      <PixelIcon name={icon} color="var(--ink-faint)" size={48} />
      <span className="font-display amber" style={{ fontSize: 14, letterSpacing: "0.08em" }}>{title}</span>
      <span className="t-sm dim" style={{ textAlign: "center", maxWidth: 280 }}>{subtitle}</span>
    </div>
  );
}

Object.assign(window, {
  Skel, SkelText, SkelDither, SkelChart, SkelBar, SkelDots, Spinner,
  StatTileSkel, OpportunityCardSkel, NewsRowSkel, WatchlistRowSkel, TableRowSkel,
  AIDigestSkel, TypedLine, DonutSkel, PanelSkel, LoadingOverlay, EmptyState
});

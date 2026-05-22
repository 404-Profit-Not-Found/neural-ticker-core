// Boot intro + persistent status bar
const { useState: useStateChrome, useEffect: useEffectChrome, useRef: useRefChrome } = React;

function BootSequence({ onDone }) {
  const lines = [
    { text: "NEURAL//TICKER OS  v3.4.1", color: "info" },
    { text: "COPYRIGHT (C) 2026  NEURAL CORP", color: "dim" },
    { text: "─".repeat(48), color: "dim" },
    { text: "▸ DETECTING DISPLAY            [1440x900 RGB]", color: "ok", delay: 120 },
    { text: "▸ INITIALIZING MARKET DATA     [████████████]  OK", color: "ok", delay: 140 },
    { text: "▸ SYNCING WATCHLIST            [████████████]  OK", color: "ok", delay: 160 },
    { text: "▸ LOADING AI ENSEMBLE          [████████████]  OK", color: "ok", delay: 180 },
    { text: "▸ MODELS: GEMINI-2.5  GPT-5  CLAUDE OPUS-4", color: "info", delay: 100 },
    { text: "▸ ESTABLISHING UPLINK ▸ NYSE   [████████████]  OK", color: "ok", delay: 140 },
    { text: "▸ LATENCY 14ms  PACKET LOSS 0%", color: "dim", delay: 90 },
    { text: "▸ AUTH: KAI_77 ▸ TIER PRO ▸ WHALE-RANK", color: "warn", delay: 120 },
    { text: "─".repeat(48), color: "dim" },
    { text: "READY.  PRESS ANY KEY TO ENTER.", color: "ok" }
  ];

  const [shown, setShown] = useStateChrome(0);
  const [out, setOut] = useStateChrome(false);

  useEffectChrome(() => {
    if (shown >= lines.length) return;
    const d = lines[shown].delay || 90;
    const t = setTimeout(() => setShown(s => s + 1), d);
    return () => clearTimeout(t);
  }, [shown]);

  useEffectChrome(() => {
    const dismiss = () => {
      if (shown < lines.length) return;
      setOut(true);
      setTimeout(onDone, 350);
    };
    if (shown >= lines.length) {
      window.addEventListener("keydown", dismiss);
      window.addEventListener("click", dismiss);
      const autoT = setTimeout(dismiss, 1600);
      return () => {
        window.removeEventListener("keydown", dismiss);
        window.removeEventListener("click", dismiss);
        clearTimeout(autoT);
      };
    }
  }, [shown]);

  return (
    <div className={`boot ${out ? "boot-out" : ""}`}>
      <div className="boot-content">
        <div style={{
          fontFamily: "Silkscreen, monospace", fontSize: 28, color: "var(--amber)",
          letterSpacing: "0.06em", marginBottom: 18, textShadow: "0 0 12px var(--amber)"
        }}>
          NEURAL<span className="cyan">//</span>TICKER
        </div>
        <div className="font-display t-xs faint" style={{ marginBottom: 24 }}>
          TERMINAL EDITION ▸ 16-BIT
        </div>
        {lines.slice(0, shown).map((l, i) => (
          <div key={i} className="boot-line">
            <span className={l.color}>{l.text}</span>
          </div>
        ))}
        {shown < lines.length && (
          <div className="boot-line"><span className="pxl-cursor"></span></div>
        )}
      </div>
    </div>
  );
}

function StatusBar({ route }) {
  const [now, setNow] = useStateChrome(new Date());
  const [tick, setTick] = useStateChrome(0);

  useEffectChrome(() => {
    const id = setInterval(() => { setNow(new Date()); setTick(t => t + 1); }, 1000);
    return () => clearInterval(id);
  }, []);

  // Pseudo-live metrics
  const latency = 12 + (tick % 6);
  const fps = 60 - (tick % 3);
  const memory = (38 + (tick % 4) * 0.3).toFixed(1);

  const time = now.toLocaleTimeString("en-GB", { hour12: false });

  return (
    <div className="status-bar">
      <StatusLED tone="green" label={`LINK ${latency}ms`} />
      <span className="sep" />
      <StatusLED tone="cyan" label="NYSE OPEN" />
      <span className="sep" />
      <span><span className="faint">SYNC</span> <span className="green">●●●●</span><span className="faint">●</span></span>
      <span className="sep" />
      <span><span className="faint">CTX</span> {route.toUpperCase()}</span>
      <span style={{ flex: 1 }} />
      <span><span className="faint">FPS</span> {fps}</span>
      <span className="sep" />
      <span><span className="faint">MEM</span> {memory}MB</span>
      <span className="sep" />
      <span><span className="faint">UTC</span> {time}</span>
      <span className="sep" />
      <span className="amber">REC ●</span>
    </div>
  );
}

window.BootSequence = BootSequence;
window.StatusBar = StatusBar;

// Dashboard view — pixel terminal
const { useState: useStateD, useEffect: useEffectD } = React;

function MarketTicker() {
  const items = window.MOCK.indices;
  // duplicate for seamless marquee
  const doubled = [...items, ...items];
  return (
    <div style={{
      background: "var(--bg-1)",
      borderTop: "2px solid var(--line)",
      borderBottom: "2px solid var(--line)",
      overflow: "hidden",
      position: "relative"
    }}>
      <div className="marquee-track" style={{ padding: "8px 0" }}>
        {doubled.map((idx, i) => {
          const up = idx.ch >= 0;
          return (
            <span key={i} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 12,
              whiteSpace: "nowrap"
            }}>
              <span className="font-display t-xs faint">{idx.name}</span>
              <span style={{ fontWeight: 600 }}>{idx.val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={up ? "green" : "red"} style={{ fontWeight: 700 }}>
                {up ? "▲" : "▼"} {Math.abs(idx.ch).toFixed(2)}%
              </span>
              <span className="faint">│</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function StatTile({ label, value, sub, icon, tone = "cyan", onClick }) {
  return (
    <div className="pxl pxl-raised" style={{ padding: 12, cursor: "pointer" }} onClick={onClick}>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span className="font-display t-xs faint">{label}</span>
        <PixelIcon name={icon} color={`var(--${tone})`} size={16} />
      </div>
      <div className="font-mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div className="mt-2">{sub}</div>}
    </div>
  );
}

function TopOpportunityCard({ t, onClick }) {
  return (
    <div className="pxl pxl-raised" style={{ padding: 12, cursor: "pointer", minWidth: 0 }} onClick={onClick}>
      {/* Row 1: sprite + sym/sector */}
      <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 10 }}>
        <TickerSprite t={t} size={36} />
        <div className="col" style={{ minWidth: 0, flex: 1 }}>
          <div className="row gap-1" style={{ alignItems: "center" }}>
            <span style={{ fontFamily: "Silkscreen", fontSize: 13 }}>{t.sym}</span>
            <PixelHeart filled={false} size={9} />
          </div>
          <div className="t-xs faint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.sector}
          </div>
        </div>
      </div>

      {/* Row 2: verdict full-width */}
      <div style={{ marginBottom: 10 }}>
        <VerdictPill verdict={t.ai} />
      </div>

      {/* Row 3: price + delta */}
      <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <span className="font-mono" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
          ${t.price.toFixed(2)}
        </span>
        <PriceDelta pct={t.change} />
      </div>

      {/* Row 4: sparkline */}
      <div className="minigrid" style={{ padding: "2px 0", marginBottom: 10 }}>
        <Sparkline data={t.spark} width={240} height={32} />
      </div>

      {/* Row 5: upside + risk */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        paddingTop: 10,
        borderTop: "1px dashed var(--line)"
      }}>
        <div className="col gap-1">
          <span className="font-display t-xs faint">UPSIDE</span>
          <span className={`font-mono ${t.upside >= 0 ? "green" : "red"}`} style={{ fontSize: 14, fontWeight: 700 }}>
            {t.upside >= 0 ? "+" : ""}{t.upside.toFixed(1)}%
          </span>
        </div>
        <div className="col gap-1">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="font-display t-xs faint">RISK</span>
            <span className="font-display t-xs faint">{t.risk}/10</span>
          </div>
          <SegmentedBar value={t.risk} segments={10} />
        </div>
      </div>
    </div>
  );
}

function NewsRow({ n, onClick }) {
  const impactColor = n.impact === "high" ? "red" : n.impact === "med" ? "amber" : "cyan";
  return (
    <div className="row" style={{
      padding: "10px 14px",
      gap: 12,
      borderBottom: "1px solid var(--line-soft)",
      alignItems: "flex-start",
      cursor: "pointer"
    }} onClick={onClick}>
      <span className="font-mono t-xs faint" style={{ width: 44, flexShrink: 0, paddingTop: 2 }}>{n.time}</span>
      <span style={{ width: 78, flexShrink: 0, paddingTop: 1 }}>
        <PixelBadge tone={impactColor}>{n.tag}</PixelBadge>
      </span>
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--ink)" }}>{n.title}</div>
        <div className="row gap-2 mt-2" style={{ alignItems: "center" }}>
          <span className="font-display t-xs faint">{n.src}</span>
          {n.tickers.length > 0 && <span className="faint t-xs">│</span>}
          {n.tickers.map(s => (
            <span key={s} className="font-display t-xs cyan">${s}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function WatchlistRow({ t, onClick }) {
  return (
    <div className="row" style={{
      padding: "8px 12px",
      borderBottom: "1px solid var(--line-soft)",
      alignItems: "center",
      gap: 10,
      cursor: "pointer"
    }} onClick={onClick}>
      <TickerSprite t={t} size={26} />
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <div className="font-display t-sm">{t.sym}</div>
        <div className="t-xs faint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
      </div>
      <Sparkline data={t.spark} width={56} height={20} fill={false} />
      <div className="col" style={{ alignItems: "flex-end", minWidth: 72 }}>
        <span className="font-mono t-sm" style={{ fontWeight: 700 }}>${t.price.toFixed(2)}</span>
        <span className={`font-mono t-xs ${t.change >= 0 ? "green" : "red"}`}>
          {t.change >= 0 ? "+" : ""}{t.change.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

// AI Market Digest — a "reasoning" panel
function AIDigest() {
  const lines = [
    { kind: "head", text: "MARKET PULSE  ▸  GLOBAL EQUITIES" },
    { kind: "body", text: "Risk-on tone resumes after dovish Fed signaling. Cyclicals lead, defensives lag. Semi complex broad-based bid into Halocore print." },
    { kind: "head", text: "TOP-OF-MIND  ▸  AI ENSEMBLE CONSENSUS" },
    { kind: "tag",  text: "▲ ZYRA",   note: "backlog re-rate; insider buy cluster", tone: "green" },
    { kind: "tag",  text: "▲ HALO",   note: "datacenter mix upgrade post-print",   tone: "green" },
    { kind: "tag",  text: "▲ PRSM",   note: "phase-2 readout deemed underwritten", tone: "green" },
    { kind: "tag",  text: "▼ GLCH",   note: "credit cycle exposure compressing PE", tone: "red" },
    { kind: "head", text: "HEDGES   ▸  WHAT TO WATCH" },
    { kind: "body", text: "Brent +1.8% on Gulf headlines — energy-sensitive sectors at risk. VIX still bid below 16; positioning crowded long tech." }
  ];

  return (
    <div className="p-4 col gap-3">
      <div className="row gap-2" style={{ alignItems: "center" }}>
        <PixelIcon name="brain" color="var(--amber)" size={20} />
        <span className="font-display amber t-sm">DIGEST GENERATED 12:42 UTC</span>
        <span style={{ flex: 1 }} />
        <PixelBadge tone="amber">CONF 0.82</PixelBadge>
        <PixelBadge tone="cyan">12 SIGNALS</PixelBadge>
      </div>

      <div className="pxl-rule" />

      {lines.map((l, i) => {
        if (l.kind === "head") return <div key={i} className="tw-h mt-2">{l.text}</div>;
        if (l.kind === "body") return (
          <p key={i} className="t-sm" style={{ lineHeight: 1.55, color: "var(--ink)" }}>{l.text}</p>
        );
        if (l.kind === "tag") return (
          <div key={i} className="row gap-2" style={{ alignItems: "center" }}>
            <span className={`pxl-badge ${l.tone}`} style={{ width: 64, justifyContent: "center" }}>{l.text}</span>
            <span className="t-sm">{l.note}</span>
          </div>
        );
        return null;
      })}

      <div className="pxl-rule mt-2" />
      <div className="row gap-2" style={{ alignItems: "center" }}>
        <span className="font-display t-xs faint">TRACE ▸</span>
        <span className="font-mono t-xs faint">gemini-2.5 ▸ gpt-5 ▸ claude-opus-4</span>
        <span style={{ flex: 1 }} />
        <button className="pxl-btn sm">EXPAND ▾</button>
      </div>
    </div>
  );
}

// Sector allocation donut
function AllocationPanel() {
  const bp = useBreakpoint();
  const data = [
    { label: "SEMIS",       value: 28, color: "var(--cyan)" },
    { label: "AI INFRA",    value: 22, color: "var(--amber)" },
    { label: "BIOTECH",     value: 14, color: "var(--violet)" },
    { label: "RENEWABLES",  value: 12, color: "var(--green)" },
    { label: "DEFENSE",     value: 10, color: "var(--red)" },
    { label: "OTHER",       value: 14, color: "var(--ink-faint)" }
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{
        display: "flex",
        flexDirection: bp.mobile ? "column" : "row",
        alignItems: "center",
        gap: 16
      }}>
        <PixelDonut
          data={data}
          size={140}
          thickness={20}
          center={
            <div className="col" style={{ alignItems: "center", lineHeight: 1.1 }}>
              <span className="font-display t-xs faint">SECTORS</span>
              <span className="font-mono" style={{ fontSize: 24, fontWeight: 700, color: "var(--amber)" }}>06</span>
              <span className="font-display t-xs faint">ACTIVE</span>
            </div>
          }
        />
        <div className="col gap-2" style={{ flex: 1, width: "100%" }}>
          {data.map(d => (
            <div key={d.label} className="row gap-2" style={{ alignItems: "center" }}>
              <span style={{ width: 10, height: 10, background: d.color, flexShrink: 0 }} />
              <span className="font-display t-xs" style={{ flex: 1 }}>{d.label}</span>
              <span className="font-mono t-xs" style={{ fontWeight: 700 }}>{d.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.AIDigest = AIDigest;
window.AllocationPanel = AllocationPanel;

function Dashboard({ onNav, loading = false }) {
  const [category, setCategory] = useStateD("yolo");
  const [now, setNow] = useStateD(new Date());
  const bp = useBreakpoint();

  useEffectD(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const m = window.MOCK;

  // Responsive grid templates
  const statCols = bp.mobile ? "repeat(2, 1fr)" : bp.tablet ? "repeat(3, 1fr)" : "repeat(6, 1fr)";
  const oppCols  = bp.mobile ? "1fr"           : bp.tablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)";
  const splitCols = bp.mobile ? "1fr" : bp.tablet ? "1fr" : "1fr 320px";
  const splitColsB = bp.mobile ? "1fr" : bp.tablet ? "1fr" : "1fr 380px";
  const pageGutter = bp.mobile ? "0 12px" : "0 20px";

  // Filter top opportunities
  const allBuys = m.tickers.filter(t => ["STRONG BUY", "NO BRAINER", "SPECULATIVE"].includes(t.ai));
  const oppMap = {
    yolo: m.tickers.filter(t => ["SPECULATIVE", "NO BRAINER", "STRONG BUY"].includes(t.ai)).sort((a, b) => b.upside - a.upside).slice(0, 4),
    classic: m.tickers.filter(t => ["STRONG BUY", "NO BRAINER"].includes(t.ai) && t.risk <= 4).slice(0, 4),
    shorts: m.tickers.filter(t => t.ai === "SELL").concat(m.tickers.filter(t => t.ai === "HOLD" && t.change < 0)).slice(0, 4)
  };
  const opps = oppMap[category];

  return (
    <div className="col" style={{ gap: 16 }}>
      {/* Market ticker tape */}
      <MarketTicker />

      <div style={{ padding: pageGutter, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Hero stats row */}
        <div style={{ display: "grid", gridTemplateColumns: statCols, gap: 10 }}>
          {loading ? (
            <>
              <StatTileSkel /><StatTileSkel /><StatTileSkel />
              <StatTileSkel /><StatTileSkel /><StatTileSkel />
            </>
          ) : (
          <>
          <StatTile
            label="MY PORTFOLIO"
            value={`$${(m.portfolio.value / 1000).toFixed(1)}K`}
            sub={<PriceDelta pct={m.portfolio.gainPct} />}
            icon="wallet"
            tone="cyan"
            onClick={() => onNav("portfolio")}
          />
          <StatTile
            label="STRONG BUY"
            value={m.tickers.filter(t => ["STRONG BUY", "NO BRAINER"].includes(t.ai)).length.toString().padStart(3, "0")}
            sub={<span className="font-display t-xs green">▲ +4 TODAY</span>}
            icon="bolt"
            tone="green"
            onClick={() => onNav("analyzer")}
          />
          <StatTile
            label="SELL"
            value={m.tickers.filter(t => t.ai === "SELL").length.toString().padStart(3, "0")}
            sub={<span className="font-display t-xs red">▼ -2 TODAY</span>}
            icon="bear"
            tone="red"
            onClick={() => onNav("analyzer")}
          />
          <StatTile
            label="TRACKED"
            value="1,284"
            sub={<span className="font-display t-xs faint">+ 12 NEW</span>}
            icon="chart"
            tone="cyan"
            onClick={() => onNav("analyzer")}
          />
          <StatTile
            label="AI REPORTS"
            value="48"
            sub={<span className="font-display t-xs amber">LAST 24H</span>}
            icon="brain"
            tone="amber"
            onClick={() => onNav("research")}
          />
          <StatTile
            label="ALERTS"
            value="03"
            sub={<span className="font-display t-xs amber">2 TRIGGERED</span>}
            icon="bell"
            tone="amber"
            onClick={() => onNav("alerts")}
          />
          </>
          )}
        </div>

        {/* Top Opportunities + Watchlist split */}
        <div style={{ display: "grid", gridTemplateColumns: splitCols, gap: 16 }}>
          <PixelPanel
            title="TOP OPPORTUNITIES"
            accent="green"
            actions={
              <div style={{ display: "flex", gap: 0 }}>
                {[
                  ["yolo", "YOLO"],
                  ["classic", "CLASSIC"],
                  ["shorts", "SHORTS"]
                ].map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => setCategory(k)}
                    className="pxl-btn sm ghost"
                    style={{
                      color: category === k ? "var(--amber)" : "var(--ink-dim)",
                      borderColor: category === k ? "var(--amber)" : "transparent",
                      background: category === k ? "rgba(255,194,60,0.08)" : "transparent"
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            }
          >
            <div style={{
              display: "grid",
              gridTemplateColumns: oppCols,
              gap: 12,
              padding: 12
            }}>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <OpportunityCardSkel key={i} />)
                : opps.map(t => (
                    <TopOpportunityCard key={t.sym} t={t} onClick={() => onNav("ticker", t)} />
                  ))}
            </div>
          </PixelPanel>

          <PixelPanel
            title="WATCHLIST"
            accent="amber"
            actions={loading
              ? <Spinner label="SYNCING" />
              : <span className="font-display t-xs faint">{m.tickers.length} SYMBOLS</span>}
            scroll
            height={bp.mobile ? 360 : "100%"}
          >
            {loading
              ? Array.from({ length: 7 }).map((_, i) => <WatchlistRowSkel key={i} />)
              : m.tickers.slice(0, 9).map(t => (
                  <WatchlistRow key={t.sym} t={t} onClick={() => onNav("ticker", t)} />
                ))}
          </PixelPanel>
        </div>

        {/* News + AI Digest + Allocation */}
        <div style={{ display: "grid", gridTemplateColumns: splitColsB, gap: 16, marginBottom: 16 }}>
          <PixelPanel
            title="AI MARKET DIGEST"
            accent="amber"
            actions={
              <span className="row gap-2" style={{ alignItems: "center" }}>
                <StatusLED tone="amber" label={loading ? "GENERATING" : "REASONING"} />
                <span className="sticker">v3.4</span>
              </span>
            }
          >
            {loading ? <AIDigestSkel /> : <AIDigest />}
          </PixelPanel>

          <PixelPanel title="PORTFOLIO // ALLOCATION" accent="green"
            actions={loading && <Spinner />}
          >
            {loading ? (
              <div style={{ padding: 24 }}>
                <DonutSkel size={140} />
                <div className="col gap-2 mt-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="row gap-2" style={{ alignItems: "center" }}>
                      <Skel w={12} h={12} />
                      <Skel w="35%" h={9} />
                      <div style={{ flex: 1 }} />
                      <Skel w={32} h={9} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <AllocationPanel />
                <div className="pxl-rule" style={{ margin: "0 16px" }} />
                <div className="p-4 col gap-2">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="font-display t-xs faint">TOTAL VALUE</span>
                    <span className="font-mono" style={{ fontWeight: 700 }}>${(m.portfolio.value).toLocaleString()}</span>
                  </div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="font-display t-xs faint">DAY P&amp;L</span>
                    <span className="font-mono green" style={{ fontWeight: 700 }}>+$2,118.42</span>
                  </div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="font-display t-xs faint">ALL-TIME</span>
                    <span className="font-mono green" style={{ fontWeight: 700 }}>+{m.portfolio.gainPct.toFixed(2)}%</span>
                  </div>
                </div>
              </>
            )}
          </PixelPanel>
        </div>

        {/* Live news + Positions */}
        <div style={{ display: "grid", gridTemplateColumns: splitColsB, gap: 16, marginBottom: 24 }}>
          <PixelPanel
            title="NEWS FEED // LIVE"
            accent="cyan"
            actions={
              <span className="row gap-2" style={{ alignItems: "center" }}>
                <StatusLED tone={loading ? "amber" : "green"} label={loading ? "FETCHING" : "14.2 ITEMS/MIN"} />
                <span className="pxl-badge cyan">ALL</span>
                <span className="pxl-badge">MACRO</span>
                <span className="pxl-badge">EARNINGS</span>
              </span>
            }
          >
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <NewsRowSkel key={i} />)
              : m.news.map((n, i) => <NewsRow key={i} n={n} />)}
          </PixelPanel>

          <PixelPanel
            title="PORTFOLIO // POSITIONS"
            accent="green"
            actions={
              <span className="font-mono t-xs">
                <span className="green">+{m.portfolio.gainPct}%</span>
              </span>
            }
          >
            {loading ? (
              <div style={{ padding: 12 }}>
                <table className="pxl-table">
                  <thead>
                    <tr><th>SYM</th><th className="num">QTY</th><th className="num">LAST</th><th className="num">P&amp;L</th></tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 5 }).map((_, i) => <TableRowSkel key={i} cols={4} />)}
                  </tbody>
                </table>
              </div>
            ) : (
            <table className="pxl-table">
              <thead>
                <tr>
                  <th>SYM</th>
                  <th className="num">QTY</th>
                  <th className="num">LAST</th>
                  <th className="num">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {m.portfolio.positions.map(p => {
                  const tk = m.tickers.find(x => x.sym === p.sym);
                  return (
                    <tr key={p.sym}>
                      <td>
                        <div className="row gap-2" style={{ alignItems: "center" }}>
                          {tk && <TickerSprite t={tk} size={22} />}
                          <span className="font-display t-sm">{p.sym}</span>
                        </div>
                      </td>
                      <td className="num">{p.qty}</td>
                      <td className="num">${p.last.toFixed(2)}</td>
                      <td className="num">
                        <span className={p.pnl >= 0 ? "green" : "red"} style={{ fontWeight: 700 }}>
                          {p.pnl >= 0 ? "+" : ""}{(p.pnl / 1000).toFixed(1)}K
                        </span>
                        <div className={`t-xs ${p.pnl >= 0 ? "green" : "red"}`} style={{ opacity: 0.7 }}>
                          {p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(1)}%
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </PixelPanel>
        </div>

      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
window.MarketTicker = MarketTicker;

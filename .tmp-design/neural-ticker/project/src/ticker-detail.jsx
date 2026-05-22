// Ticker detail view — pixel terminal deep-dive
const { useState: useStateT } = React;

function TickerDetail({ t, onBack }) {
  const [tab, setTab] = useStateT("overview");
  const bp = useBreakpoint();
  const m = window.MOCK;
  const v = m.aiVerdict;

  const high = Math.max(...t.candles.map(c => c.h));
  const low = Math.min(...t.candles.map(c => c.l));

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
        <button className="pxl-btn sm"><PixelIcon name="bell" size={8} color="currentColor" /> {!bp.mobile && "ALERT"}</button>
        <button className="pxl-btn sm" style={{ color: "var(--amber)", borderColor: "var(--amber-dark)" }}>
          <PixelIcon name="star" size={8} color="currentColor" /> {!bp.mobile && "WATCHLIST"}
        </button>
        <button className="pxl-btn sm primary">+ BUY</button>
      </div>

      {/* HERO — identity, price, verdict */}
      <div className="pxl pxl-raised" style={{ padding: bp.mobile ? 14 : 20 }}>
        <div className="row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          {/* Left: logo + identity */}
          <div className="row gap-3" style={{ alignItems: "center" }}>
            <TickerSprite t={t} size={bp.mobile ? 44 : 56} />
            <div className="col gap-1">
              <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "Silkscreen", fontSize: bp.mobile ? 20 : 24, letterSpacing: "0.02em" }}>{t.sym}</span>
                <VerdictPill verdict={t.ai} />
              </div>
              <div className="t-sm dim">{t.name}</div>
              <div className="row gap-2 mt-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
                <PixelBadge>{t.sector}</PixelBadge>
                <PixelBadge tone="cyan">MARKET OPEN</PixelBadge>
                {!bp.mobile && <PixelBadge tone="amber">EARNINGS IN 12 D</PixelBadge>}
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Right: price block */}
          <div className="col" style={{ alignItems: bp.mobile ? "flex-start" : "flex-end", gap: 6, width: bp.mobile ? "100%" : "auto" }}>
            <div className="row gap-3" style={{ alignItems: "baseline" }}>
              <span className="font-mono" style={{ fontSize: bp.mobile ? 36 : 48, fontWeight: 700, letterSpacing: "-0.04em" }}>
                ${t.price.toFixed(2)}
              </span>
              <PriceDelta pct={t.change} />
            </div>
            <div className="row gap-3 t-xs faint">
              <span><span className="dim">OPEN</span> <span className="font-mono ink">${(t.price - t.change * 0.6).toFixed(2)}</span></span>
              <span><span className="dim">VOL</span> <span className="font-mono ink">12.4M</span></span>
              <span><span className="dim">AVG</span> <span className="font-mono ink">9.2M</span></span>
            </div>
          </div>
        </div>

        {/* Lower row: range + risk breakdown */}
        <div style={{
          display: "grid",
          gridTemplateColumns: heroGrid,
          gap: 20,
          marginTop: 20,
          paddingTop: 16,
          borderTop: "2px dashed var(--line)"
        }}>
          <div className="col gap-2">
            <span className="font-display t-xs faint">52W RANGE</span>
            <RangeBar low={low * 0.85} high={high * 1.15} current={t.price} />
          </div>

          <div className="col gap-2">
            <span className="font-display t-xs faint">RISK BREAKDOWN</span>
            <div className="col gap-1">
              {[
                ["FINANCIAL", v.risks.financial],
                ["EXECUTION", v.risks.execution],
                ["DILUTION", v.risks.dilution],
                ["COMPETITIVE", v.risks.competitive],
                ["REGULATORY", v.risks.regulatory]
              ].map(([lbl, val]) => (
                <div key={lbl} className="row gap-2" style={{ alignItems: "center" }}>
                  <span className="font-display t-xs faint" style={{ width: 90 }}>{lbl}</span>
                  <div style={{ flex: 1 }}><SegmentedBar value={val} segments={10} /></div>
                  <span className="font-mono t-xs" style={{ width: 24, textAlign: "right" }}>{val}/10</span>
                </div>
              ))}
            </div>
          </div>

          <div className="col gap-2">
            <span className="font-display t-xs faint">FUNDAMENTALS</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
              {[
                ["MKT CAP", t.mc],
                ["P/E TTM", t.pe ? t.pe.toFixed(1) : "—"],
                ["DIV YLD", "0.00%"],
                ["BETA", "1.24"],
                ["EPS", "$4.82"],
                ["FCF", "$312M"]
              ].map(([lbl, val]) => (
                <div key={lbl} className="pxl-inset" style={{ padding: "6px 8px" }}>
                  <div className="font-display t-xs faint">{lbl}</div>
                  <div className="font-mono t-sm" style={{ fontWeight: 700 }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
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
                  <button key={p} className="pxl-btn sm ghost"
                    style={{ color: p === "1M" ? "var(--amber)" : "var(--ink-dim)", borderColor: p === "1M" ? "var(--amber)" : "transparent" }}>
                    {p}
                  </button>
                ))}
              </span>
            }
          >
            <div style={{ padding: 12, overflowX: "auto" }}>
              <CandleChart candles={t.candles} width={chartW} height={bp.mobile ? 200 : 260} />
              <VolumeBars candles={t.candles} width={chartW} height={bp.mobile ? 48 : 60} />
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
            {m.news.filter(n => n.tickers.includes(t.sym) || n.tickers.length === 0).slice(0, 5).map((n, i) => (
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
  const reports = [
    { date: "2026-05-18", model: "GEMINI-2.5 / ENSEMBLE", quality: "DEEP", verdict: "STRONG BUY", tokens: "184K", by: "you" },
    { date: "2026-05-12", model: "GPT-5 / SOLO", quality: "HIGH", verdict: "STRONG BUY", tokens: "92K", by: "you" },
    { date: "2026-05-02", model: "ENSEMBLE", quality: "DEEP", verdict: "NO BRAINER", tokens: "212K", by: "kai_77" },
    { date: "2026-04-20", model: "GEMINI / SOLO", quality: "MEDIUM", verdict: "STRONG BUY", tokens: "56K", by: "you" }
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: bp?.mobile ? "1fr" : "1fr 320px", gap: 16 }}>
      <PixelPanel title="LATEST REPORT" accent="amber"
        actions={<span className="sticker">DEEP // ENSEMBLE</span>}
      >
        <div style={{ padding: 18 }}>
          <div className="row gap-3 mb-3" style={{ alignItems: "center" }}>
            <PixelIcon name="brain" color="var(--amber)" size={16} />
            <span className="font-display amber">ANALYST CHAIN: GEMINI-2.5 PRO ▸ GPT-5 ▸ CLAUDE OPUS</span>
            <span className="t-xs faint">2026-05-18 12:42:11</span>
          </div>

          <div className="row gap-2 mb-3 font-display t-xs">
            <PixelBadge tone="amber">CONFIDENCE 0.84</PixelBadge>
            <PixelBadge tone="cyan">COVERAGE: 12 SOURCES</PixelBadge>
            <PixelBadge>184,221 TOKENS</PixelBadge>
          </div>

          <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
            <span className="amber font-display t-sm">▸ THESIS.</span> Zyra has converted a multi-year R&amp;D
            cycle into a tangible product surface with the Helix-7 actuator platform. The order book
            extension implies revenue visibility into Q2-FY27, while a softening lithium curve and
            improved supplier yield expand gross margin. <span className="cyan">Insider buying</span> in
            the most recent window suggests management conviction is rising into the print.
          </p>

          <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
            <span className="amber font-display t-sm">▸ CATALYSTS.</span> Q3 print (June 12), Helix-7
            volume ramp shareholder day (July 8), and the EU-MERIDIAN logistics contract decision
            (expected Q3). Each is a discrete leg on the path to the base case of $218.
          </p>

          <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
            <span className="red font-display t-sm">▸ RISKS.</span> China revenue exposure (~22%) is
            the cleanest downside vector; a re-roll in regional PMI below 48 historically compresses
            the multiple by 3-4x. Forward valuation premium is also non-trivial — bear case discounts
            to a 22x exit.
          </p>

          <div className="pxl-inset" style={{ padding: 12 }}>
            <span className="font-display t-xs amber">CHAT WITH THIS REPORT</span>
            <div className="row gap-2 mt-2">
              <input type="text" className="pxl-input" placeholder="> ask follow-up..." style={{ paddingLeft: 10 }} />
              <button className="pxl-btn primary">RUN</button>
            </div>
          </div>
        </div>
      </PixelPanel>

      <PixelPanel title="REPORT HISTORY" accent="cyan"
        actions={<button className="pxl-btn sm primary">+ NEW</button>}
      >
        <div className="col">
          {reports.map((r, i) => (
            <div key={i} className="col gap-1" style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--line-soft)",
              cursor: "pointer"
            }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <span className="font-mono t-xs faint">{r.date}</span>
                <VerdictPill verdict={r.verdict} />
              </div>
              <div className="font-display t-xs">{r.model}</div>
              <div className="row gap-2 t-xs faint">
                <PixelBadge tone={r.quality === "DEEP" ? "amber" : "cyan"}>{r.quality}</PixelBadge>
                <span>{r.tokens}</span>
                <span>·</span>
                <span>@{r.by}</span>
              </div>
            </div>
          ))}
        </div>
      </PixelPanel>
    </div>
  );
}

function FinancialsTab({ t, bp }) {
  const years = ["FY22", "FY23", "FY24", "FY25E"];
  const rows = [
    { label: "REVENUE",      vals: ["$2.84B", "$3.92B", "$5.21B", "$6.84B"] },
    { label: "GROSS PROFIT", vals: ["$1.04B", "$1.61B", "$2.34B", "$3.21B"] },
    { label: "GROSS MARGIN", vals: ["36.6%",  "41.1%",  "44.9%",  "46.9%"] },
    { label: "OP INCOME",    vals: ["-$120M", "$84M",   "$412M",  "$612M"] },
    { label: "NET INCOME",   vals: ["-$210M", "$22M",   "$304M",  "$498M"] },
    { label: "EPS DILUTED",  vals: ["-$1.20", "$0.13",  "$1.75",  "$2.84"] },
    { label: "FCF",          vals: ["-$92M",  "$48M",   "$224M",  "$312M"] },
    { label: "CASH",         vals: ["$612M",  "$840M",  "$1.04B", "$1.22B"] },
    { label: "DEBT",         vals: ["$480M",  "$420M",  "$380M",  "$340M"] }
  ];

  const bars = [
    { y: "FY22", v: 2.84 }, { y: "FY23", v: 3.92 },
    { y: "FY24", v: 5.21 }, { y: "FY25E", v: 6.84 }
  ];
  const maxV = Math.max(...bars.map(b => b.v));

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
          <div style={{ padding: 20, display: "flex", gap: 16, alignItems: "flex-end", height: 220 }}>
            {bars.map((b, i) => {
              const h = (b.v / maxV) * 160;
              const isE = b.y.endsWith("E");
              return (
                <div key={i} className="col" style={{ flex: 1, alignItems: "center", gap: 6 }}>
                  <span className="font-mono t-xs amber">${b.v.toFixed(2)}B</span>
                  <div style={{
                    width: "100%",
                    height: h,
                    background: isE ? "var(--amber)" : "var(--green)",
                    border: "2px solid var(--line)",
                    boxShadow: "inset 0 4px 0 0 rgba(255,255,255,0.1), inset 0 -4px 0 0 rgba(0,0,0,0.2)"
                  }} />
                  <span className="font-display t-xs faint">{b.y}</span>
                </div>
              );
            })}
          </div>
        </PixelPanel>

        <PixelPanel title="ANALYST CONSENSUS" accent="amber">
          <div style={{ padding: 16 }}>
            <div className="col gap-2">
              {[
                ["STRONG BUY", 18, "green"],
                ["BUY", 9, "green"],
                ["HOLD", 4, "cyan"],
                ["SELL", 1, "red"],
                ["STRONG SELL", 0, "red"]
              ].map(([lbl, n, c]) => (
                <div key={lbl} className="row gap-2" style={{ alignItems: "center" }}>
                  <span className="font-display t-xs" style={{ width: 96, color: `var(--${c})` }}>{lbl}</span>
                  <div style={{ flex: 1, height: 12, background: "var(--bg-0)", border: "2px solid var(--line)", position: "relative" }}>
                    <div style={{ width: `${(n / 18) * 100}%`, height: "100%", background: `var(--${c})` }} />
                  </div>
                  <span className="font-mono t-xs" style={{ width: 24, textAlign: "right" }}>{n.toString().padStart(2, "0")}</span>
                </div>
              ))}
            </div>
            <div className="pxl-rule" style={{ margin: "14px 0" }} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="font-display t-xs faint">PRICE TARGET (MEAN)</span>
              <span className="font-mono t-base" style={{ fontWeight: 700 }} >$214.50</span>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

function SocialTab({ t, bp }) {
  const posts = [
    { user: "kai_77", time: "12m", tone: "bull", text: "Long ZYRA into print. Backlog disclosure on the Q is the line in the sand. Looking for 28%+ GM commentary.", likes: 42 },
    { user: "macroratter", time: "1h", tone: "bear", text: "Capex sensitivity here is non-trivial — if ISM new orders re-roll, the multiple compresses fast. Sized small.", likes: 18 },
    { user: "helix.fund", time: "3h", tone: "bull", text: "Helix-7 is a real platform shift. Pricing power into 2027 looks underwritten by the order book.", likes: 91 },
    { user: "ts_quant", time: "5h", tone: "neutral", text: "Cup-and-handle on the daily, breakout level $192 with volume confirmation. Watching the close.", likes: 31 }
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: bp?.mobile ? "1fr" : "1fr 320px", gap: 16 }}>
      <PixelPanel title="COMMUNITY DISCUSSION" accent="cyan">
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
        {posts.map((p, i) => {
          const toneColor = p.tone === "bull" ? "green" : p.tone === "bear" ? "red" : "cyan";
          return (
            <div key={i} className="col gap-2" style={{ padding: 14, borderBottom: "1px solid var(--line-soft)" }}>
              <div className="row gap-2" style={{ alignItems: "center" }}>
                <div style={{
                  width: 24, height: 24, background: `var(--${toneColor}-dark)`,
                  border: `2px solid var(--${toneColor})`,
                  fontFamily: "Silkscreen", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center"
                }}>{p.user.slice(0, 2).toUpperCase()}</div>
                <span className="font-display t-xs">@{p.user}</span>
                <PixelBadge tone={toneColor}>{p.tone.toUpperCase()}</PixelBadge>
                <span className="t-xs faint">{p.time} ago</span>
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

      <PixelPanel title="UPCOMING EVENTS" accent="amber">
        {[
          { date: "JUN 12", label: "Q3 EARNINGS PRINT", tag: "EARNINGS", tone: "amber" },
          { date: "JUN 24", label: "ANALYST DAY — HELIX-7 RAMP", tag: "INVESTOR", tone: "cyan" },
          { date: "JUL 08", label: "EU-MERIDIAN CONTRACT DECISION", tag: "CATALYST", tone: "green" },
          { date: "JUL 22", label: "EX-DIVIDEND — $0.24", tag: "DIV", tone: "cyan" },
          { date: "AUG 04", label: "OPTIONS EXPIRATION", tag: "OPTIONS", tone: "default" }
        ].map((e, i) => (
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

window.TickerDetail = TickerDetail;

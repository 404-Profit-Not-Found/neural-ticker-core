// Stock Analyzer / Screener
const { useState: useStateA, useMemo: useMemoA } = React;

function Analyzer({ onNav }) {
  const m = window.MOCK;
  const bp = useBreakpoint();
  const [search, setSearch] = useStateA("");
  const [filter, setFilter] = useStateA("ALL");
  const [sort, setSort] = useStateA({ key: "upside", dir: "desc" });

  const filtered = useMemoA(() => {
    let list = [...m.tickers];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(t => t.sym.toLowerCase().includes(s) || t.name.toLowerCase().includes(s));
    }
    if (filter === "BUY") list = list.filter(t => ["STRONG BUY", "NO BRAINER"].includes(t.ai));
    if (filter === "SPEC") list = list.filter(t => t.ai === "SPECULATIVE");
    if (filter === "HOLD") list = list.filter(t => t.ai === "HOLD");
    if (filter === "SELL") list = list.filter(t => t.ai === "SELL");
    list.sort((a, b) => {
      const k = sort.key;
      const av = a[k] ?? 0, bv = b[k] ?? 0;
      return sort.dir === "desc" ? bv - av : av - bv;
    });
    return list;
  }, [m.tickers, search, filter, sort]);

  const toggleSort = (k) => {
    setSort(s => s.key === k ? { key: k, dir: s.dir === "desc" ? "asc" : "desc" } : { key: k, dir: "desc" });
  };

  return (
    <div style={{ padding: bp.mobile ? "0 12px 24px" : "0 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, padding: "12px 0" }}>
        <span className="font-display t-xs faint">{bp.mobile ? "ANALYZER" : "TERMINAL ▸ ANALYZER"}</span>
        <div style={{ flex: 1 }} />
        <span className="font-display t-xs faint">{filtered.length}/{m.tickers.length}</span>
      </div>

      {/* Filter bar */}
      <div className="pxl pxl-raised p-3" style={{
        display: "grid",
        gridTemplateColumns: bp.mobile ? "1fr" : "1.4fr 1fr 1fr 1fr",
        gap: 12
      }}>
        <div className="col gap-2">
          <span className="font-display t-xs faint">SEARCH</span>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
              <PixelIcon name="search" color="var(--ink-faint)" size={16} />
            </span>
            <input
              className="pxl-input"
              placeholder="symbol or company..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="col gap-2">
          <span className="font-display t-xs faint">AI RATING</span>
          <div className="row gap-1">
            {["ALL", "BUY", "SPEC", "HOLD", "SELL"].map(f => (
              <button
                key={f}
                className="pxl-btn sm"
                onClick={() => setFilter(f)}
                style={{
                  color: filter === f ? "var(--amber)" : "var(--ink-dim)",
                  borderColor: filter === f ? "var(--amber)" : "var(--line)",
                  background: filter === f ? "rgba(255,194,60,0.08)" : "var(--bg-2)"
                }}
              >{f}</button>
            ))}
          </div>
        </div>
        <div className="col gap-2">
          <span className="font-display t-xs faint">RISK ≤</span>
          <div className="row gap-1">
            {[3, 5, 7, 10].map(r => (
              <button key={r} className="pxl-btn sm" style={{ minWidth: 38, justifyContent: "center" }}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="col gap-2">
          <span className="font-display t-xs faint">MKT CAP</span>
          <div className="row gap-1">
            {["ALL", "MEGA", "LRG", "MID", "SML"].map(c => (
              <button key={c} className="pxl-btn sm">{c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <PixelPanel title="SCREENER RESULTS" accent="green">
        {bp.mobile ? (
          <div className="col">
            {filtered.map(t => (
              <div key={t.sym}
                onClick={() => onNav("ticker", t)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 10,
                  padding: 12,
                  borderBottom: "1px solid var(--line-soft)",
                  cursor: "pointer",
                  alignItems: "center"
                }}
              >
                <TickerSprite t={t} size={32} />
                <div className="col gap-1" style={{ minWidth: 0 }}>
                  <div className="row gap-2" style={{ alignItems: "center" }}>
                    <span className="font-display t-sm">{t.sym}</span>
                    <VerdictPill verdict={t.ai} />
                  </div>
                  <div className="t-xs faint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.sector}
                  </div>
                  <div className="row gap-2 mt-2" style={{ alignItems: "center" }}>
                    <span className="font-display t-xs faint" style={{ width: 44 }}>UPSIDE</span>
                    <span className={`font-mono t-xs ${t.upside >= 0 ? "green" : "red"}`} style={{ fontWeight: 700, width: 56 }}>
                      {t.upside >= 0 ? "+" : ""}{t.upside.toFixed(1)}%
                    </span>
                    <div style={{ flex: 1 }}>
                      <SegmentedBar value={t.risk} segments={8} />
                    </div>
                  </div>
                </div>
                <div className="col" style={{ alignItems: "flex-end", gap: 4 }}>
                  <span className="font-mono t-sm" style={{ fontWeight: 700 }}>${t.price.toFixed(2)}</span>
                  <PriceDelta pct={t.change} />
                  <Sparkline data={t.spark} width={64} height={20} fill={false} />
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div style={{ overflowX: "auto" }}>
        <table className="pxl-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort("sym")} style={{ cursor: "pointer" }}>
                SYMBOL {sort.key === "sym" && (sort.dir === "desc" ? "▼" : "▲")}
              </th>
              <th>SECTOR</th>
              <th>AI VERDICT</th>
              <th className="num" onClick={() => toggleSort("price")} style={{ cursor: "pointer" }}>
                PRICE {sort.key === "price" && (sort.dir === "desc" ? "▼" : "▲")}
              </th>
              <th className="num" onClick={() => toggleSort("change")} style={{ cursor: "pointer" }}>
                CHG % {sort.key === "change" && (sort.dir === "desc" ? "▼" : "▲")}
              </th>
              <th className="num" onClick={() => toggleSort("upside")} style={{ cursor: "pointer" }}>
                UPSIDE {sort.key === "upside" && (sort.dir === "desc" ? "▼" : "▲")}
              </th>
              <th>RISK</th>
              <th className="num">MKT CAP</th>
              <th className="num">P/E</th>
              <th>CHART (30D)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.sym} onClick={() => onNav("ticker", t)}>
                <td>
                  <div className="row gap-2" style={{ alignItems: "center" }}>
                    <TickerSprite t={t} size={22} />
                    <span className="font-display t-sm">{t.sym}</span>
                  </div>
                </td>
                <td className="t-xs faint">{t.sector}</td>
                <td><VerdictPill verdict={t.ai} /></td>
                <td className="num" style={{ fontWeight: 700 }}>${t.price.toFixed(2)}</td>
                <td className={`num ${t.change >= 0 ? "green" : "red"}`} style={{ fontWeight: 700 }}>
                  {t.change >= 0 ? "+" : ""}{t.change.toFixed(2)}%
                </td>
                <td className={`num ${t.upside >= 0 ? "green" : "red"}`} style={{ fontWeight: 700 }}>
                  {t.upside >= 0 ? "+" : ""}{t.upside.toFixed(1)}%
                </td>
                <td style={{ width: 110 }}>
                  <div className="row gap-2" style={{ alignItems: "center" }}>
                    <div style={{ flex: 1 }}><SegmentedBar value={t.risk} segments={10} /></div>
                    <span className="font-mono t-xs" style={{ width: 24, textAlign: "right" }}>{t.risk}</span>
                  </div>
                </td>
                <td className="num faint">{t.mc}</td>
                <td className="num faint">{t.pe ? t.pe.toFixed(1) : "—"}</td>
                <td><Sparkline data={t.spark} width={80} height={24} fill={false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        )}
      </PixelPanel>
    </div>
  );
}

window.Analyzer = Analyzer;

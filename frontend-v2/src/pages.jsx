// Real-data pages for /research, /portfolio, /alerts, /news routes.
// Replaces the static PlaceholderPage shells in app.jsx.
const { useState: useStatePg, useEffect: useEffectPg, useMemo: useMemoPg } = React;

// ─────────────────────────────────────────────────────────────────
// PortfolioPage — full positions table + totals + sector breakdown
// ─────────────────────────────────────────────────────────────────
function PortfolioPage({ onNav }) {
  const bp = useBreakpoint();
  const [currency, setCurrency] = useStatePg(() => {
    try { return localStorage.getItem("v2_portfolio_currency") || ""; } catch (e) { return ""; }
  });
  const [positions, posMeta] = window.useApi(
    () => window.API.portfolio(currency || undefined),
    [currency],
  );
  const items = Array.isArray(positions) ? positions : [];
  const [editing, setEditing] = useStatePg(null);

  useEffectPg(() => {
    try { localStorage.setItem("v2_portfolio_currency", currency); } catch (e) {}
  }, [currency]);

  const removePosition = async (id, sym, evt) => {
    evt.stopPropagation();
    if (!confirm(`Remove ${sym} position?`)) return;
    await window.API.portfolioDelete(id).catch(() => null);
    posMeta?.reload?.();
  };

  const editPosition = (p, evt) => {
    evt.stopPropagation();
    setEditing(p);
  };

  const totals = useMemoPg(() => {
    let value = 0, cost = 0;
    for (const p of items) {
      value += Number(p.current_value ?? 0);
      cost  += Number(p.cost_basis ?? 0);
    }
    const gain = value - cost;
    const gainPct = cost ? (gain / cost) * 100 : 0;
    return { value, cost, gain, gainPct };
  }, [items]);

  const sectorBreakdown = useMemoPg(() => {
    const map = new Map();
    for (const p of items) {
      const sec = p.ticker?.finnhub_industry || p.ticker?.sector || "OTHER";
      map.set(sec, (map.get(sec) || 0) + Number(p.current_value ?? 0));
    }
    const colors = ["var(--cyan)", "var(--amber)", "var(--green)", "var(--violet)", "var(--red)", "var(--ink-faint)"];
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({
        label: label.toUpperCase().slice(0, 14),
        value: Math.round((value / (totals.value || 1)) * 100),
        color: colors[i % colors.length],
      }));
  }, [items, totals.value]);

  return (
    <div style={{ padding: bp.mobile ? "0 12px 24px" : "0 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, padding: "12px 0" }}>
        <span className="font-display t-xs faint">TERMINAL ▸ PORTFOLIO</span>
        <div style={{ flex: 1 }} />
        <span className="font-display t-xs faint">DISPLAY</span>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          style={{
            background: "var(--bg-0)",
            color: "var(--ink)",
            border: "2px solid var(--line)",
            fontFamily: "Silkscreen, monospace",
            fontSize: 10,
            letterSpacing: "0.06em",
            padding: "4px 6px",
          }}
          title="Show portfolio in this currency"
        >
          <option value="">NATIVE</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="CHF">CHF</option>
          <option value="JPY">JPY</option>
        </select>
        <span className="font-display t-xs faint">{items.length} POSITIONS</span>
      </div>

      {editing && (
        <EditPositionDialog
          position={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); posMeta?.reload?.(); }}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "repeat(4, 1fr)", gap: 10 }}>
        <KPI label="TOTAL VALUE"  value={`$${totals.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tone="cyan" />
        <KPI label="COST BASIS"   value={`$${totals.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tone="ink" />
        <KPI label="UNREALIZED"   value={`${totals.gain >= 0 ? "+" : ""}$${totals.gain.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tone={totals.gain >= 0 ? "green" : "red"} />
        <KPI label="ALL-TIME"     value={`${totals.gainPct >= 0 ? "+" : ""}${totals.gainPct.toFixed(2)}%`} tone={totals.gainPct >= 0 ? "green" : "red"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "1fr 320px", gap: 16 }}>
        <PixelPanel title="POSITIONS" accent="green">
          {posMeta.loading && items.length === 0 ? (
            <div style={{ padding: 24 }}><SkelBar segments={12} /></div>
          ) : items.length === 0 ? (
            <EmptyState title="NO POSITIONS" subtitle="Add your first position in the main app." />
          ) : (
            <table className="pxl-table">
              <thead>
                <tr>
                  <th>SYM</th>
                  <th>SECTOR</th>
                  <th className="num">QTY</th>
                  <th className="num">AVG</th>
                  <th className="num">LAST</th>
                  <th className="num">VALUE</th>
                  <th className="num">P&amp;L</th>
                  <th className="num">%</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const sym = p.symbol || p.ticker?.symbol;
                  const qty = Number(p.shares ?? 0);
                  const buy = Number(p.buy_price ?? 0);
                  const last = Number(p.current_price ?? p.latestPrice?.close ?? 0);
                  const val = Number(p.current_value ?? 0);
                  const pnl = Number(p.gain_loss ?? 0);
                  const pct = Number(p.gain_loss_percent ?? 0);
                  const sec = p.ticker?.finnhub_industry || p.ticker?.sector || "—";
                  return (
                    <tr key={p.id} onClick={() => onNav("ticker", normalizePositionToTicker(p))}>
                      <td>
                        <div className="row gap-2" style={{ alignItems: "center" }}>
                          {p.ticker && <TickerSprite t={normalizePositionToTicker(p)} size={22} />}
                          <span className="font-display t-sm">{sym}</span>
                        </div>
                      </td>
                      <td className="t-xs faint">{sec}</td>
                      <td className="num">{qty.toLocaleString()}</td>
                      <td className="num faint">${buy.toFixed(2)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>${last.toFixed(2)}</td>
                      <td className="num">${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className={`num ${pnl >= 0 ? "green" : "red"}`} style={{ fontWeight: 700 }}>
                        {pnl >= 0 ? "+" : ""}${Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className={`num ${pct >= 0 ? "green" : "red"}`} style={{ fontWeight: 700 }}>
                        {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                      </td>
                      <td>
                        <div className="row gap-1">
                          <button
                            className="pxl-btn sm ghost"
                            onClick={(e) => editPosition(p, e)}
                            title="Edit position"
                            style={{ padding: "2px 6px", color: "var(--cyan)", boxShadow: "none" }}
                          >✎</button>
                          <button
                            className="pxl-btn sm ghost"
                            onClick={(e) => removePosition(p.id, sym, e)}
                            title="Remove position"
                            style={{ padding: "2px 6px", color: "var(--red)", boxShadow: "none" }}
                          >✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </PixelPanel>

        <PixelPanel title="SECTOR MIX" accent="violet">
          <div style={{ padding: 16 }}>
            {sectorBreakdown.length === 0 ? (
              <div className="t-sm faint" style={{ textAlign: "center", padding: 20 }}>NO DATA</div>
            ) : (
              <>
                <PixelDonut
                  data={sectorBreakdown}
                  size={140}
                  thickness={20}
                  center={
                    <div className="col" style={{ alignItems: "center", lineHeight: 1.1 }}>
                      <span className="font-display t-xs faint">SECTORS</span>
                      <span className="font-mono" style={{ fontSize: 24, fontWeight: 700, color: "var(--amber)" }}>
                        {sectorBreakdown.length.toString().padStart(2, "0")}
                      </span>
                    </div>
                  }
                />
                <div className="col gap-2 mt-3">
                  {sectorBreakdown.map((d) => (
                    <div key={d.label} className="row gap-2" style={{ alignItems: "center" }}>
                      <span style={{ width: 10, height: 10, background: d.color, flexShrink: 0 }} />
                      <span className="font-display t-xs" style={{ flex: 1 }}>{d.label}</span>
                      <span className="font-mono t-xs" style={{ fontWeight: 700 }}>{d.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

function normalizePositionToTicker(p) {
  const sym = p.symbol || p.ticker?.symbol;
  return {
    sym,
    name: p.ticker?.name || sym,
    sector: p.ticker?.finnhub_industry || p.ticker?.sector || "—",
    price: Number(p.current_price ?? p.latestPrice?.close ?? 0),
    change: Number(p.change_percent ?? 0),
    ai: "HOLD",
    risk: 5,
    upside: 0,
    mc: "—",
    pe: null,
    seed: (sym || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0),
    logo: p.ticker?.logo_url,
    spark: p.sparkline || [0, 0],
    candles: [],
    _live: true,
  };
}

// ─────────────────────────────────────────────────────────────────
// ResearchPage — list of user's research notes
// ─────────────────────────────────────────────────────────────────
function ResearchPage({ onNav }) {
  const bp = useBreakpoint();
  const [filter, setFilter] = useStatePg("all");
  const [page]  = useStatePg(1);
  const [uploadOpen, setUploadOpen] = useStatePg(false);
  const [data, meta] = window.useApi(
    () => window.API.researchList({ status: filter, page, limit: 30 }),
    [filter, page],
  );
  const items = (data && data.data) || (Array.isArray(data) ? data : []);
  const total = data?.total ?? items.length;

  return (
    <div style={{ padding: bp.mobile ? "0 12px 24px" : "0 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, padding: "12px 0", flexWrap: "wrap" }}>
        <span className="font-display t-xs faint">TERMINAL ▸ AI RESEARCH</span>
        <div style={{ flex: 1 }} />
        <button className="pxl-btn sm" onClick={() => setUploadOpen(true)}
          style={{ color: "var(--violet)", borderColor: "var(--line)" }}>
          <PixelIcon name="brain" size={8} color="currentColor" /> + CONTRIBUTE
        </button>
        <span className="font-display t-xs faint">{total} REPORTS</span>
      </div>

      {uploadOpen && <UploadResearchDialog onClose={() => { setUploadOpen(false); meta?.reload?.(); }} />}

      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        {["all", "completed", "processing", "pending", "failed"].map((f) => (
          <button
            key={f}
            className="pxl-btn sm"
            onClick={() => setFilter(f)}
            style={{
              color: filter === f ? "var(--amber)" : "var(--ink-dim)",
              borderColor: filter === f ? "var(--amber)" : "var(--line)",
              background: filter === f ? "rgba(255,194,60,0.08)" : "var(--bg-2)",
            }}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      <PixelPanel title="REPORT LIBRARY" accent="amber"
        actions={meta?.loading && <Spinner label="LOADING" />}
      >
        {items.length === 0 ? (
          <EmptyState title={meta?.loading ? "FETCHING…" : "NO REPORTS"} subtitle={meta?.loading ? "Hang tight." : "Run a research ticket from the dashboard or chat overlay."} />
        ) : (
          <div className="col">
            {items.map((r) => {
              const dt = r.created_at ? new Date(r.created_at) : null;
              const date = dt ? dt.toISOString().slice(0, 10) : "—";
              const time = dt ? dt.toISOString().slice(11, 16) : "";
              const tone = r.status === "completed" ? "green"
                : r.status === "processing" || r.status === "pending" ? "amber"
                : r.status === "failed" ? "red" : "cyan";
              const tickers = Array.isArray(r.tickers) ? r.tickers.slice(0, 5) : [];
              return (
                <div key={r.id} style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid var(--line-soft)",
                  cursor: "pointer",
                }}>
                  <div className="row gap-3" style={{ alignItems: "center", flexWrap: "wrap" }}>
                    <span className="font-mono t-xs faint" style={{ width: 84 }}>{date} {time}</span>
                    <PixelBadge tone={tone}>{(r.status || "—").toUpperCase()}</PixelBadge>
                    {(r.quality || r.provider) && (
                      <PixelBadge tone={r.quality === "deep" ? "amber" : "cyan"}>
                        {(r.quality || r.provider || "").toUpperCase()}
                      </PixelBadge>
                    )}
                    <div className="row gap-1" style={{ flex: 1, minWidth: 100, flexWrap: "wrap" }}>
                      {tickers.map((sym) => (
                        <button
                          key={sym}
                          className="pxl-btn sm ghost"
                          onClick={() => {
                            const t = { sym, name: sym, sector: "—", price: 0, change: 0, ai: "HOLD", risk: 5, upside: 0, mc: "—", pe: null, seed: sym.charCodeAt(0), spark: [0, 0], candles: [], _live: true };
                            onNav("ticker", t);
                          }}
                          style={{ color: "var(--cyan)", padding: "2px 6px", boxShadow: "none" }}
                        >${sym}</button>
                      ))}
                    </div>
                    {r.rarity && <PixelBadge tone="violet">{String(r.rarity).toUpperCase()}</PixelBadge>}
                  </div>
                  <div className="t-sm mt-2" style={{ color: "var(--ink)" }}>
                    {r.title || r.question || "(no title)"}
                  </div>
                  {r.answer_markdown && (
                    <div className="t-xs faint mt-2" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {String(r.answer_markdown).replace(/[#*_`]/g, "").slice(0, 220)}…
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PixelPanel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AlertsPage — price alerts list
// ─────────────────────────────────────────────────────────────────
function AlertsPage({ onNav }) {
  const bp = useBreakpoint();
  const [data, meta] = window.useApi(() => window.API.alerts(), []);
  const items = Array.isArray(data) ? data : [];

  const armed = items.filter(a => !a.triggered_at && (a.enabled ?? true)).length;
  const triggered = items.filter(a => a.triggered_at).length;

  const removeAlert = async (id, sym, evt) => {
    evt.stopPropagation();
    if (!confirm(`Delete alert for ${sym}?`)) return;
    await window.API.alertDelete(id).catch(() => null);
    meta?.reload?.();
  };

  const toggleAlert = async (a, evt) => {
    evt.stopPropagation();
    const current = a.enabled ?? true;
    await window.API.alertUpdate(a.id, { enabled: !current }).catch(() => null);
    meta?.reload?.();
  };

  const editAlertTarget = async (a, evt) => {
    evt.stopPropagation();
    const raw = prompt(`New target for ${a.symbol} (${a.alert_type}):`, String(a.target_value));
    if (!raw) return;
    const v = Number(raw);
    if (!isFinite(v) || v <= 0) return;
    await window.API.alertUpdate(a.id, { target_value: v }).catch(() => null);
    meta?.reload?.();
  };

  return (
    <div style={{ padding: bp.mobile ? "0 12px 24px" : "0 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, padding: "12px 0" }}>
        <span className="font-display t-xs faint">TERMINAL ▸ PRICE ALERTS</span>
        <div style={{ flex: 1 }} />
        <span className="font-display t-xs faint">{items.length} TOTAL</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
        <KPI label="ARMED"     value={armed.toString().padStart(2, "0")}     tone="cyan" />
        <KPI label="TRIGGERED" value={triggered.toString().padStart(2, "0")} tone="amber" />
        <KPI label="TOTAL"     value={items.length.toString().padStart(2, "0")} tone="green" />
      </div>

      <PixelPanel title="PRICE ALERTS" accent="amber"
        actions={meta?.loading && <Spinner label="LOADING" />}
      >
        {items.length === 0 ? (
          <EmptyState icon="bell" title={meta?.loading ? "LOADING" : "NO ALERTS"} subtitle="Set price alerts from a ticker detail page." />
        ) : (
          <table className="pxl-table">
            <thead>
              <tr>
                <th>SYM</th>
                <th>TYPE</th>
                <th className="num">TARGET</th>
                <th className="num">CURRENT</th>
                <th>STATUS</th>
                <th>CREATED</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const sym = a.symbol || a.ticker?.symbol;
                const cur = Number(a.reference_price ?? a.ticker?.current_price ?? 0);
                const target = Number(a.target_value ?? 0);
                const type = String(a.alert_type || "").replace("_", " ").toUpperCase();
                const isTriggered = !!a.triggered_at;
                const tone = isTriggered ? "amber" : (a.enabled ?? true) ? "green" : "ink-faint";
                const stateLabel = isTriggered ? "TRIGGERED" : (a.enabled ?? true) ? "ARMED" : "DISABLED";
                return (
                  <tr key={a.id} onClick={() => sym && onNav("ticker", { sym, name: sym, sector: "—", price: cur, change: 0, ai: "HOLD", risk: 5, upside: 0, mc: "—", pe: null, seed: sym.charCodeAt(0), spark: [0, 0], candles: [], _live: true })}>
                    <td><span className="font-display t-sm">{sym}</span></td>
                    <td><PixelBadge>{type}</PixelBadge></td>
                    <td className="num" style={{ fontWeight: 700 }}>${target.toFixed(2)}</td>
                    <td className="num">${cur.toFixed(2)}</td>
                    <td><PixelBadge tone={tone}>{stateLabel}</PixelBadge></td>
                    <td className="t-xs faint">{a.created_at ? new Date(a.created_at).toISOString().slice(0, 10) : "—"}</td>
                    <td>
                      <div className="row gap-1">
                        <button
                          className="pxl-btn sm ghost"
                          onClick={(e) => editAlertTarget(a, e)}
                          title="Edit target"
                          style={{ padding: "2px 6px", color: "var(--cyan)", boxShadow: "none" }}
                        >✎</button>
                        <button
                          className="pxl-btn sm ghost"
                          onClick={(e) => toggleAlert(a, e)}
                          title={(a.enabled ?? true) ? "Disable alert" : "Enable alert"}
                          style={{ padding: "2px 6px", color: (a.enabled ?? true) ? "var(--amber)" : "var(--green)", boxShadow: "none" }}
                        >{(a.enabled ?? true) ? "⏸" : "▶"}</button>
                        <button
                          className="pxl-btn sm ghost"
                          onClick={(e) => removeAlert(a.id, sym, e)}
                          title="Delete alert"
                          style={{ padding: "2px 6px", color: "var(--red)", boxShadow: "none" }}
                        >✕</button>
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
  );
}

// ─────────────────────────────────────────────────────────────────
// NewsPage — paginated news feed
// ─────────────────────────────────────────────────────────────────
function NewsPage() {
  const bp = useBreakpoint();
  const [data, meta] = window.useApi(() => window.API.newsGeneral(), [], { poll: 60000 });
  const items = Array.isArray(data) ? data : [];

  return (
    <div style={{ padding: bp.mobile ? "0 12px 24px" : "0 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, padding: "12px 0" }}>
        <span className="font-display t-xs faint">TERMINAL ▸ NEWSWIRE LIVE</span>
        <div style={{ flex: 1 }} />
        <StatusLED tone={meta?.loading ? "amber" : "green"} label={meta?.loading ? "FETCHING" : `${items.length} ITEMS`} />
      </div>

      <PixelPanel title="NEWSWIRE // LIVE" accent="cyan">
        {items.length === 0 ? (
          <EmptyState icon="news" title={meta?.loading ? "LOADING" : "NO NEWS"} subtitle={meta?.loading ? "Polling…" : "Check back soon."} />
        ) : (
          <div className="col">
            {items.map((n, i) => {
              const tone = n.sentiment === "negative" ? "red" : n.sentiment === "positive" ? "green" : "cyan";
              const time = (n.publish_time || n.publishTime || "").slice(11, 16) || "—";
              const tag = (n.category || n.tag || "NEWS").toUpperCase().slice(0, 12);
              const tickers = n.tickers || (n.symbol ? [n.symbol] : []);
              return (
                <div key={i} style={{ padding: "10px 14px", borderBottom: "1px solid var(--line-soft)" }}>
                  <div className="row gap-3" style={{ alignItems: "center", flexWrap: "wrap" }}>
                    <span className="font-mono t-xs faint" style={{ width: 50 }}>{time}</span>
                    <PixelBadge tone={tone}>{tag}</PixelBadge>
                    <span className="font-display t-xs faint">{n.source || n.publisher}</span>
                    <div style={{ flex: 1 }} />
                    {tickers.slice(0, 5).map(s => (
                      <span key={s} className="font-display t-xs cyan">${s}</span>
                    ))}
                  </div>
                  <div className="t-sm mt-2" style={{ lineHeight: 1.4 }}>
                    {n.url ? (
                      <a href={n.url} target="_blank" rel="noopener noreferrer"
                         style={{ color: "var(--ink)", textDecoration: "none" }}>
                        {n.title || n.headline}
                      </a>
                    ) : (n.title || n.headline)}
                  </div>
                  {n.summary && (
                    <div className="t-xs faint mt-2" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {String(n.summary).slice(0, 220)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PixelPanel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Helper KPI tile for page tops
// ─────────────────────────────────────────────────────────────────
function KPI({ label, value, tone = "cyan" }) {
  return (
    <div className="pxl pxl-raised" style={{ padding: 12 }}>
      <div className="font-display t-xs faint">{label}</div>
      <div className="font-mono" style={{ fontSize: 22, fontWeight: 700, color: `var(--${tone})`, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// WatchlistPage — full CRUD: create/rename/delete watchlists, add/remove tickers
// ─────────────────────────────────────────────────────────────────
function WatchlistPage({ onNav }) {
  const bp = useBreakpoint();
  const [data, meta] = window.useApi(() => window.API.watchlists(), []);
  const lists = Array.isArray(data) ? data : [];
  const [activeId, setActiveId] = useStatePg(null);
  const [addSym, setAddSym] = useStatePg("");
  const [newName, setNewName] = useStatePg("");
  const [busy, setBusy] = useStatePg(false);
  const [msg, setMsg] = useStatePg(null);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2400); };
  const reload = () => meta?.reload?.();

  // Resolve active list (default to first when not set or stale)
  const active = lists.find(l => l.id === activeId) || lists[0] || null;

  const createList = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const res = await window.API.watchlistCreate(name).catch(() => null);
    setBusy(false);
    if (res?.id) { setActiveId(res.id); setNewName(""); showMsg({ tone: "green", text: `Created '${name}'` }); reload(); }
    else showMsg({ tone: "red", text: "Create failed" });
  };

  const renameList = async () => {
    if (!active) return;
    const name = prompt("Rename watchlist:", active.name);
    if (!name || name === active.name) return;
    const res = await window.API.watchlistRename(active.id, name).catch(() => null);
    if (res) { showMsg({ tone: "green", text: `Renamed to '${name}'` }); reload(); }
    else showMsg({ tone: "red", text: "Rename failed" });
  };

  const deleteList = async () => {
    if (!active) return;
    if (!confirm(`Delete watchlist '${active.name}'?`)) return;
    const res = await window.API.watchlistDelete(active.id).catch(() => null);
    if (res !== null) { setActiveId(null); showMsg({ tone: "amber", text: `Deleted '${active.name}'` }); reload(); }
    else showMsg({ tone: "red", text: "Delete failed" });
  };

  const addTicker = async () => {
    if (!active) return;
    const sym = addSym.trim().toUpperCase();
    if (!sym) return;
    setBusy(true);
    const res = await window.API.watchlistAdd(active.id, sym).catch(() => null);
    setBusy(false);
    if (res) { setAddSym(""); showMsg({ tone: "green", text: `Added ${sym}` }); reload(); }
    else showMsg({ tone: "red", text: `Add ${sym} failed (not in DB?)` });
  };

  const removeTicker = async (itemId, sym) => {
    if (!active) return;
    const res = await window.API.watchlistRemove(active.id, itemId).catch(() => null);
    if (res !== null) { showMsg({ tone: "amber", text: `Removed ${sym}` }); reload(); }
  };

  return (
    <div style={{ padding: bp.mobile ? "0 12px 24px" : "0 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, padding: "12px 0" }}>
        <span className="font-display t-xs faint">TERMINAL ▸ WATCHLISTS</span>
        <div style={{ flex: 1 }} />
        <span className="font-display t-xs faint">{lists.length} LISTS</span>
      </div>

      {msg && (
        <div className="pxl pxl-raised" style={{
          padding: "10px 14px", color: `var(--${msg.tone})`,
          fontFamily: "Silkscreen, monospace", fontSize: 11, letterSpacing: "0.06em",
        }}>▸ {msg.text}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "260px 1fr", gap: 16 }}>
        <PixelPanel title="LISTS" accent="amber">
          {lists.length === 0 && !meta?.loading && (
            <EmptyState icon="star" title="NO LISTS" subtitle="Create your first watchlist below." />
          )}
          {meta?.loading && lists.length === 0 && (
            <div style={{ padding: 16 }}><Spinner label="LOADING" /></div>
          )}
          <div className="col">
            {lists.map(l => {
              const isActive = l.id === active?.id;
              return (
                <div key={l.id}
                  onClick={() => setActiveId(l.id)}
                  className="row gap-2"
                  style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid var(--line-soft)",
                    borderLeft: isActive ? "3px solid var(--amber)" : "3px solid transparent",
                    cursor: "pointer",
                    background: isActive ? "rgba(255,194,60,0.06)" : "transparent",
                    alignItems: "center",
                  }}>
                  <PixelIcon name="star" size={12} color={isActive ? "var(--amber)" : "var(--ink-faint)"} />
                  <span className="font-display t-sm" style={{ flex: 1 }}>{l.name || "(unnamed)"}</span>
                  <span className="font-mono t-xs faint">{(l.items || []).length}</span>
                </div>
              );
            })}
          </div>
          <div style={{ padding: 10, borderTop: "2px solid var(--line)" }}>
            <div className="row gap-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") createList(); }}
                placeholder="new list name..."
                className="pxl-input"
                style={{ paddingLeft: 10 }}
              />
              <button className="pxl-btn primary" onClick={createList} disabled={busy || !newName.trim()}>+ NEW</button>
            </div>
          </div>
        </PixelPanel>

        <PixelPanel
          title={active ? `${active.name.toUpperCase()} ▸ ITEMS` : "SELECT A LIST"}
          accent="cyan"
          actions={active && (
            <span className="row gap-2">
              <button className="pxl-btn sm ghost" onClick={renameList}>RENAME</button>
              <button className="pxl-btn sm ghost" onClick={deleteList} style={{ color: "var(--red)" }}>DELETE</button>
            </span>
          )}
        >
          {!active ? (
            <EmptyState icon="star" title="NO LIST SELECTED" subtitle="Pick or create one from the left." />
          ) : (
            <>
              <div style={{ padding: 10, borderBottom: "2px solid var(--line)" }}>
                <div className="row gap-2">
                  <input
                    value={addSym}
                    onChange={e => setAddSym(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addTicker(); }}
                    placeholder="add ticker symbol (e.g. NVDA)..."
                    className="pxl-input"
                    style={{ paddingLeft: 10, textTransform: "uppercase" }}
                  />
                  <button className="pxl-btn primary" onClick={addTicker} disabled={busy || !addSym.trim()}>+ ADD</button>
                </div>
              </div>
              {(active.items || []).length === 0 ? (
                <EmptyState title="EMPTY" subtitle="Add tickers above." />
              ) : (
                <table className="pxl-table">
                  <thead>
                    <tr>
                      <th>SYM</th>
                      <th>NAME</th>
                      <th>SECTOR</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(active.items || []).map(it => {
                      const sym = it.ticker?.symbol || it.symbol;
                      const t = {
                        sym,
                        name: it.ticker?.name || sym,
                        sector: it.ticker?.finnhub_industry || it.ticker?.sector || "—",
                        price: 0, change: 0,
                        ai: "HOLD", risk: 5, upside: 0, mc: "—", pe: null,
                        seed: (sym || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0),
                        logo: it.ticker?.logo_url,
                        spark: [0, 0], candles: [],
                        _live: true,
                      };
                      return (
                        <tr key={it.id} onClick={() => onNav("ticker", t)}>
                          <td>
                            <div className="row gap-2" style={{ alignItems: "center" }}>
                              <TickerSprite t={t} size={22} />
                              <span className="font-display t-sm">{sym}</span>
                            </div>
                          </td>
                          <td className="t-sm">{t.name}</td>
                          <td className="t-xs faint">{t.sector}</td>
                          <td>
                            <button
                              className="pxl-btn sm ghost"
                              onClick={(e) => { e.stopPropagation(); removeTicker(it.id, sym); }}
                              title="Remove from watchlist"
                              style={{ padding: "2px 6px", color: "var(--red)", boxShadow: "none" }}
                            >✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </PixelPanel>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ProfilePage — credits balance + tier + transaction history + push
// ─────────────────────────────────────────────────────────────────
function urlBase64ToUint8Array(b64) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function PushControls() {
  const [supported] = useStatePg("serviceWorker" in navigator && "PushManager" in window);
  const [busy, setBusy] = useStatePg(false);
  const [state, setState] = useStatePg("unknown"); // 'subscribed' | 'denied' | 'unsubscribed' | 'unsupported' | 'unknown'
  const [msg, setMsg] = useStatePg(null);

  // Read current subscription state on mount
  useEffectPg(() => {
    if (!supported) { setState("unsupported"); return; }
    if (Notification.permission === "denied") { setState("denied"); return; }
    navigator.serviceWorker.getRegistration("/v2/").then(async (reg) => {
      if (!reg) return setState("unsubscribed");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "subscribed" : "unsubscribed");
    }).catch(() => setState("unsubscribed"));
  }, [supported]);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

  const subscribe = async () => {
    setBusy(true);
    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "unsubscribed");
        showMsg({ tone: "amber", text: "Notification permission " + perm });
        setBusy(false);
        return;
      }
      // 2. Get VAPID key
      const v = await window.API.pushVapidKey();
      if (!v?.key) throw new Error("no vapid key");
      // 3. Register SW + subscribe
      const reg = await navigator.serviceWorker.register("/v2/sw.js", { scope: "/v2/" });
      // Wait for activation
      if (reg.installing) {
        await new Promise((resolve) => {
          const w = reg.installing;
          w.addEventListener("statechange", () => { if (w.state === "activated") resolve(); });
        });
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(v.key),
      });
      // 4. Send subscription to backend
      const json = sub.toJSON();
      await window.API.pushSubscribe({
        endpoint: json.endpoint,
        keys: json.keys,
      });
      setState("subscribed");
      showMsg({ tone: "green", text: "Push notifications enabled" });
    } catch (e) {
      showMsg({ tone: "red", text: "Subscribe failed: " + (e.message || "unknown") });
    }
    setBusy(false);
  };

  const unsubscribe = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/v2/");
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) {
        await window.API.pushUnsubscribe(sub.endpoint).catch(() => null);
        await sub.unsubscribe();
      }
      setState("unsubscribed");
      showMsg({ tone: "amber", text: "Push notifications disabled" });
    } catch (e) {
      showMsg({ tone: "red", text: "Unsubscribe failed" });
    }
    setBusy(false);
  };

  return (
    <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <PixelIcon name="bell" size={14}
        color={state === "subscribed" ? "var(--green)" : state === "denied" ? "var(--red)" : "var(--ink-dim)"} />
      <span className="font-display t-xs faint">PUSH</span>
      <PixelBadge tone={state === "subscribed" ? "green" : state === "denied" ? "red" : "default"}>
        {state.toUpperCase()}
      </PixelBadge>
      {state === "subscribed" ? (
        <button className="pxl-btn sm" onClick={unsubscribe} disabled={busy}>DISABLE</button>
      ) : state === "denied" ? (
        <span className="t-xs faint">unblock notifications in browser settings</span>
      ) : state === "unsupported" ? (
        <span className="t-xs faint">not supported in this browser</span>
      ) : (
        <button className="pxl-btn sm primary" onClick={subscribe} disabled={busy}>ENABLE</button>
      )}
      {msg && <span className="t-xs" style={{ color: `var(--${msg.tone})`, marginLeft: 6 }}>▸ {msg.text}</span>}
    </div>
  );
}

function ProfilePage() {
  const bp = useBreakpoint();
  const [me, meMeta] = window.useApi(() => window.API.me(), []);
  const tier = (me?.tier || "—").toUpperCase();
  const role = (me?.role || "—").toUpperCase();
  const credits = me?.credits_balance ?? 0;
  const tx = Array.isArray(me?.credit_transactions) ? me.credit_transactions : [];

  // Stats from tx
  const stats = useMemoPg(() => {
    let spent = 0, gained = 0;
    const byReason = new Map();
    for (const t of tx) {
      const a = Number(t.amount || 0);
      if (a < 0) spent += Math.abs(a);
      else gained += a;
      const k = t.reason || "other";
      byReason.set(k, (byReason.get(k) || 0) + Math.abs(a));
    }
    return {
      spent, gained,
      byReason: [...byReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    };
  }, [tx]);

  if (meMeta?.loading && !me) {
    return <div style={{ padding: 24 }}><Spinner label="LOADING PROFILE" /></div>;
  }
  if (!me) {
    return (
      <div style={{ padding: bp.mobile ? "0 12px 24px" : "0 20px 32px" }}>
        <EmptyState icon="shield" title="NOT SIGNED IN" subtitle="Sign in from the header to view your profile." />
      </div>
    );
  }

  return (
    <div style={{ padding: bp.mobile ? "0 12px 24px" : "0 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, padding: "12px 0" }}>
        <span className="font-display t-xs faint">TERMINAL ▸ PROFILE</span>
        <div style={{ flex: 1 }} />
        <span className="font-display t-xs faint">USER · {role}</span>
      </div>

      {/* Identity card + KPIs */}
      <div className="pxl pxl-raised" style={{ padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "auto minmax(0,1fr) repeat(3, minmax(120px, 1fr))", gap: 16, alignItems: "center" }}>
          <SpriteMascot seed={(me.id || "777").split("").reduce((a, c) => a + c.charCodeAt(0), 0) || 777}
            size={56}
            colors={["transparent", "var(--cyan)", "var(--cyan-dark)", "var(--amber)"]} />
          <div className="col" style={{ minWidth: 0 }}>
            <span style={{ fontFamily: "Silkscreen", fontSize: 18 }}>
              {(me.full_name || me.email || "—").toUpperCase().slice(0, 24)}
            </span>
            <span className="t-xs dim" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.email}</span>
            <div className="row gap-1 mt-2">
              <RankBadge rank={role === "ADMIN" ? "ADMIN" : (tier === "WHALE" ? "WHALE" : tier === "DIAMOND" ? "DIAMOND" : "PRO")} />
              <PixelBadge tone="cyan">{tier}</PixelBadge>
            </div>
          </div>
          <KPI label="CREDITS"      value={credits.toString()}        tone="amber" />
          <KPI label="SPENT (LIFETIME)" value={stats.spent.toString()} tone="red" />
          <KPI label="EARNED"       value={stats.gained.toString()}   tone="green" />
        </div>

        {/* Push notifications + settings */}
        <div className="pxl-rule mt-3" />
        <div className="mt-3">
          <PushControls />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "1fr 320px", gap: 16 }}>
        <PixelPanel title="CREDIT TRANSACTIONS" accent="amber"
          actions={<span className="font-display t-xs faint">{tx.length} ENTRIES</span>}>
          {tx.length === 0 ? (
            <EmptyState title="NO TRANSACTIONS" subtitle="Spend credits via Run AI Research." />
          ) : (
            <table className="pxl-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>REASON</th>
                  <th>META</th>
                  <th className="num">AMT</th>
                </tr>
              </thead>
              <tbody>
                {tx.slice(0, 60).map((t, i) => {
                  const a = Number(t.amount || 0);
                  const tone = a >= 0 ? "green" : "red";
                  const meta = t.metadata && (t.metadata.symbol || t.metadata.model)
                    ? [t.metadata.symbol, t.metadata.model].filter(Boolean).join(" · ")
                    : "—";
                  return (
                    <tr key={t.id || i}>
                      <td className="t-xs faint">{(t.created_at || "").slice(0, 16).replace("T", " ")}</td>
                      <td className="t-xs">{String(t.reason || "—").replace(/_/g, " ").toUpperCase()}</td>
                      <td className="t-xs faint">{meta}</td>
                      <td className={`num ${tone}`} style={{ fontWeight: 700 }}>
                        {a >= 0 ? "+" : ""}{a}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </PixelPanel>

        <PixelPanel title="SPEND BY REASON" accent="cyan">
          {stats.byReason.length === 0 ? (
            <EmptyState title="NO SPEND DATA" subtitle="—" />
          ) : (
            <div className="col gap-2" style={{ padding: 14 }}>
              {stats.byReason.map(([k, v]) => {
                const maxV = stats.byReason[0][1] || 1;
                return (
                  <div key={k} className="row gap-2" style={{ alignItems: "center" }}>
                    <span className="font-display t-xs" style={{ width: 110, color: "var(--ink-dim)" }}>
                      {k.replace(/_/g, " ").toUpperCase().slice(0, 16)}
                    </span>
                    <div style={{ flex: 1, height: 10, background: "var(--bg-0)", border: "2px solid var(--line)" }}>
                      <div style={{ width: `${(v / maxV) * 100}%`, height: "100%", background: "var(--cyan)" }} />
                    </div>
                    <span className="font-mono t-xs" style={{ width: 36, textAlign: "right", fontWeight: 700 }}>{v}</span>
                  </div>
                );
              })}
            </div>
          )}
        </PixelPanel>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AdminPage — user management (role=admin only)
// ─────────────────────────────────────────────────────────────────
function AdminPage() {
  const bp = useBreakpoint();
  const [users, meta] = window.useApi(() => window.API.adminUsers(), []);
  const items = Array.isArray(users) ? users : [];
  const [filter, setFilter] = useStatePg("");
  const [msg, setMsg] = useStatePg(null);
  const [busy, setBusy] = useStatePg(false);

  const filtered = items.filter(u => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (u.email || "").toLowerCase().includes(q)
      || (u.full_name || "").toLowerCase().includes(q)
      || (u.role || "").toLowerCase().includes(q)
      || (u.tier || "").toLowerCase().includes(q);
  });

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2800); };

  const grantCredits = async (u) => {
    const raw = prompt(`Grant credits to ${u.email} (negative = revoke):`, "10");
    if (!raw) return;
    const amount = Number(raw);
    if (!isFinite(amount) || amount === 0) return;
    setBusy(true);
    const res = await window.API.adminGrantCredits(u.id, amount, "admin_gift").catch(() => null);
    setBusy(false);
    if (res) { showMsg({ tone: "green", text: `${amount > 0 ? "+" : ""}${amount} credits to ${u.email}` }); meta?.reload?.(); }
    else showMsg({ tone: "red", text: "Grant failed" });
  };

  const changeRole = async (u) => {
    const role = prompt(`Set role for ${u.email} (admin/user/waitlist):`, u.role || "user");
    if (!role || role === u.role) return;
    setBusy(true);
    const res = await window.API.adminSetRole(u.id, role).catch(() => null);
    setBusy(false);
    if (res) { showMsg({ tone: "green", text: `Role → ${role}` }); meta?.reload?.(); }
    else showMsg({ tone: "red", text: "Role change failed" });
  };

  const changeTier = async (u) => {
    const tier = prompt(`Set tier for ${u.email} (free/pro/whale/diamond):`, u.tier || "free");
    if (!tier || tier === u.tier) return;
    setBusy(true);
    const res = await window.API.adminSetTier(u.id, tier).catch(() => null);
    setBusy(false);
    if (res) { showMsg({ tone: "green", text: `Tier → ${tier}` }); meta?.reload?.(); }
    else showMsg({ tone: "red", text: "Tier change failed" });
  };

  return (
    <div style={{ padding: bp.mobile ? "0 12px 24px" : "0 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, padding: "12px 0" }}>
        <span className="font-display t-xs faint">TERMINAL ▸ ADMIN</span>
        <PixelBadge tone="red">ADMIN MODE</PixelBadge>
        <div style={{ flex: 1 }} />
        <span className="font-display t-xs faint">{items.length} USERS</span>
      </div>

      {msg && (
        <div className="pxl pxl-raised" style={{
          padding: "10px 14px", color: `var(--${msg.tone})`,
          fontFamily: "Silkscreen, monospace", fontSize: 11, letterSpacing: "0.06em",
        }}>▸ {msg.text}</div>
      )}

      <div className="pxl pxl-raised p-3">
        <input
          className="pxl-input"
          placeholder="filter by email / name / role / tier..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ paddingLeft: 10 }}
        />
      </div>

      <PixelPanel
        title="USERS"
        accent="red"
        actions={meta?.loading && <Spinner label="LOADING" />}
      >
        {items.length === 0 && meta?.loading && (
          <div style={{ padding: 24 }}><Spinner label="FETCHING" /></div>
        )}
        {items.length === 0 && !meta?.loading && (
          <EmptyState title="NO USERS" subtitle="API returned empty list (or not authorised)." />
        )}
        {items.length > 0 && (
          <table className="pxl-table">
            <thead>
              <tr>
                <th>EMAIL</th>
                <th>NAME</th>
                <th>ROLE</th>
                <th>TIER</th>
                <th className="num">CREDITS</th>
                <th>CREATED</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(u => {
                const created = u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : "—";
                return (
                  <tr key={u.id}>
                    <td className="font-mono t-xs">{u.email}</td>
                    <td className="t-xs">{(u.full_name || "—").slice(0, 24)}</td>
                    <td><PixelBadge tone={u.role === "admin" ? "red" : u.role === "waitlist" ? "amber" : "default"}>{String(u.role || "—").toUpperCase()}</PixelBadge></td>
                    <td><PixelBadge tone="cyan">{String(u.tier || "—").toUpperCase()}</PixelBadge></td>
                    <td className="num" style={{ fontWeight: 700, color: "var(--amber)" }}>
                      {u.credits_balance ?? "—"}
                    </td>
                    <td className="t-xs faint">{created}</td>
                    <td>
                      <span className="row gap-1">
                        <button className="pxl-btn sm" disabled={busy} onClick={() => grantCredits(u)} title="Grant credits">
                          <PixelIcon name="bolt" size={8} color="currentColor" /> ¢
                        </button>
                        <button className="pxl-btn sm" disabled={busy} onClick={() => changeRole(u)} title="Change role">R</button>
                        <button className="pxl-btn sm" disabled={busy} onClick={() => changeTier(u)} title="Change tier">T</button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PixelPanel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// EditPositionDialog — PATCH /portfolio/positions/:id
// ─────────────────────────────────────────────────────────────────
function EditPositionDialog({ position, onClose, onSaved }) {
  const [shares, setShares] = useStatePg(String(position?.shares ?? "0"));
  const [price, setPrice] = useStatePg(String(position?.buy_price ?? "0"));
  const [date, setDate] = useStatePg((position?.buy_date || "").slice(0, 10));
  const [busy, setBusy] = useStatePg(false);
  const [msg, setMsg] = useStatePg(null);

  const sym = position?.symbol || position?.ticker?.symbol || "—";

  const submit = async () => {
    const n = Number(shares), p = Number(price);
    if (!isFinite(n) || n <= 0 || !isFinite(p) || p <= 0) {
      setMsg({ tone: "red", text: "Invalid shares/price" }); return;
    }
    setBusy(true);
    const res = await window.API.portfolioUpdate(position.id, {
      shares: n,
      buy_price: p,
      buy_date: date,
    }).catch(() => null);
    setBusy(false);
    if (res) {
      setMsg({ tone: "green", text: "Saved" });
      setTimeout(onSaved, 700);
    } else {
      setMsg({ tone: "red", text: "Save failed" });
    }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 240,
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: "10vh",
    }}>
      <div onClick={(e) => e.stopPropagation()}
        className="pxl pxl-raised"
        style={{
          width: "min(520px, 92vw)",
          background: "var(--bg-1)",
        }}>
        <div className="pxl-head">
          <span><span className="dot cyan"></span>EDIT POSITION ▸ {sym}</span>
          <span className="font-display t-xs faint" style={{ cursor: "pointer" }} onClick={onClose}>✕</span>
        </div>
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
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
        </div>
        {msg && (
          <div style={{ padding: "0 18px 8px", color: `var(--${msg.tone})`, fontFamily: "Silkscreen, monospace", fontSize: 11, letterSpacing: "0.06em" }}>
            ▸ {msg.text}
          </div>
        )}
        <div style={{ padding: "0 18px 16px", display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }} />
          <button className="pxl-btn" onClick={onClose} disabled={busy}>CANCEL</button>
          <button className="pxl-btn primary" onClick={submit} disabled={busy}>
            {busy ? "SAVING…" : "▸ SAVE"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// UploadResearchDialog — POST /research/contribute to earn credits
// ─────────────────────────────────────────────────────────────────
function UploadResearchDialog({ onClose }) {
  const [tickersStr, setTickersStr] = useStatePg("");
  const [content, setContent] = useStatePg("");
  const [busy, setBusy] = useStatePg(false);
  const [msg, setMsg] = useStatePg(null);

  const submit = async () => {
    const tickers = tickersStr
      .split(/[,\s]+/)
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) {
      setMsg({ tone: "red", text: "Add at least one ticker symbol." }); return;
    }
    if (content.trim().length < 50) {
      setMsg({ tone: "red", text: "Content too short — paste at least 50 chars of markdown." }); return;
    }
    setBusy(true);
    const res = await window.API.researchContribute(tickers, content)
      .catch((e) => ({ _err: e }));
    setBusy(false);
    if (!res || res._err) {
      setMsg({ tone: "red", text: "Contribution failed (auth or backend error)" });
      return;
    }
    const credits = res.credits_earned ?? res.creditsAwarded ?? res.score ?? "?";
    setMsg({ tone: "green", text: `Accepted — earned ${credits} credit(s).` });
    setTickersStr(""); setContent("");
    setTimeout(onClose, 1800);
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 220,
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: "6vh",
    }}>
      <div onClick={(e) => e.stopPropagation()}
        className="pxl pxl-raised"
        style={{
          width: "min(680px, 92vw)",
          maxHeight: "86vh",
          display: "flex", flexDirection: "column",
          background: "var(--bg-1)",
        }}>
        <div className="pxl-head">
          <span><span className="dot violet"></span>CONTRIBUTE RESEARCH ▸ EARN CREDITS</span>
          <span className="font-display t-xs faint" style={{ cursor: "pointer" }} onClick={onClose}>✕</span>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
          <p className="t-xs dim" style={{ lineHeight: 1.5 }}>
            Paste your own research / LLM-generated note covering one or more tickers.
            High-quality, well-cited markdown earns more credits. Plagiarised or trivial
            content is rejected.
          </p>

          <div className="col gap-1">
            <span className="font-display t-xs faint">TICKERS (COMMA OR SPACE SEPARATED)</span>
            <input
              className="pxl-input"
              placeholder="e.g. NVDA, AAPL, MSFT"
              value={tickersStr}
              onChange={e => setTickersStr(e.target.value)}
              disabled={busy}
              style={{ paddingLeft: 10, textTransform: "uppercase" }}
            />
          </div>

          <div className="col gap-1">
            <span className="font-display t-xs faint">MARKDOWN CONTENT</span>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              disabled={busy}
              placeholder={`# Bullish case for NVDA\n\nThesis: ...\n\nKey catalysts:\n- ...\n\nRisks:\n- ...`}
              style={{
                fontFamily: "JetBrains Mono, monospace", fontSize: 12,
                background: "var(--bg-0)", color: "var(--ink)",
                border: "2px solid var(--line)", padding: "8px 10px",
                minHeight: 240, resize: "vertical",
              }}
            />
            <span className="t-xs faint" style={{ textAlign: "right" }}>
              {content.length.toLocaleString()} chars
            </span>
          </div>

          {msg && (
            <div style={{ color: `var(--${msg.tone})`, fontFamily: "Silkscreen, monospace", fontSize: 11, letterSpacing: "0.06em" }}>
              ▸ {msg.text}
            </div>
          )}

          <div className="row gap-2">
            <div style={{ flex: 1 }} />
            <button className="pxl-btn" onClick={onClose} disabled={busy}>CANCEL</button>
            <button className="pxl-btn primary"
              onClick={submit}
              disabled={busy || !tickersStr.trim() || content.trim().length < 50}>
              {busy ? "SCORING…" : "▸ SUBMIT FOR SCORING"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PublicReportPage — read-only research view from /report/:id/:sig
// Activated via URL query ?share=ID:SIG (or path /v2/share/ID/SIG redirect)
// ─────────────────────────────────────────────────────────────────
function PublicReportPage({ shareKey, onNav }) {
  const [id, signature] = (shareKey || "").split(":");
  const [data, meta] = window.useApi(
    () => (id && signature ? window.API.researchPublic(id, signature) : Promise.resolve(null)),
    [id, signature],
  );

  const bp = useBreakpoint();
  if (!id || !signature) {
    return (
      <div style={{ padding: 32 }}>
        <EmptyState icon="news" title="INVALID SHARE LINK" subtitle="The URL is missing report ID or signature." />
      </div>
    );
  }
  if (meta?.loading && !data) {
    return <div style={{ padding: 32 }}><Spinner label="LOADING SHARED REPORT" /></div>;
  }
  if (!data) {
    return (
      <div style={{ padding: 32 }}>
        <EmptyState icon="shield" title="REPORT NOT FOUND" subtitle="Either the signature is invalid or the report has been removed." />
      </div>
    );
  }

  const tickers = Array.isArray(data.tickers) ? data.tickers : [];
  const body = String(data.answer_markdown || data.content || "").replace(/[#*_`]/g, "");
  const created = data.created_at ? new Date(data.created_at).toISOString().slice(0, 16).replace("T", " ") : "—";

  return (
    <div style={{ padding: bp.mobile ? "0 12px 24px" : "0 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, padding: "12px 0" }}>
        <span className="font-display t-xs faint">TERMINAL ▸ SHARED REPORT ▸ {id.slice(0, 8)}…</span>
        <div style={{ flex: 1 }} />
        <PixelBadge tone="violet">PUBLIC</PixelBadge>
        <button className="pxl-btn sm" onClick={() => onNav && onNav("dashboard")}>◀ DASHBOARD</button>
      </div>

      <PixelPanel
        title={(data.title || "RESEARCH REPORT").toUpperCase().slice(0, 60)}
        accent="amber"
        actions={
          <span className="row gap-2" style={{ alignItems: "center" }}>
            <PixelBadge tone="cyan">{data.status?.toUpperCase() || "—"}</PixelBadge>
            <span className="font-display t-xs faint">{created}</span>
          </span>
        }
      >
        <div style={{ padding: 18 }}>
          <div className="row gap-2 mb-3" style={{ flexWrap: "wrap" }}>
            {tickers.map(sym => (
              <PixelBadge key={sym} tone="amber">${sym}</PixelBadge>
            ))}
            {data.models_used?.length && (
              <PixelBadge tone="violet">{data.models_used.join(" ▸ ").toUpperCase()}</PixelBadge>
            )}
          </div>
          {body ? (
            <div style={{
              fontSize: 13, lineHeight: 1.6,
              maxHeight: "65vh", overflow: "auto",
              whiteSpace: "pre-wrap", color: "var(--ink)",
            }}>
              {body.slice(0, 8000)}
              {body.length > 8000 && <span className="faint t-xs"> … (truncated)</span>}
            </div>
          ) : (
            <EmptyState title="EMPTY REPORT" subtitle="This report has no content yet." />
          )}
        </div>
      </PixelPanel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AboutPage / TermsPage / PrivacyPage — static info
// ─────────────────────────────────────────────────────────────────
function InfoPage({ title, sections }) {
  const bp = useBreakpoint();
  return (
    <div style={{ padding: bp.mobile ? "0 12px 24px" : "0 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, padding: "12px 0" }}>
        <span className="font-display t-xs faint">TERMINAL ▸ {title.toUpperCase()}</span>
        <div style={{ flex: 1 }} />
      </div>
      <PixelPanel title={title.toUpperCase()} accent="cyan">
        <div style={{ padding: 22, maxWidth: 720, lineHeight: 1.65, fontSize: 13 }}>
          {sections.map((s, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              {s.h && (
                <div className="font-display amber t-sm mb-2" style={{ letterSpacing: "0.08em" }}>
                  ▸ {s.h}
                </div>
              )}
              <p style={{ color: "var(--ink)", whiteSpace: "pre-wrap" }}>{s.p}</p>
            </div>
          ))}
        </div>
      </PixelPanel>
    </div>
  );
}

function AboutPage() {
  return <InfoPage title="About Neural//Ticker v2" sections={[
    { h: "WHAT IS THIS", p:
`NEURAL//TICKER is an AI-driven stock research terminal. The v2 frontend is an
experimental pixel-art reimagining of the main product — built as a single-
page React app with no build step, served from /v2/ alongside the main app.

Same backend, same database, same auth. Different vibe.` },
    { h: "ARCHITECTURE", p:
`• Backend: NestJS · TypeORM · PostgreSQL · Yahoo Finance + Finnhub adapters
• AI: Gemini · GPT · Claude ensemble for research / portfolio analysis
• Real-time: marquee polls /market-data/indices every 30s, AI chat streams via SSE
• Frontend v2: React 18 + Babel-on-CDN, no bundler — pure JSX in browser` },
    { h: "WHO BUILT IT", p:
`Branislav Lang (branislavlang@gmail.com). 15y IBM app support → first own
product. FinOps + e2e ops learning vehicle.

Source: github.com/branislavlang/neural-ticket-core` },
    { h: "TECH STACK", p:
`Backend: NestJS 11 · TypeORM · TimescaleDB · Passport JWT · web-push
Frontend (main): React 18 + Vite · TypeScript · Tailwind
Frontend v2 (this): React 18 + Babel standalone · pixel terminal CSS · MOCK fallbacks
Auth: Google OAuth2 · dev JWT token (non-prod)
Data: Yahoo Finance 2 · Finnhub · OpenAI · Gemini · Anthropic` },
  ]} />;
}

function TermsPage() {
  return <InfoPage title="Terms of Service" sections={[
    { h: "USAGE", p:
`NEURAL//TICKER provides AI-generated market research and analysis tools. The
service is offered as-is, with no warranty of fitness for any particular purpose
including investment decisions. Nothing on this site constitutes financial
advice.` },
    { h: "NO INVESTMENT ADVICE", p:
`AI-generated content (research reports, scenarios, ratings, sentiment) is
algorithmically produced and may be inaccurate, outdated, or incomplete. Always
verify with primary sources before acting on it. Past performance does not
guarantee future results.` },
    { h: "ACCEPTABLE USE", p:
`• Do not attempt to overload, scrape, or abuse the API
• Do not impersonate other users
• Credits are non-transferable and have no monetary value outside the platform
• Public research reports shared via signed URLs may be revoked at any time` },
    { h: "TERMINATION", p:
`We may suspend or terminate access at any time for violation of these terms
or for any other reason at our sole discretion.` },
  ]} />;
}

function PrivacyPage() {
  return <InfoPage title="Privacy Policy" sections={[
    { h: "WHAT WE COLLECT", p:
`• Email + name + avatar from Google OAuth on sign-in
• Your portfolio positions, watchlists, price alerts (entered by you)
• Your research requests and the AI responses to them
• Login timestamps and device user-agent for security` },
    { h: "WHAT WE DON'T COLLECT", p:
`• No payment info (we don't take payments yet)
• No third-party analytics (no Google Analytics, no Facebook Pixel)
• No advertising trackers
• No tracking across other websites` },
    { h: "DATA STORAGE", p:
`All data lives in our PostgreSQL database. Auth cookies are HttpOnly, secure
when running in production. We use VAPID for push notifications — your push
subscription endpoint is stored to send you alert triggers.` },
    { h: "YOUR RIGHTS", p:
`• Export: contact branislavlang@gmail.com for a full data dump
• Delete: same address — full account deletion within 7 days
• Correct: edit via UI (Profile / Portfolio / Watchlists / Alerts pages)` },
  ]} />;
}

window.PortfolioPage = PortfolioPage;
window.ResearchPage = ResearchPage;
window.AlertsPage = AlertsPage;
window.NewsPage = NewsPage;
window.WatchlistPage = WatchlistPage;
window.ProfilePage = ProfilePage;
window.AdminPage = AdminPage;
window.PublicReportPage = PublicReportPage;
window.AboutPage = AboutPage;
window.TermsPage = TermsPage;
window.PrivacyPage = PrivacyPage;

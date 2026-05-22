// Side-by-side ticker comparison view.
// Pick 2-4 tickers via dropdowns; compares price, change, risk profile (radar
// overlay), key fundamentals, and 30-day sparklines. Lightweight — uses already-
// loaded analyzer data + optional /composite for richer fundamentals.

const { useState: useStateCmp, useEffect: useEffectCmp, useMemo: useMemoCmp } = React;

const COMPARE_COLORS = ["var(--cyan)", "var(--amber)", "var(--violet)", "var(--green)"];

function ComparePage({ onNav }) {
  const bp = useBreakpoint();
  const tickers = window.useTickersWithFallback
    ? window.useTickersWithFallback({ limit: 100 })
    : window.MOCK.tickers;

  // Persist selected symbols in localStorage so they survive reloads.
  const [picked, setPicked] = useStateCmp(() => {
    try {
      const raw = localStorage.getItem("v2_compare_picks");
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p) && p.length > 0) return p;
      }
    } catch (e) { /* swallow */ }
    return [];
  });

  // When tickers load: seed with first 2 if empty, or migrate stale syms
  // (e.g. mock ZYRA/HALO from a previous session) to real ones.
  useEffectCmp(() => {
    if (!Array.isArray(tickers) || tickers.length < 2) return;
    const known = new Set(tickers.map(t => t.sym));
    if (picked.length === 0) {
      setPicked([tickers[0].sym, tickers[1].sym]);
      return;
    }
    const stale = picked.some(s => !known.has(s));
    if (stale) {
      const fresh = tickers.map(t => t.sym).filter(s => !picked.includes(s));
      const next = picked.map((s) => known.has(s) ? s : (fresh.shift() || tickers[0].sym));
      setPicked(next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers]);

  useEffectCmp(() => {
    try { localStorage.setItem("v2_compare_picks", JSON.stringify(picked)); } catch (e) {}
  }, [picked]);

  const byMap = useMemoCmp(() => new Map((tickers || []).map(t => [t.sym, t])), [tickers]);
  const selected = picked.map(s => byMap.get(s)).filter(Boolean);

  const symbolOptions = (tickers || []).map(t => t.sym);

  const setSlot = (idx, sym) => {
    setPicked(p => {
      const next = [...p];
      if (sym === "") {
        next.splice(idx, 1);
      } else {
        next[idx] = sym;
      }
      return next;
    });
  };
  const addSlot = () => {
    if (picked.length >= 4) return;
    const used = new Set(picked);
    const fresh = (tickers || []).find(t => !used.has(t.sym));
    if (fresh) setPicked(p => [...p, fresh.sym]);
  };

  return (
    <div style={{ padding: bp.mobile ? "0 12px 24px" : "0 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, padding: "12px 0", flexWrap: "wrap" }}>
        <span className="font-display t-xs faint">TERMINAL ▸ COMPARE</span>
        <div style={{ flex: 1 }} />
        <span className="font-display t-xs faint">{selected.length} / 4 SELECTED</span>
        {picked.length < 4 && (
          <button className="pxl-btn sm primary" onClick={addSlot}>+ ADD</button>
        )}
      </div>

      {/* Picker strip */}
      <div className="pxl pxl-raised" style={{
        padding: 12,
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(picked.length, 1)}, 1fr)`,
        gap: 10,
      }}>
        {picked.map((sym, i) => (
          <div key={i} className="col gap-2">
            <div className="row" style={{ alignItems: "center", gap: 6 }}>
              <span style={{
                width: 12, height: 12, background: COMPARE_COLORS[i % COMPARE_COLORS.length],
                flexShrink: 0,
              }} />
              <span className="font-display t-xs faint" style={{ flex: 1 }}>SLOT {i + 1}</span>
              <button className="pxl-btn sm ghost" onClick={() => setSlot(i, "")}
                style={{ padding: "2px 6px", color: "var(--red)", boxShadow: "none" }}
                title="Remove slot">✕</button>
            </div>
            <select
              value={sym}
              onChange={e => setSlot(i, e.target.value)}
              style={{
                background: "var(--bg-0)", color: "var(--ink)",
                border: "2px solid var(--line)", padding: "8px 10px",
                fontFamily: "JetBrains Mono, monospace", fontSize: 12,
              }}
            >
              {symbolOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ))}
        {picked.length === 0 && (
          <div className="t-sm faint" style={{ textAlign: "center", padding: 14 }}>
            Click "+ ADD" to pick a ticker.
          </div>
        )}
      </div>

      {selected.length < 2 ? (
        <EmptyState icon="chart" title="PICK AT LEAST TWO"
          subtitle="Compare view needs 2 or more tickers to show a meaningful diff." />
      ) : (
        <>
          {/* KPI grid */}
          <div className="pxl pxl-raised" style={{ padding: 14 }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: `200px repeat(${selected.length}, 1fr)`,
              gap: 0,
            }}>
              <div className="font-display t-xs faint" style={{ padding: "8px 0" }}>METRIC</div>
              {selected.map((t, i) => (
                <div key={t.sym} className="row gap-2" style={{ padding: "8px 6px", alignItems: "center" }}>
                  <span style={{
                    width: 10, height: 10,
                    background: COMPARE_COLORS[i % COMPARE_COLORS.length],
                  }} />
                  <TickerSprite t={t} size={22} />
                  <span className="font-display t-sm" style={{ cursor: "pointer", color: "var(--cyan)" }}
                    onClick={() => onNav("ticker", t)}>
                    {t.sym}
                  </span>
                </div>
              ))}

              <CompareRow label="PRICE" cells={selected.map(t => `$${(t.price || 0).toFixed(2)}`)} />
              <CompareRow label="CHANGE %" cells={selected.map(t => ({
                text: `${t.change >= 0 ? "+" : ""}${(t.change || 0).toFixed(2)}%`,
                tone: t.change >= 0 ? "green" : "red",
              }))} />
              <CompareRow label="AI VERDICT" cells={selected.map(t => ({ verdict: t.ai }))} />
              <CompareRow label="UPSIDE" cells={selected.map(t => ({
                text: `${t.upside >= 0 ? "+" : ""}${(t.upside || 0).toFixed(1)}%`,
                tone: t.upside >= 0 ? "green" : "red",
              }))} />
              <CompareRow label="RISK SCORE" cells={selected.map(t => `${t.risk}/10`)} />
              <CompareRow label="MKT CAP" cells={selected.map(t => t.mc || "—")} />
              <CompareRow label="P/E" cells={selected.map(t => t.pe != null ? Number(t.pe).toFixed(1) : "—")} />
              <CompareRow label="SECTOR" cells={selected.map(t => (t.sector || "—").slice(0, 22))} />
            </div>
          </div>

          {/* Sparklines panel */}
          <PixelPanel title="30-DAY PRICE TRAJECTORY (NORMALIZED)" accent="cyan">
            <div style={{ padding: 18 }}>
              <CompareSparklines tickers={selected} />
            </div>
          </PixelPanel>
        </>
      )}
    </div>
  );
}

function CompareRow({ label, cells }) {
  return (
    <>
      <div className="font-display t-xs faint" style={{
        padding: "10px 0",
        borderTop: "1px dashed var(--line)",
      }}>{label}</div>
      {cells.map((c, i) => {
        const styleBase = {
          padding: "10px 6px",
          borderTop: "1px dashed var(--line)",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 13,
          fontWeight: 700,
        };
        if (c && typeof c === "object" && c.verdict) {
          return (
            <div key={i} style={styleBase}>
              <VerdictPill verdict={c.verdict} />
            </div>
          );
        }
        if (c && typeof c === "object" && c.tone) {
          return (
            <div key={i} style={{ ...styleBase, color: `var(--${c.tone})` }}>
              {c.text}
            </div>
          );
        }
        return <div key={i} style={styleBase}>{c}</div>;
      })}
    </>
  );
}

// CompareSparklines — overlay all selected sparklines (normalized to 0-100)
function CompareSparklines({ tickers }) {
  const width = 720, height = 180, pad = 10;
  // Resolve longest series, normalize each to start at 100
  const series = tickers.map(t => {
    const raw = (t.spark || []).filter(v => isFinite(Number(v)));
    if (raw.length < 2) return [];
    const base = Number(raw[0]) || 1;
    return raw.map(v => (Number(v) / base) * 100);
  });
  const allVals = series.flat();
  if (allVals.length === 0) {
    return <div className="font-display t-xs faint" style={{ textAlign: "center" }}>No sparkline data for selection.</div>;
  }
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  return (
    <div>
      <svg className="pixel-svg" width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", background: "var(--bg-0)" }}>
        {/* baseline (100 = start) */}
        {(() => {
          const yBase = pad + (1 - (100 - min) / range) * innerH;
          return (
            <line x1={pad} y1={yBase} x2={width - pad} y2={yBase}
              stroke="var(--line)" strokeDasharray="3 3" />
          );
        })()}
        {series.map((s, idx) => {
          if (s.length < 2) return null;
          const stepX = innerW / (s.length - 1);
          const points = s.map((v, i) => {
            const x = Math.round(pad + i * stepX);
            const y = Math.round(pad + (1 - (v - min) / range) * innerH);
            return [x, y];
          });
          const d = points.map((p, i) => (i === 0 ? `M${p[0]} ${p[1]}` : `L${p[0]} ${p[1]}`)).join(" ");
          return (
            <path key={idx} d={d} fill="none"
              stroke={COMPARE_COLORS[idx % COMPARE_COLORS.length]}
              strokeWidth="2" />
          );
        })}
        {/* y-axis labels */}
        <text x={pad} y={pad + 4} fontFamily="Silkscreen, monospace" fontSize="9" fill="var(--ink-faint)">{max.toFixed(0)}%</text>
        <text x={pad} y={height - pad - 2} fontFamily="Silkscreen, monospace" fontSize="9" fill="var(--ink-faint)">{min.toFixed(0)}%</text>
      </svg>
      <div className="row gap-3 mt-2" style={{ flexWrap: "wrap", justifyContent: "center" }}>
        {tickers.map((t, i) => (
          <div key={t.sym} className="row gap-1" style={{ alignItems: "center" }}>
            <span style={{ width: 12, height: 12, background: COMPARE_COLORS[i % COMPARE_COLORS.length] }} />
            <span className="font-display t-xs">{t.sym}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.ComparePage = ComparePage;

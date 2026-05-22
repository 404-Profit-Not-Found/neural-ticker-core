// Converted from legacy JSX. Strict TS would require rewriting; we keep the
// runtime behaviour 1:1 and accept loose types via ts-nocheck for this file.
// @ts-nocheck
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  PixelPanel,
  PixelBadge,
  Sparkline,
  CandleChart,
  PixelIcon,
  SegmentedBar,
  VerdictPill,
  PriceDelta,
  RangeBar,
  SpriteMascot,
  TickerSprite,
  VolumeBars,
  PixelDonut,
  PixelHeart,
  RankBadge,
  StatusLED,
  RiskRadar,
  useMediaQuery,
  useBreakpoint,
} from '../components/pixel.tsx';
import {
  Skel,
  SkelText,
  SkelDither,
  SkelChart,
  SkelBar,
  SkelDots,
  Spinner,
  StatTileSkel,
  OpportunityCardSkel,
  NewsRowSkel,
  WatchlistRowSkel,
  TableRowSkel,
  AIDigestSkel,
  TypedLine,
  DonutSkel,
  PanelSkel,
  LoadingOverlay,
  EmptyState,
} from '../components/Skeletons.tsx';
import { BootSequence, StatusBar } from '../components/Chrome.tsx';
import { API } from '../lib/api.ts';
import { MOCK } from '../lib/data.ts';
import { useApi, useMutation, useIsFetching, invalidateQueries } from '../lib/hooks.ts';
import {
  useLiveTickers,
  useTickersWithFallback,
  useTickerHistory,
  useTickerNews,
  useTickerComposite,
} from '../lib/tickers.ts';

// Design System index — single-page tour of all tokens & components

function DesignSystem({ onClose }) {
  const [palette, setPalette] = useStateDS("phosphor");
  const bp = useBreakpoint();
  const m = MOCK;

  return (
    <div style={{ padding: bp.mobile ? "0 12px 32px" : "0 24px 48px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Cover */}
      <div className="pxl pxl-raised" style={{ padding: bp.mobile ? 20 : 40, marginTop: 16 }}>
        <div className="row gap-3" style={{ alignItems: "center", marginBottom: 12 }}>
          <div style={{
            width: 56, height: 56,
            background: "var(--amber)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 0 3px var(--amber-dark), inset 0 -4px 0 0 rgba(0,0,0,0.25)"
          }}>
            <span style={{ fontFamily: "Silkscreen", fontSize: 32, color: "#1a1200", fontWeight: 700 }}>N</span>
          </div>
          <div className="col">
            <span style={{ fontFamily: "Silkscreen", fontSize: bp.mobile ? 22 : 32, letterSpacing: "0.04em" }}>
              NEURAL<span className="amber">//</span>TICKER
            </span>
            <span className="font-display t-sm faint">PIXEL DESIGN SYSTEM ▸ v3.4 ▸ MAY 2026</span>
          </div>
        </div>
        <p className="t-base dim" style={{ maxWidth: 620, lineHeight: 1.55 }}>
          A 16-bit terminal aesthetic for serious financial software. Chunky 2-pixel borders, phosphor accent colors, and monospace numerics across six interchangeable palettes. Every screen in the platform builds from the tokens, primitives, and patterns below.
        </p>

        <div className="row gap-2 mt-4">
          {["typography", "colors", "buttons", "badges", "data", "panels", "layout", "loading"].map((s, i) => (
            <a key={s} href={`#${s}`} className="pxl-btn sm">
              {(i + 1).toString().padStart(2, "0")} · {s.toUpperCase()}
            </a>
          ))}
        </div>
      </div>

      {/* TYPOGRAPHY */}
      <Section id="typography" title="01 · TYPOGRAPHY" subtitle="Three families. Display for chrome, headline for moments, mono for numbers.">
        <div style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "repeat(3, 1fr)", gap: 16 }}>
          <TypeCard fam="Silkscreen" role="DISPLAY" use="Headers, labels, badges. ALL CAPS." cls="font-display" />
          <TypeCard fam="VT323" role="HEADLINE" use="Hero moments, marquee text, boot sequence." cls="font-headline" />
          <TypeCard fam="JetBrains Mono" role="MONO / DATA" use="Prices, percentages, tabular data." cls="font-mono" />
        </div>

        <div className="pxl-inset mt-4" style={{ padding: 18 }}>
          <span className="tw-h">TYPE SCALE</span>
          <div className="col gap-2 mt-3">
            {[
              ["t-xs", "10px", "labels, microcopy"],
              ["t-sm", "11px", "secondary body, captions"],
              ["t-base", "13px", "primary body"],
              ["t-lg", "16px", "subheadings"],
              ["t-xl", "22px", "panel titles"],
              ["t-2xl", "32px", "section heroes"],
              ["t-3xl", "48px", "page heroes (price hero)"]
            ].map(([cls, px, use]) => (
              <div key={cls} className="row" style={{ alignItems: "baseline", gap: 16, borderBottom: "1px dashed var(--line)", paddingBottom: 8 }}>
                <span className={`font-display t-xs faint`} style={{ width: 60 }}>{cls}</span>
                <span className={`${cls} font-mono`} style={{ width: bp.mobile ? "auto" : 220 }}>$184.22</span>
                <span className="font-display t-xs faint" style={{ width: 48 }}>{px}</span>
                {!bp.mobile && <span className="t-xs faint" style={{ flex: 1 }}>{use}</span>}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* COLORS */}
      <Section id="colors" title="02 · COLORS" subtitle="Six palettes share the same token shape — bg scale, ink scale, signal colors.">
        <div style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
          {[
            ["neural",    "NEURAL · RGB mega-dark (default)", PALETTES_DS.neural],
            ["phosphor",  "PHOSPHOR · Cool blue terminal",    PALETTES_DS.phosphor],
            ["amber",     "AMBER · Sepia CRT",                PALETTES_DS.amber],
            ["cyber",     "CYBER · Neon noir",                PALETTES_DS.cyber],
            ["matrix",    "MATRIX · Terminal green",          PALETTES_DS.matrix],
            ["graphite",  "GRAPHITE · Neutral gray",          PALETTES_DS.graphite],
            ["paper",     "PAPER · Light terminal",           PALETTES_DS.paper]
          ].map(([name, label, p]) => (
            <PaletteCard key={name} name={name} label={label} colors={p} />
          ))}
        </div>

        <div className="pxl-inset mt-4" style={{ padding: 18 }}>
          <span className="tw-h">SIGNAL SEMANTICS</span>
          <div className="col gap-2 mt-3">
            {[
              ["--green", "UP, BUY, POSITIVE P&L, GO"],
              ["--red", "DOWN, SELL, NEGATIVE P&L, STOP"],
              ["--amber", "FOCUS, EARNINGS, ATTENTION, WARN"],
              ["--cyan", "INFO, NEUTRAL, LINKS, MARKET STATUS"],
              ["--violet", "EXOTIC SECTOR ACCENT, SCENARIOS"]
            ].map(([tok, use]) => (
              <div key={tok} className="row gap-3" style={{ alignItems: "center", borderBottom: "1px dashed var(--line)", paddingBottom: 6 }}>
                <span style={{ width: 18, height: 18, background: `var(${tok})`, border: "2px solid var(--line)" }} />
                <span className="font-mono t-sm" style={{ width: 100 }}>{tok}</span>
                <span className="t-xs faint" style={{ flex: 1 }}>{use}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* BUTTONS */}
      <Section id="buttons" title="03 · BUTTONS" subtitle="Chunky, no border-radius. Default + primary + danger + ghost + sm variant.">
        <div className="pxl-inset" style={{ padding: 20 }}>
          <div className="row gap-2" style={{ flexWrap: "wrap", marginBottom: 14 }}>
            <button className="pxl-btn">DEFAULT</button>
            <button className="pxl-btn primary">PRIMARY</button>
            <button className="pxl-btn danger">DANGER</button>
            <button className="pxl-btn ghost">GHOST</button>
            <button className="pxl-btn" disabled style={{ opacity: 0.4 }}>DISABLED</button>
          </div>
          <div className="row gap-2" style={{ flexWrap: "wrap", marginBottom: 14 }}>
            <button className="pxl-btn sm">SMALL</button>
            <button className="pxl-btn sm primary">SMALL PRIMARY</button>
            <button className="pxl-btn sm"><PixelIcon name="bolt" size={8} color="currentColor" /> WITH ICON</button>
            <button className="pxl-btn sm">+ ADD</button>
            <button className="pxl-btn sm">FILTER ▾</button>
          </div>

          <span className="tw-h">TABS</span>
          <div className="row" style={{ borderBottom: "2px solid var(--line)", marginTop: 8 }}>
            {["OVERVIEW", "RESEARCH", "FINANCIALS", "SOCIAL"].map((lbl, i) => (
              <button key={lbl} className={`pxl-tab ${i === 0 ? "active" : ""}`}>{lbl}</button>
            ))}
          </div>
        </div>
      </Section>

      {/* BADGES */}
      <Section id="badges" title="04 · BADGES + STAMPS" subtitle="Uppercase identification chips. Tone-coded.">
        <div className="pxl-inset" style={{ padding: 20 }}>
          <div className="row gap-2 mb-4" style={{ flexWrap: "wrap" }}>
            <PixelBadge>DEFAULT</PixelBadge>
            <PixelBadge tone="green">UP</PixelBadge>
            <PixelBadge tone="red">DOWN</PixelBadge>
            <PixelBadge tone="amber">FOCUS</PixelBadge>
            <PixelBadge tone="cyan">INFO</PixelBadge>
            <PixelBadge tone="violet">EXOTIC</PixelBadge>
          </div>

          <span className="tw-h">VERDICT PILLS</span>
          <div className="row gap-2 mt-3 mb-4" style={{ flexWrap: "wrap" }}>
            {["STRONG BUY", "NO BRAINER", "SPECULATIVE", "HOLD", "SELL"].map(v => (
              <VerdictPill key={v} verdict={v} />
            ))}
          </div>

          <span className="tw-h">PRICE DELTAS</span>
          <div className="row gap-2 mt-3 mb-4" style={{ flexWrap: "wrap" }}>
            <PriceDelta pct={3.84} />
            <PriceDelta pct={-2.14} />
            <PriceDelta pct={0.18} />
            <PriceDelta pct={12.4} />
            <PriceDelta pct={-8.9} />
          </div>

          <span className="tw-h">RANK BADGES (METALLIC)</span>
          <div className="row gap-2 mt-3 mb-4" style={{ flexWrap: "wrap" }}>
            <RankBadge rank="WHALE" />
            <RankBadge rank="DIAMOND" />
            <RankBadge rank="PRO" />
            <RankBadge rank="ADMIN" />
          </div>

          <span className="tw-h">STATUS LEDS</span>
          <div className="row gap-3 mt-3" style={{ flexWrap: "wrap" }}>
            <StatusLED tone="green" label="LINK 12MS" />
            <StatusLED tone="amber" label="REASONING" />
            <StatusLED tone="red" label="HALT" />
            <StatusLED tone="cyan" label="SYNC" />
          </div>

          <div className="pxl-rule mt-4 mb-3" />
          <span className="tw-h">STICKER + HEART</span>
          <div className="row gap-2 mt-3" style={{ alignItems: "center" }}>
            <span className="sticker">v3.4 ENSEMBLE</span>
            <span className="sticker" style={{ background: "var(--green)" }}>NEW</span>
            <PixelHeart filled={true} size={14} />
            <PixelHeart filled={false} size={14} />
          </div>
        </div>
      </Section>

      {/* DATA VIZ */}
      <Section id="data" title="05 · DATA VIZ" subtitle="Crisp-edge SVGs. Volume, candles, sparklines, segmented bars, donuts, sprites.">
        <div style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
          <PixelPanel title="SPARKLINES" accent="cyan">
            <div className="col gap-3" style={{ padding: 18 }}>
              <div className="row gap-3" style={{ alignItems: "center" }}>
                <span className="font-display t-xs faint" style={{ width: 64 }}>UP</span>
                <Sparkline data={m.tickers[0].spark} width={200} height={36} />
              </div>
              <div className="row gap-3" style={{ alignItems: "center" }}>
                <span className="font-display t-xs faint" style={{ width: 64 }}>DOWN</span>
                <Sparkline data={m.tickers[7].spark} width={200} height={36} />
              </div>
              <div className="row gap-3" style={{ alignItems: "center" }}>
                <span className="font-display t-xs faint" style={{ width: 64 }}>NO FILL</span>
                <Sparkline data={m.tickers[2].spark} width={200} height={36} fill={false} />
              </div>
            </div>
          </PixelPanel>

          <PixelPanel title="SEGMENTED BARS (RISK SCORES)" accent="amber">
            <div className="col gap-3" style={{ padding: 18 }}>
              {[2, 5, 8, 10].map(v => (
                <div key={v} className="row gap-3" style={{ alignItems: "center" }}>
                  <span className="font-mono t-sm" style={{ width: 36 }}>{v}/10</span>
                  <div style={{ flex: 1 }}><SegmentedBar value={v} segments={10} /></div>
                </div>
              ))}
            </div>
          </PixelPanel>

          <PixelPanel title="RANGE BAR (52W)" accent="cyan">
            <div style={{ padding: 18 }}>
              <RangeBar low={120} high={240} current={184} />
            </div>
          </PixelPanel>

          <PixelPanel title="DONUT (ALLOCATION)" accent="violet">
            <div style={{ padding: 18, display: "flex", justifyContent: "center" }}>
              <PixelDonut
                size={140}
                thickness={20}
                data={[
                  { label: "A", value: 30, color: "var(--cyan)" },
                  { label: "B", value: 25, color: "var(--amber)" },
                  { label: "C", value: 20, color: "var(--green)" },
                  { label: "D", value: 15, color: "var(--violet)" },
                  { label: "E", value: 10, color: "var(--red)" }
                ]}
                center={
                  <div className="col" style={{ alignItems: "center", lineHeight: 1.1 }}>
                    <span className="font-display t-xs faint">TOTAL</span>
                    <span className="font-mono amber" style={{ fontSize: 22, fontWeight: 700 }}>100%</span>
                  </div>
                }
              />
            </div>
          </PixelPanel>
        </div>

        <PixelPanel className="mt-4" title="CANDLESTICKS + VOLUME" accent="green">
          <div style={{ padding: 12, overflowX: "auto" }}>
            <CandleChart candles={m.tickers[0].candles} width={bp.mobile ? 340 : 720} height={bp.mobile ? 180 : 240} />
            <VolumeBars candles={m.tickers[0].candles} width={bp.mobile ? 340 : 720} height={bp.mobile ? 40 : 60} />
          </div>
        </PixelPanel>

        <div className="pxl-inset mt-4" style={{ padding: 20 }}>
          <span className="tw-h">PROCEDURAL SPRITE MASCOTS</span>
          <p className="t-sm dim mt-2 mb-3" style={{ maxWidth: 620 }}>
            Each ticker gets a deterministic 16×16 symmetric sprite generated from its seed. Color shifts to match AI verdict.
          </p>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            {m.tickers.slice(0, 12).map(t => (
              <div key={t.sym} className="col" style={{ alignItems: "center", gap: 4, padding: 6 }}>
                <TickerSprite t={t} size={36} />
                <span className="font-display t-xs">{t.sym}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="pxl-inset mt-4" style={{ padding: 20 }}>
          <span className="tw-h">PIXEL ICONS (8×8 SPRITES)</span>
          <div className="row gap-3 mt-3" style={{ flexWrap: "wrap" }}>
            {["chart", "star", "bell", "search", "arrow_up", "arrow_down", "brain", "bolt", "shield", "news", "wallet", "bear"].map(n => (
              <div key={n} className="col" style={{ alignItems: "center", gap: 4, width: 64 }}>
                <PixelIcon name={n} color="var(--amber)" size={24} />
                <span className="font-display t-xs faint">{n}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* PANELS */}
      <Section id="panels" title="06 · PANELS + CONTAINERS" subtitle="Chunky framed boxes with title bar + status dot.">
        <div style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
          <PixelPanel title="DEFAULT PANEL" accent="cyan">
            <div className="p-4 t-sm dim">Standard container. Used for nearly everything.</div>
          </PixelPanel>
          <PixelPanel title="WITH ACTIONS" accent="amber" actions={<button className="pxl-btn sm">+ ADD</button>}>
            <div className="p-4 t-sm dim">Panel header supports trailing actions.</div>
          </PixelPanel>
          <PixelPanel title="STATUS DOT VARIANTS" accent="green">
            <div className="col gap-2 p-4">
              {["green", "red", "amber", "cyan"].map(d => (
                <div key={d} className="row gap-2" style={{ alignItems: "center" }}>
                  <span className="font-display t-xs faint" style={{ width: 60 }}>{d.toUpperCase()}</span>
                  <span className="pxl-head" style={{ display: "inline-flex", padding: "2px 8px", border: "none" }}>
                    <span className={`dot ${d}`} />
                  </span>
                </div>
              ))}
            </div>
          </PixelPanel>
          <div className="pxl-inset" style={{ padding: 20 }}>
            <span className="tw-h mb-2">INSET PANEL</span>
            <p className="t-sm dim mt-2">For nested forms, code blocks, secondary content. Darker interior with pressed-in shadow.</p>
            <div className="pxl-rule mt-3" />
            <p className="t-sm dim mt-3">Use <span className="font-mono amber">.pxl-rule</span> for soft dashed dividers.</p>
          </div>
        </div>
      </Section>

      {/* LAYOUT */}
      <Section id="layout" title="07 · LAYOUT + SPACING" subtitle="Pixel grid, 2px borders, no border-radius. 4/8/12/16/20/24 spacing scale.">
        <div className="pxl-inset" style={{ padding: 20 }}>
          <span className="tw-h">SPACING SCALE</span>
          <div className="col gap-3 mt-3">
            {[
              ["4px",  "gap-1, p-1"],
              ["8px",  "gap-2, p-2"],
              ["12px", "gap-3, p-3"],
              ["16px", "gap-4, p-4"],
              ["20px", "gap-5, p-5"],
              ["24px", "gap-6, p-6"]
            ].map(([px, cls]) => (
              <div key={px} className="row gap-3" style={{ alignItems: "center", borderBottom: "1px dashed var(--line)", paddingBottom: 6 }}>
                <span style={{ width: 48, fontFamily: "JetBrains Mono", fontSize: 12, fontWeight: 700 }}>{px}</span>
                <span style={{ height: 12, background: "var(--amber)", width: parseInt(px) }} />
                <span className="font-mono t-xs faint" style={{ flex: 1 }}>{cls}</span>
              </div>
            ))}
          </div>

          <span className="tw-h mt-4" style={{ display: "inline-flex" }}>BORDER WEIGHTS</span>
          <div className="row gap-3 mt-3" style={{ flexWrap: "wrap" }}>
            <div style={{ width: 80, height: 60, border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "JetBrains Mono", fontSize: 11 }}>1px</div>
            <div style={{ width: 80, height: 60, border: "2px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "JetBrains Mono", fontSize: 11 }}>2px</div>
            <div style={{ width: 80, height: 60, border: "2px dashed var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "JetBrains Mono", fontSize: 11 }}>dashed</div>
            <div style={{ width: 80, height: 60, background: "repeating-linear-gradient(to right, var(--line) 0 4px, transparent 4px 8px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "JetBrains Mono", fontSize: 11 }}>rule</div>
          </div>
        </div>

        <PixelPanel className="mt-4" title="BREAKPOINTS" accent="cyan">
          <div className="col gap-2" style={{ padding: 20 }}>
            <div className="row gap-3" style={{ alignItems: "center" }}>
              <span className="font-display t-xs faint" style={{ width: 90 }}>MOBILE</span>
              <span className="font-mono t-sm" style={{ width: 120 }}>≤ 720 px</span>
              <span className="t-xs dim">Single column, bottom tab bar, hamburger search</span>
            </div>
            <div className="row gap-3" style={{ alignItems: "center" }}>
              <span className="font-display t-xs faint" style={{ width: 90 }}>TABLET</span>
              <span className="font-mono t-sm" style={{ width: 120 }}>721 – 1100 px</span>
              <span className="t-xs dim">2-column layouts, condensed nav</span>
            </div>
            <div className="row gap-3" style={{ alignItems: "center" }}>
              <span className="font-display t-xs faint" style={{ width: 90 }}>DESKTOP</span>
              <span className="font-mono t-sm" style={{ width: 120 }}>≥ 1101 px</span>
              <span className="t-xs dim">Full multi-panel grid, status bar, marquee</span>
            </div>
          </div>
        </PixelPanel>
      </Section>

      {/* LOADING STATES */}
      <SkeletonsSection bp={bp} />

      {/* Footer */}
      <div className="pxl pxl-raised" style={{ padding: 24, textAlign: "center" }}>
        <span className="font-display t-xs faint">PIXEL DESIGN SYSTEM ▸ v3.4 ▸ NEURAL CORP MAY 2026</span>
      </div>
    </div>
  );
}

function SkeletonsSection({ bp }) {
  return (
    <Section id="loading" title="08 · LOADING STATES" subtitle="Chunky shimmer, dithered scans, typed-out AI reasoning. Real characters, not spinner stubs.">

      {/* Primitives */}
      <div className="pxl-inset" style={{ padding: 20, marginBottom: 16 }}>
        <span className="tw-h">PRIMITIVES</span>
        <div className="col gap-4 mt-3">
          <div className="row gap-3" style={{ alignItems: "center" }}>
            <span className="font-display t-xs faint" style={{ width: 110 }}>SHIMMER BLOCK</span>
            <Skel w={220} h={16} />
            <span className="font-mono t-xs faint">&lt;Skel w={220} h={16} /&gt;</span>
          </div>
          <div className="row gap-3" style={{ alignItems: "center" }}>
            <span className="font-display t-xs faint" style={{ width: 110 }}>SHIMMER LINE</span>
            <Skel w={120} h={10} />
            <span className="font-mono t-xs faint">small text placeholder</span>
          </div>
          <div className="row gap-3" style={{ alignItems: "center" }}>
            <span className="font-display t-xs faint" style={{ width: 110 }}>DITHERED PULSE</span>
            <SkelDither w={220} h={28} />
            <span className="font-mono t-xs faint">&lt;SkelDither /&gt;</span>
          </div>
          <div className="row gap-3" style={{ alignItems: "center" }}>
            <span className="font-display t-xs faint" style={{ width: 110 }}>PROGRESS BAR</span>
            <div style={{ width: 220 }}><SkelBar segments={12} /></div>
            <span className="font-mono t-xs faint">&lt;SkelBar segments={12} /&gt;</span>
          </div>
          <div className="row gap-3" style={{ alignItems: "center" }}>
            <span className="font-display t-xs faint" style={{ width: 110 }}>SPINNER</span>
            <Spinner label="LOADING" />
            <span className="font-mono t-xs faint">ASCII rotating bracket</span>
          </div>
          <div className="row gap-3" style={{ alignItems: "center" }}>
            <span className="font-display t-xs faint" style={{ width: 110 }}>LOADING TEXT</span>
            <span className="pxl-loading-text">FETCHING DATA</span>
            <span className="font-mono t-xs faint">blinking dots animation</span>
          </div>
        </div>
      </div>

      {/* Composite skeletons */}
      <div style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "repeat(2, 1fr)", gap: 16, marginBottom: 16 }}>
        <PixelPanel title="STAT TILE × 3" accent="cyan">
          <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <StatTileSkel /><StatTileSkel /><StatTileSkel />
          </div>
        </PixelPanel>

        <PixelPanel title="OPPORTUNITY CARD" accent="amber">
          <div style={{ padding: 12 }}>
            <OpportunityCardSkel />
          </div>
        </PixelPanel>

        <PixelPanel title="WATCHLIST ROWS" accent="cyan">
          {Array.from({ length: 4 }).map((_, i) => <WatchlistRowSkel key={i} />)}
        </PixelPanel>

        <PixelPanel title="NEWS ROWS" accent="cyan">
          {Array.from({ length: 4 }).map((_, i) => <NewsRowSkel key={i} />)}
        </PixelPanel>

        <PixelPanel title="DONUT" accent="violet">
          <div style={{ padding: 24 }}>
            <DonutSkel size={140} />
          </div>
        </PixelPanel>

        <PixelPanel title="CHART (SCANNING)" accent="green">
          <div style={{ padding: 12 }}>
            <SkelChart h={180} />
          </div>
        </PixelPanel>
      </div>

      {/* AI Digest skeleton — the showpiece */}
      <PixelPanel
        title="AI MARKET DIGEST · GENERATING"
        accent="amber"
        actions={<span className="sticker">v3.4</span>}
      >
        <AIDigestSkel />
      </PixelPanel>

      {/* Empty state */}
      <div className="mt-4" style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
        <PixelPanel title="EMPTY STATE" accent="amber">
          <EmptyState
            icon="search"
            title="NO TICKERS MATCH"
            subtitle="Try clearing filters or broadening your search query."
          />
        </PixelPanel>

        <PixelPanel title="LOADING OVERLAY" accent="cyan">
          <div style={{ height: 240, position: "relative" }}>
            <div style={{
              padding: 16, height: "100%",
              display: "flex", flexDirection: "column", gap: 8
            }}>
              <Skel w="80%" h={14} />
              <Skel w="50%" h={10} />
              <div style={{ flex: 1, marginTop: 8 }}><SkelChart h={120} /></div>
            </div>
            <LoadingOverlay label="SYNCING POSITIONS" />
          </div>
        </PixelPanel>
      </div>

      {/* Notes */}
      <div className="pxl-inset mt-4" style={{ padding: 18 }}>
        <span className="tw-h">DESIGN NOTES</span>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 10 }}>
          {[
            "Every shimmer uses CSS `steps()` — never smooth. Pixelated by design.",
            "Skeletons match the FOOTPRINT of the real content (same widths, heights, paddings). No layout shift.",
            "AI Digest skeleton types out actual reasoning text in real time — feels like the model is working, not waiting.",
            "Switch the entire app to loading mode from Tweaks → System → Loading states."
          ].map((line, i) => (
            <li key={i} className="row gap-2 mb-2" style={{ alignItems: "flex-start" }}>
              <span style={{ color: "var(--amber)", lineHeight: 1.55 }}>▸</span>
              <span className="t-sm" style={{ lineHeight: 1.55 }}>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

// Inject loading section into DesignSystem

function Section({ id, title, subtitle, children }) {
  return (
    <section id={id} style={{ scrollMarginTop: 80 }}>
      <div className="col gap-1 mb-3">
        <h2 style={{ fontFamily: "Silkscreen", fontSize: 22, letterSpacing: "0.04em", color: "var(--amber)" }}>
          {title}
        </h2>
        {subtitle && <span className="t-sm dim">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function TypeCard({ fam, role, use, cls }) {
  return (
    <div className="pxl-inset" style={{ padding: 18 }}>
      <span className="font-display t-xs faint">{role}</span>
      <div className={cls} style={{ fontSize: 28, marginTop: 6, marginBottom: 8 }}>
        Aa Bb 1234
      </div>
      <div className="font-mono t-sm" style={{ marginBottom: 6 }}>{fam}</div>
      <div className="t-xs dim">{use}</div>
    </div>
  );
}

function PaletteCard({ name, label, colors }) {
  return (
    <div className="pxl pxl-raised" style={{ padding: 14, background: colors["--bg-1"], borderColor: colors["--line"] }}>
      <div className="row gap-2 mb-3" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "Silkscreen", fontSize: 11, color: colors["--amber"], letterSpacing: "0.04em" }}>
          {label}
        </span>
        <span style={{ fontFamily: "Silkscreen", fontSize: 9, color: colors["--ink-faint"] }}>{name}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 8 }}>
        {["--bg-0", "--bg-1", "--bg-2", "--bg-3", "--line"].map(k => (
          <div key={k} style={{ height: 28, background: colors[k], border: `1px solid ${colors["--line-soft"]}` }} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 10 }}>
        {["--green", "--red", "--amber", "--cyan", "--violet"].map(k => (
          <div key={k} style={{ height: 22, background: colors[k], border: `1px solid ${colors["--line-soft"]}` }} />
        ))}
      </div>

      <div className="col gap-1">
        <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: colors["--ink"] }}>
          $184.22  <span style={{ color: colors["--green"], fontWeight: 700 }}>+3.84%</span>
        </span>
        <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: colors["--ink-dim"] }}>
          Halocore Semi · MKT OPEN
        </span>
      </div>
    </div>
  );
}

// Inline palette definitions (copied from app.jsx for self-contained DS preview)
const PALETTES_DS = {
  neural:   { "--bg-0":"#000000","--bg-1":"#070709","--bg-2":"#0d0d11","--bg-3":"#16161c","--bg-row":"#040406","--line":"#1a1a22","--line-soft":"#0f0f14","--ink":"#fafafa","--ink-dim":"#8a8a93","--ink-faint":"#4a4a52","--green":"#10b981","--green-dark":"#064e3b","--red":"#f43f5e","--red-dark":"#7f1d1d","--amber":"#f59e0b","--amber-dark":"#78350f","--cyan":"#3b82f6","--cyan-dark":"#1e3a8a","--violet":"#a855f7" },
  phosphor: { "--bg-0":"#07090f","--bg-1":"#0c1220","--bg-2":"#131c30","--bg-3":"#1a2540","--bg-row":"#0f1626","--line":"#233052","--line-soft":"#1a2440","--ink":"#d6dff0","--ink-dim":"#8693ad","--ink-faint":"#4d5a78","--green":"#5ce8a0","--green-dark":"#1b6b41","--red":"#ff5577","--red-dark":"#7a1d33","--amber":"#ffc23c","--amber-dark":"#7a5a10","--cyan":"#58d3ff","--cyan-dark":"#155e7a","--violet":"#b67bff" },
  amber:    { "--bg-0":"#0c0805","--bg-1":"#181208","--bg-2":"#22190d","--bg-3":"#2e2210","--bg-row":"#140e07","--line":"#3e2f18","--line-soft":"#241a0c","--ink":"#f8e5b0","--ink-dim":"#a68c5e","--ink-faint":"#5a4828","--green":"#b4e85c","--green-dark":"#4a6b1b","--red":"#ff8a5c","--red-dark":"#7a2d1d","--amber":"#f5b740","--amber-dark":"#7a5400","--cyan":"#ffd87a","--cyan-dark":"#7a6028","--violet":"#ff9558" },
  cyber:    { "--bg-0":"#04060a","--bg-1":"#080d18","--bg-2":"#0e1626","--bg-3":"#152040","--bg-row":"#0a1020","--line":"#2a1f5e","--line-soft":"#1a1442","--ink":"#e0d8ff","--ink-dim":"#8278c0","--ink-faint":"#4a3e88","--green":"#3effc8","--green-dark":"#0a6b50","--red":"#ff3da8","--red-dark":"#7a1855","--amber":"#ffe43d","--amber-dark":"#7a6a10","--cyan":"#7adbff","--cyan-dark":"#155e7a","--violet":"#c855ff" },
  matrix:   { "--bg-0":"#020604","--bg-1":"#061108","--bg-2":"#0a1c10","--bg-3":"#0e2a18","--bg-row":"#08160c","--line":"#1c4028","--line-soft":"#102a18","--ink":"#c8f0d0","--ink-dim":"#5e9070","--ink-faint":"#2e5a3c","--green":"#5cff8a","--green-dark":"#1b6b34","--red":"#ff8855","--red-dark":"#7a3a1d","--amber":"#d4ff5c","--amber-dark":"#5a7a14","--cyan":"#5cffd4","--cyan-dark":"#1b6b58","--violet":"#a8ff5c" },
  graphite: { "--bg-0":"#1c1c1e","--bg-1":"#28282b","--bg-2":"#33333a","--bg-3":"#42424a","--bg-row":"#222226","--line":"#525258","--line-soft":"#3a3a40","--ink":"#f0f0f2","--ink-dim":"#a8a8ae","--ink-faint":"#6a6a72","--green":"#5ce8a0","--green-dark":"#1b6b41","--red":"#ff5577","--red-dark":"#7a1d33","--amber":"#ffc23c","--amber-dark":"#7a5a10","--cyan":"#58d3ff","--cyan-dark":"#155e7a","--violet":"#b67bff" },
  paper:    { "--bg-0":"#ece6d4","--bg-1":"#f6f1e1","--bg-2":"#e6dfca","--bg-3":"#d9d0b4","--bg-row":"#efe9d6","--line":"#a89a72","--line-soft":"#cdc09c","--ink":"#1a1812","--ink-dim":"#5a523c","--ink-faint":"#8a805e","--green":"#176a3a","--green-dark":"#a8d4b8","--red":"#a81d34","--red-dark":"#e8b8c0","--amber":"#9a6800","--amber-dark":"#e8c878","--cyan":"#0c5a82","--cyan-dark":"#a8c8dc","--violet":"#5a2ab8" }
};


export { DesignSystem };
export { SkeletonsSection };


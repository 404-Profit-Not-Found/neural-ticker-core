// Pixel UI primitives for NEURAL//TICKER
// Converted from the original components.jsx — every primitive that
// was previously exposed as `window.X` is now an explicit named export.

import {
  useMemo,
  useState,
  useEffect,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Candle, Ticker } from '../lib/types.ts';

// -----------------------------------------------------------
// useMediaQuery — tracks if media query matches; returns bool
// -----------------------------------------------------------
export function useMediaQuery(query: string): boolean {
  const get = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState<boolean>(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent): void => setMatches(e.matches);
    setMatches(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, [query]);
  return matches;
}

export interface Breakpoint {
  mobile: boolean;
  tablet: boolean;
  desktop: boolean;
}

export function useBreakpoint(): Breakpoint {
  const forced =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('vp');
  const mobile = useMediaQuery('(max-width: 720px)');
  const tablet = useMediaQuery('(min-width: 721px) and (max-width: 1100px)');
  if (forced === 'mobile') return { mobile: true, tablet: false, desktop: false };
  if (forced === 'tablet') return { mobile: false, tablet: true, desktop: false };
  if (forced === 'desktop') return { mobile: false, tablet: false, desktop: true };
  return { mobile, tablet, desktop: !mobile && !tablet };
}

// -----------------------------------------------------------
// PixelPanel — chunky framed container with optional header
// -----------------------------------------------------------
interface PixelPanelProps {
  title?: ReactNode;
  accent?: string;
  actions?: ReactNode;
  children?: ReactNode;
  scroll?: boolean;
  height?: number | string;
  className?: string;
  inset?: boolean;
}

export function PixelPanel({
  title,
  accent = 'cyan',
  actions,
  children,
  scroll,
  height,
  className = '',
  inset = false,
}: PixelPanelProps) {
  return (
    <div
      className={`pxl ${inset ? 'pxl-inset' : ''} ${className}`}
      style={{ height, display: 'flex', flexDirection: 'column' }}
    >
      {title && (
        <div className="pxl-head">
          <span>
            <span className={`dot ${accent}`}></span>
            {title}
          </span>
          {actions && <span style={{ display: 'flex', gap: 8 }}>{actions}</span>}
        </div>
      )}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: scroll ? 'auto' : 'visible',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// PixelBadge — small uppercase stamp
// -----------------------------------------------------------
export function PixelBadge({
  tone = 'default',
  children,
  className = '',
}: {
  tone?: string;
  children?: ReactNode;
  className?: string;
}) {
  return <span className={`pxl-badge ${tone} ${className}`}>{children}</span>;
}

// -----------------------------------------------------------
// Sparkline — stepped pixel polyline, crisp edges
// -----------------------------------------------------------
export function Sparkline({
  data,
  width = 120,
  height = 32,
  color,
  fill = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  const path = useMemo(() => {
    if (!data || data.length < 2) return { line: '', area: '' };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const pts = data.map((v, i) => {
      const x = Math.round(i * stepX);
      const y = Math.round(height - ((v - min) / range) * (height - 2) - 1);
      return [x, y] as const;
    });
    const line = pts
      .map((p, i) => (i === 0 ? `M${p[0]} ${p[1]}` : `L${p[0]} ${p[1]}`))
      .join(' ');
    const area = `${line} L${width} ${height} L0 ${height} Z`;
    return { line, area };
  }, [data, width, height]);

  const up = data[data.length - 1] >= data[0];
  const stroke = color || (up ? 'var(--green)' : 'var(--red)');
  const fillColor = up ? 'rgba(92,232,160,0.15)' : 'rgba(255,85,119,0.15)';

  return (
    <svg
      className="pixel-svg"
      width={width}
      height={height}
      style={{ display: 'block' }}
    >
      {fill && <path d={path.area} fill={fillColor} />}
      <path d={path.line} fill="none" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

// -----------------------------------------------------------
// Candle chart — pixel candlesticks with grid
// -----------------------------------------------------------
export function CandleChart({
  candles,
  width = 720,
  height = 280,
  showGrid = true,
}: {
  candles: Candle[];
  width?: number;
  height?: number;
  showGrid?: boolean;
  showVolume?: boolean;
}) {
  const padding = { l: 56, r: 12, t: 12, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  const lows = candles.map((c) => c.l);
  const highs = candles.map((c) => c.h);
  const minP = Math.min(...lows);
  const maxP = Math.max(...highs);
  const range = maxP - minP || 1;
  const cw = Math.max(2, Math.floor(innerW / candles.length) - 2);
  const stepX = innerW / candles.length;

  const yFor = (p: number): number =>
    Math.round(padding.t + (1 - (p - minP) / range) * innerH);

  const gridLines: Array<{ y: number; v: string }> = [];
  if (showGrid) {
    for (let i = 0; i <= 4; i++) {
      const y = padding.t + (innerH * i) / 4;
      const v = (maxP - (range * i) / 4).toFixed(2);
      gridLines.push({ y, v });
    }
  }

  return (
    <svg
      className="pixel-svg"
      width={width}
      height={height}
      style={{ display: 'block', background: 'var(--bg-0)' }}
    >
      {gridLines.map((g, i) => (
        <g key={i}>
          <line
            x1={padding.l}
            y1={g.y}
            x2={width - padding.r}
            y2={g.y}
            stroke="var(--line-soft)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
          <text
            x={padding.l - 6}
            y={g.y + 3}
            fontFamily="JetBrains Mono, monospace"
            fontSize="10"
            fill="var(--ink-faint)"
            textAnchor="end"
          >
            {g.v}
          </text>
        </g>
      ))}

      <line
        x1={padding.l}
        y1={height - padding.b}
        x2={width - padding.r}
        y2={height - padding.b}
        stroke="var(--line)"
      />

      {candles.map((c, i) => {
        const x = Math.round(padding.l + i * stepX + (stepX - cw) / 2);
        const yH = yFor(c.h);
        const yL = yFor(c.l);
        const yO = yFor(c.o);
        const yC = yFor(c.c);
        const up = c.c >= c.o;
        const color = up ? 'var(--green)' : 'var(--red)';
        const top = Math.min(yO, yC);
        const bodyH = Math.max(2, Math.abs(yO - yC));
        return (
          <g key={i}>
            <line
              x1={x + Math.floor(cw / 2)}
              y1={yH}
              x2={x + Math.floor(cw / 2)}
              y2={yL}
              stroke={color}
              strokeWidth="2"
            />
            <rect x={x} y={top} width={cw} height={bodyH} fill={color} />
          </g>
        );
      })}

      {candles.length > 0 &&
        (() => {
          const last = candles[candles.length - 1].c;
          const y = yFor(last);
          return (
            <g>
              <line
                x1={padding.l}
                y1={y}
                x2={width - padding.r}
                y2={y}
                stroke="var(--amber)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <rect
                x={width - padding.r - 56}
                y={y - 8}
                width={56}
                height={16}
                fill="var(--amber)"
              />
              <text
                x={width - padding.r - 28}
                y={y + 3}
                fontFamily="JetBrains Mono, monospace"
                fontSize="10"
                fill="#1a1200"
                textAnchor="middle"
                fontWeight="700"
              >
                {last.toFixed(2)}
              </text>
            </g>
          );
        })()}
    </svg>
  );
}

// -----------------------------------------------------------
// PixelIcon — tiny CSS box-shadow rendered 8x8 sprites
// -----------------------------------------------------------
const ICON_SPRITES: Record<string, string[]> = {
  chart: ['00000010', '00000010', '00010010', '00010110', '00110110', '01110111', '11111111', '00000000'],
  star: ['00010000', '00010000', '00111000', '01111100', '11111110', '01101100', '01100110', '00000000'],
  bell: ['00011000', '00111100', '01111110', '01111110', '11111111', '11111111', '00011000', '00011000'],
  search: ['00111000', '01000100', '10000010', '10000010', '01000100', '00111100', '00000110', '00000011'],
  arrow_up: ['00011000', '00111100', '01111110', '11111111', '00111100', '00111100', '00111100', '00000000'],
  arrow_down: ['00111100', '00111100', '00111100', '11111111', '01111110', '00111100', '00011000', '00000000'],
  brain: ['00111100', '01011010', '11011011', '11111111', '11011011', '11011011', '01111110', '00100100'],
  bolt: ['00011100', '00111000', '01110000', '11111110', '00011100', '00111000', '01110000', '11000000'],
  shield: ['00111100', '01111110', '11111111', '11011011', '11011011', '11111111', '01111110', '00111100'],
  news: ['01111110', '10000001', '10110101', '10000001', '10110101', '10000001', '10110101', '11111111'],
  wallet: ['00000000', '01111100', '10000010', '10000010', '10011110', '10000010', '11111110', '00000000'],
  bear: ['11000011', '01000010', '00111100', '01011010', '01111110', '10100101', '01111110', '00100100'],
};

export function PixelIcon({
  name,
  color = 'currentColor',
  size = 16,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  const sprite = ICON_SPRITES[name];
  if (!sprite)
    return <span className="pxl-icon" style={{ width: size, height: size }} />;
  const px = Math.max(1, Math.floor(size / 8));
  const shadows: string[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (sprite[y][x] === '1') {
        shadows.push(`${x * px}px ${y * px}px 0 ${color}`);
      }
    }
  }
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8 * px,
        height: 8 * px,
        position: 'relative',
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: px,
          height: px,
          background: 'transparent',
          boxShadow: shadows.join(', '),
        }}
      />
    </span>
  );
}

// -----------------------------------------------------------
// SegmentedBar — chunky pixel progress with N segments
// -----------------------------------------------------------
export function SegmentedBar({
  value,
  max = 10,
  tone,
  segments = 10,
}: {
  value: number;
  max?: number;
  tone?: string;
  segments?: number;
}) {
  const cls = (i: number): string => {
    if (i >= Math.round((value / max) * segments)) return '';
    if (tone) return tone;
    if (value <= 3) return 'on';
    if (value <= 6) return 'warn';
    return 'danger';
  };
  return (
    <div className="pxl-bar">
      {Array.from({ length: segments }).map((_, i) => (
        <i key={i} className={cls(i)} />
      ))}
    </div>
  );
}

// -----------------------------------------------------------
// VerdictPill — AI rating with color
// -----------------------------------------------------------
export function VerdictPill({
  verdict,
  className = '',
}: {
  verdict: string;
  className?: string;
}) {
  const map: Record<string, { tone: string; icon: string }> = {
    'STRONG BUY': { tone: 'green', icon: 'bolt' },
    'NO BRAINER': { tone: 'green', icon: 'star' },
    SPECULATIVE: { tone: 'amber', icon: 'bolt' },
    HOLD: { tone: 'cyan', icon: 'shield' },
    SELL: { tone: 'red', icon: 'bear' },
  };
  const m = map[verdict] || map['HOLD'];
  return (
    <span className={`pxl-badge ${m.tone} ${className}`}>
      <PixelIcon name={m.icon} size={8} />
      {verdict}
    </span>
  );
}

// -----------------------------------------------------------
// PriceDelta — colored % change pill with arrow
// -----------------------------------------------------------
export function PriceDelta({
  pct,
  className = '',
}: {
  pct: number;
  size?: string;
  className?: string;
}) {
  const up = pct >= 0;
  const cls = up ? 'green' : 'red';
  return (
    <span
      className={`pxl-badge ${cls} ${className}`}
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
    >
      <PixelIcon name={up ? 'arrow_up' : 'arrow_down'} size={8} />
      {up ? '+' : ''}
      {pct.toFixed(2)}%
    </span>
  );
}

// -----------------------------------------------------------
// Range bar (52-week range marker)
// -----------------------------------------------------------
export function RangeBar({
  low,
  high,
  current,
}: {
  low: number;
  high: number;
  current: number;
}) {
  const pct = Math.max(0, Math.min(1, (current - low) / (high - low)));
  const marker = `calc(${pct * 100}% - 4px)`;
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          position: 'relative',
          height: 10,
          background: 'var(--bg-0)',
          border: '2px solid var(--line)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct * 100}%`,
            background:
              'linear-gradient(90deg, var(--cyan-dark), var(--cyan))',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -3,
            bottom: -3,
            left: marker,
            width: 6,
            background: 'var(--amber)',
            boxShadow: '0 0 8px var(--amber)',
          }}
        />
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <span className="t-xs faint font-mono">{low.toFixed(2)}</span>
        <span className="t-xs amber font-mono">{current.toFixed(2)}</span>
        <span className="t-xs faint font-mono">{high.toFixed(2)}</span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// SpriteMascot — procedural 16x16 pixel mascot from seed
// -----------------------------------------------------------
const SPRITE_CACHE = new Map<number, number[][]>();

function buildSprite(seedVal: number): number[][] {
  const cached = SPRITE_CACHE.get(seedVal);
  if (cached) return cached;
  let s = seedVal;
  const rng = (): number => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  const W = 16;
  const H = 16;
  const grid: number[][] = Array.from({ length: H }, () => new Array<number>(W).fill(0));

  const ovalCenterY = 5 + Math.floor(rng() * 4);
  const ovalRY = 4 + Math.floor(rng() * 3);
  const ovalRX = 3 + Math.floor(rng() * 2);

  for (let y = 1; y < H - 1; y++) {
    for (let x = 0; x < W / 2; x++) {
      const dx = W / 2 - 1 - x;
      const dy = y - ovalCenterY;
      const inside =
        (dx * dx) / (ovalRX * ovalRX) + (dy * dy) / (ovalRY * ovalRY) <= 1.2;
      if (!inside) continue;
      const v = rng();
      grid[y][x] = v < 0.7 ? 1 : v < 0.92 ? 2 : 0;
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W / 2; x++) {
      grid[y][W - 1 - x] = grid[y][x];
    }
  }

  const eyeY = Math.max(1, ovalCenterY - 1);
  const eyeX = 5 + Math.floor(rng() * 2);
  grid[eyeY][eyeX] = 3;
  grid[eyeY][W - 1 - eyeX] = 3;

  SPRITE_CACHE.set(seedVal, grid);
  return grid;
}

export function SpriteMascot({
  seed,
  size = 40,
  colors,
}: {
  seed: number;
  size?: number;
  colors?: string[];
}) {
  const grid = buildSprite(seed);
  const px = Math.max(1, Math.floor(size / 16));
  const c = colors || [
    'transparent',
    'var(--cyan)',
    'var(--cyan-dark)',
    'var(--amber)',
  ];

  const shadows: string[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = grid[y][x];
      if (v) shadows.push(`${x * px}px ${y * px}px 0 ${c[v]}`);
    }
  }

  return (
    <span
      style={{
        display: 'inline-block',
        width: 16 * px,
        height: 16 * px,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: px,
          height: px,
          boxShadow: shadows.join(', '),
        }}
      />
    </span>
  );
}

const SECTOR_COLORS: Record<string, string[]> = {
  green: ['transparent', 'var(--green)', 'var(--green-dark)', 'var(--amber)'],
  cyan: ['transparent', 'var(--cyan)', 'var(--cyan-dark)', 'var(--amber)'],
  amber: ['transparent', 'var(--amber)', 'var(--amber-dark)', 'var(--cyan)'],
  red: ['transparent', 'var(--red)', 'var(--red-dark)', 'var(--amber)'],
  violet: ['transparent', 'var(--violet)', '#5a3a7a', 'var(--cyan)'],
};

export function TickerSprite({
  t,
  size = 40,
  logoUrl,
  pixelate = true,
}: {
  t: Ticker | (Partial<Ticker> & { sym: string; seed: number; ai?: string });
  size?: number;
  logoUrl?: string;
  pixelate?: boolean;
}) {
  const map: Record<string, string> = {
    'STRONG BUY': 'green',
    'NO BRAINER': 'green',
    SPECULATIVE: 'amber',
    HOLD: 'cyan',
    SELL: 'red',
  };
  const tone = map[t.ai ?? 'HOLD'] || 'cyan';

  const src = logoUrl || (t as { logo?: string; logo_url?: string }).logo || (t as { logo_url?: string }).logo_url;
  const [failed, setFailed] = useState(false);
  const useLogo = src && !failed;

  return (
    <div
      style={{
        width: size + 8,
        height: size + 8,
        padding: 4,
        background: 'var(--bg-0)',
        border: '2px solid var(--line)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 2px 0 0 rgba(255,255,255,0.04)',
        flexShrink: 0,
      }}
    >
      {useLogo ? (
        <img
          src={src}
          alt={t.sym}
          onError={() => setFailed(true)}
          style={{
            width: size,
            height: size,
            objectFit: 'contain',
            imageRendering: pixelate ? 'pixelated' : 'auto',
            filter: pixelate ? 'contrast(1.05)' : undefined,
          }}
        />
      ) : (
        <SpriteMascot
          seed={t.seed * 17 + 3}
          size={size}
          colors={SECTOR_COLORS[tone]}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------
// VolumeBars — pixel volume bars matched to candles
// -----------------------------------------------------------
export function VolumeBars({
  candles,
  width = 720,
  height = 60,
  leftPad = 56,
  rightPad = 12,
}: {
  candles: Candle[];
  width?: number;
  height?: number;
  leftPad?: number;
  rightPad?: number;
}) {
  const innerW = width - leftPad - rightPad;
  const stepX = innerW / candles.length;
  const cw = Math.max(2, Math.floor(innerW / candles.length) - 2);
  const vols = candles.map((c) => (c.h - c.l) * (10 + (c.c % 4)));
  const maxV = Math.max(...vols);

  return (
    <svg
      className="pixel-svg"
      width={width}
      height={height}
      style={{ display: 'block', background: 'var(--bg-0)' }}
    >
      <line
        x1={leftPad}
        y1={height - 1}
        x2={width - rightPad}
        y2={height - 1}
        stroke="var(--line)"
      />
      {candles.map((c, i) => {
        const v = vols[i];
        const x = Math.round(leftPad + i * stepX + (stepX - cw) / 2);
        const h = Math.round((v / maxV) * (height - 8));
        const y = height - h - 2;
        const up = c.c >= c.o;
        const color = up ? 'var(--green-dark)' : 'var(--red-dark)';
        return <rect key={i} x={x} y={y} width={cw} height={h} fill={color} />;
      })}
      <text
        x={leftPad - 6}
        y={height / 2 + 3}
        fontFamily="Silkscreen, monospace"
        fontSize="9"
        fill="var(--ink-faint)"
        textAnchor="end"
      >
        VOL
      </text>
    </svg>
  );
}

// -----------------------------------------------------------
// PixelDonut — sector allocation donut, pixel-rendered
// -----------------------------------------------------------
export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function PixelDonut({
  data,
  size = 160,
  thickness = 18,
  center,
}: {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - thickness / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  let acc = 0;

  function arcPath(start: number, end: number): string {
    const a0 = start * Math.PI * 2 - Math.PI / 2;
    const a1 = end * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = end - start > 0.5 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg className="pixel-svg" width={size} height={size}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--bg-3)"
          strokeWidth={thickness}
        />
        {data.map((d, i) => {
          const start = acc / total;
          acc += d.value;
          const end = acc / total;
          const gap = 0.01;
          return (
            <path
              key={i}
              d={arcPath(start + gap, end - gap)}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {center}
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// PixelHeart — favorited indicator
// -----------------------------------------------------------
export function PixelHeart({
  filled = true,
  size = 12,
  color = 'var(--red)',
}: {
  filled?: boolean;
  size?: number;
  color?: string;
}) {
  const grid = [
    '0110110',
    '1111111',
    '1111111',
    '1111111',
    '0111110',
    '0011100',
    '0001000',
  ];
  const px = Math.max(1, Math.floor(size / 7));
  const shadows: string[] = [];
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      if (grid[y][x] === '1')
        shadows.push(
          `${x * px}px ${y * px}px 0 ${filled ? color : 'var(--ink-faint)'}`,
        );
    }
  }
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7 * px,
        height: 7 * px,
        position: 'relative',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: px,
          height: px,
          boxShadow: shadows.join(', '),
        }}
      />
    </span>
  );
}

// -----------------------------------------------------------
// RankBadge — gamified user rank stamp (WHALE, etc.)
// -----------------------------------------------------------
export function RankBadge({ rank }: { rank: string }) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    WHALE: { bg: 'linear-gradient(180deg, #ffe48a, #d4a020)', text: '#3a2a00', border: '#7a5400' },
    DIAMOND: { bg: 'linear-gradient(180deg, #b8f0ff, #58d3ff)', text: '#001a26', border: '#155e7a' },
    ADMIN: { bg: 'linear-gradient(180deg, #ff8aa8, #ff5577)', text: '#2a0010', border: '#7a1d33' },
    PRO: { bg: 'linear-gradient(180deg, #a8ffc8, #5ce8a0)', text: '#003018', border: '#1b6b41' },
  };
  const m = map[rank] || map['PRO'];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: 'Silkscreen, monospace',
        fontSize: 9,
        letterSpacing: '0.08em',
        padding: '3px 6px',
        background: m.bg,
        color: m.text,
        border: `2px solid ${m.border}`,
        boxShadow:
          'inset 0 2px 0 0 rgba(255,255,255,0.4), inset 0 -2px 0 0 rgba(0,0,0,0.15)',
      }}
    >
      ★ {rank}
    </span>
  );
}

// -----------------------------------------------------------
// StatusLED — small blinking indicator
// -----------------------------------------------------------
export function StatusLED({
  tone = 'green',
  label,
}: {
  tone?: string;
  label?: ReactNode;
}) {
  return (
    <span className="row gap-1" style={{ alignItems: 'center' }}>
      <span
        style={{
          width: 6,
          height: 6,
          background: `var(--${tone})`,
          boxShadow: `0 0 4px var(--${tone})`,
          animation: 'blink 2s steps(2) infinite',
        }}
      />
      <span className="font-display t-xs faint">{label}</span>
    </span>
  );
}

// -----------------------------------------------------------
// RiskRadar — pentagon radar chart, pixel-stepped axes.
// -----------------------------------------------------------
export function RiskRadar({
  values,
  labels,
  size = 220,
  color = 'var(--amber)',
}: {
  values: number[];
  labels?: string[];
  size?: number;
  color?: string;
}) {
  const n = (labels && labels.length) || (values && values.length) || 5;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 26;

  const polar = (idx: number, magnitude: number): [number, number] => {
    const a = (idx / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * maxR * magnitude, cy + Math.sin(a) * maxR * magnitude];
  };

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const axes = Array.from({ length: n }).map((_, i) => polar(i, 1));
  const dataPts = (values || []).map((v, i) =>
    polar(i, Math.max(0, Math.min(1, Number(v) / 10))),
  );
  const dataPath =
    dataPts.map((p, i) => (i === 0 ? `M${p[0]} ${p[1]}` : `L${p[0]} ${p[1]}`)).join(' ') +
    ' Z';

  return (
    <svg
      className="pixel-svg"
      width={size}
      height={size}
      style={{ display: 'block' }}
    >
      {gridLevels.map((g, lvl) => {
        const pts = Array.from({ length: n }, (_, i) => polar(i, g));
        const d =
          pts.map((p, i) => (i === 0 ? `M${p[0]} ${p[1]}` : `L${p[0]} ${p[1]}`)).join(' ') +
          ' Z';
        return (
          <path
            key={lvl}
            d={d}
            fill="none"
            stroke={lvl === gridLevels.length - 1 ? 'var(--line)' : 'var(--line-soft)'}
            strokeDasharray={lvl < gridLevels.length - 1 ? '2 2' : undefined}
            strokeWidth="1"
          />
        );
      })}
      {axes.map(([x, y], i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={x}
          y2={y}
          stroke="var(--line-soft)"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      ))}
      <path
        d={dataPath}
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="2"
      />
      {dataPts.map(([x, y], i) => (
        <rect key={i} x={x - 3} y={y - 3} width="6" height="6" fill={color} />
      ))}
      {(labels || []).map((lbl, i) => {
        const [x, y] = polar(i, 1.18);
        const anchor: 'start' | 'middle' | 'end' =
          Math.abs(x - cx) < 6 ? 'middle' : x < cx ? 'end' : 'start';
        return (
          <g key={i}>
            <text
              x={x}
              y={y + 4}
              fontFamily="Silkscreen, monospace"
              fontSize="9"
              fill="var(--ink-dim)"
              textAnchor={anchor}
              style={{ letterSpacing: '0.06em' }}
            >
              {lbl}
            </text>
            <text
              x={x}
              y={y + 14}
              fontFamily="JetBrains Mono, monospace"
              fontSize="9"
              fill={color}
              textAnchor={anchor}
              fontWeight="700"
            >
              {Number(values[i] || 0).toFixed(0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export type { CSSProperties };

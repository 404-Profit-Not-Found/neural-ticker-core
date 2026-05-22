// Mock dataset for pixel terminal — original tickers & content, no copyrighted feed.
// Symbols are fictionalised brand-ish names so the design stands on its own.

import type { Candle, Ticker, Index, NewsItem } from './types.ts';

interface NewsRow {
  time: string;
  src: string;
  tag: string;
  impact: 'high' | 'med' | 'low';
  title: string;
  tickers: string[];
}

interface ScenarioRow {
  name: string;
  prob: number;
  target: number;
  label: string;
}

interface AiVerdict {
  summary: string;
  pros: string[];
  cons: string[];
  scenarios: ScenarioRow[];
  risks: {
    financial: number;
    execution: number;
    dilution: number;
    competitive: number;
    regulatory: number;
  };
}

interface PortfolioPositionMock {
  sym: string;
  qty: number;
  avg: number;
  last: number;
  pnl: number;
  pnlPct: number;
}

interface PortfolioMock {
  value: number;
  gain: number;
  gainPct: number;
  positions: PortfolioPositionMock[];
}

export interface MockData {
  tickers: Ticker[];
  news: NewsRow[];
  newsItems: NewsItem[];
  aiVerdict: AiVerdict;
  portfolio: PortfolioMock;
  indices: Index[];
}

function seed(s: number): () => number {
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function genSpark(s: number, n: number, drift: number): number[] {
  const r = seed(s);
  const out: number[] = [];
  let v = 50 + r() * 50;
  for (let i = 0; i < n; i++) {
    v += (r() - 0.5) * 8 + drift;
    out.push(Math.max(2, v));
  }
  return out;
}

function genCandles(s: number, n: number): Candle[] {
  const r = seed(s);
  const out: Candle[] = [];
  let close = 180;
  for (let i = 0; i < n; i++) {
    const open = close;
    const range = 2 + r() * 6;
    const dir = r() > 0.45 ? 1 : -1;
    close = open + dir * r() * range;
    const high = Math.max(open, close) + r() * 2;
    const low = Math.min(open, close) - r() * 2;
    out.push({ o: open, h: high, l: low, c: close });
  }
  return out;
}

const rawTickers: Array<Omit<Ticker, 'spark' | 'candles'>> = [
  { sym: 'ZYRA', name: 'Zyra Robotics Corp', sector: 'Industrials / Automation', price: 184.22, change: 3.84, ai: 'STRONG BUY', risk: 3, upside: 42.5, mc: '184.2B', pe: 38.4, seed: 11, logo: 'logos/zyra.png' },
  { sym: 'HALO', name: 'Halocore Semiconductors', sector: 'Semiconductors', price: 902.18, change: 1.12, ai: 'NO BRAINER', risk: 4, upside: 31.0, mc: '2.21T', pe: 64.2, seed: 22, logo: 'logos/halo.png' },
  { sym: 'QULM', name: 'Qulm Neural Systems', sector: 'AI Infrastructure', price: 71.40, change: -2.14, ai: 'SPECULATIVE', risk: 7, upside: 88.0, mc: '12.4B', pe: null, seed: 33, logo: 'logos/qulm.png' },
  { sym: 'ORBT', name: 'Orbital Logistics SE', sector: 'Aerospace', price: 42.06, change: 0.42, ai: 'STRONG BUY', risk: 4, upside: 28.4, mc: '8.1B', pe: 22.1, seed: 44, logo: 'logos/orbt.png' },
  { sym: 'VRDN', name: 'Verdant Energy Holdings', sector: 'Renewables', price: 13.85, change: -1.32, ai: 'HOLD', risk: 6, upside: 14.2, mc: '4.2B', pe: 18.0, seed: 55 },
  { sym: 'PRSM', name: 'Prism Biocomputing', sector: 'Biotech', price: 220.55, change: 5.61, ai: 'NO BRAINER', risk: 5, upside: 51.7, mc: '44.1B', pe: 88.3, seed: 66, logo: 'logos/prsm.png' },
  { sym: 'NOVA', name: 'Nova Quantum Cloud', sector: 'Cloud / Quantum', price: 312.04, change: 2.11, ai: 'STRONG BUY', risk: 4, upside: 33.2, mc: '92.0B', pe: 52.4, seed: 77, logo: 'logos/nova.png' },
  { sym: 'GLCH', name: 'Glacier Capital Trust', sector: 'Financials', price: 58.92, change: -0.84, ai: 'SELL', risk: 7, upside: -12.0, mc: '6.7B', pe: 14.2, seed: 88 },
  { sym: 'TSUN', name: 'Tsunami Networks', sector: 'Telecom', price: 24.10, change: 0.18, ai: 'HOLD', risk: 5, upside: 8.0, mc: '3.0B', pe: 28.0, seed: 99 },
  { sym: 'AURA', name: 'Aura Display Systems', sector: 'Hardware', price: 145.66, change: 4.42, ai: 'STRONG BUY', risk: 3, upside: 22.1, mc: '61.2B', pe: 41.0, seed: 110 },
  { sym: 'HEXR', name: 'Hexar Defense Group', sector: 'Defense', price: 488.12, change: 1.04, ai: 'NO BRAINER', risk: 3, upside: 18.0, mc: '112.0B', pe: 36.8, seed: 121 },
  { sym: 'MARC', name: 'Marcato Auto Works', sector: 'EVs', price: 28.41, change: -3.22, ai: 'SELL', risk: 8, upside: -22.0, mc: '1.9B', pe: null, seed: 132 },
];

const tickers: Ticker[] = rawTickers.map((t) => ({
  ...t,
  spark: genSpark(t.seed, 32, t.change / 12),
  candles: genCandles(t.seed + 1, 60),
}));

const news: NewsRow[] = [
  { time: '12:42', src: 'REUTERS', tag: 'MACRO', impact: 'high', title: 'Fed signals data-dependent pause; yields ease across the curve', tickers: ['NOVA', 'HALO'] },
  { time: '12:31', src: 'BLOOMBERG', tag: 'EARNINGS', impact: 'med', title: 'Halocore beats Q3 by 14%; raises full-year datacenter outlook', tickers: ['HALO'] },
  { time: '12:18', src: 'WSJ', tag: 'DEAL', impact: 'med', title: 'Zyra Robotics nears $2.4B factory automation contract with Tier-1 OEM', tickers: ['ZYRA'] },
  { time: '12:02', src: 'REUTERS', tag: 'REG', impact: 'low', title: 'EU opens technical review of cross-border quantum data transfer rules', tickers: ['NOVA', 'QULM'] },
  { time: '11:50', src: 'FT', tag: 'DOWNGRADE', impact: 'med', title: 'Glacier Capital cut to underweight at Morgan Pierce on credit cycle', tickers: ['GLCH'] },
  { time: '11:31', src: 'REUTERS', tag: 'MACRO', impact: 'high', title: 'Brent crude climbs 1.8% on Gulf shipping disruption headlines', tickers: [] },
  { time: '11:14', src: 'BLOOMBERG', tag: 'ANALYST', impact: 'low', title: 'Aura Display reiterated buy at Lockwood; PT raised to $172', tickers: ['AURA'] },
  { time: '10:58', src: 'AP', tag: 'MACRO', impact: 'low', title: 'ISM services index ticks up; new orders subcomponent strongest in 9 mo.', tickers: [] },
];

const newsItems: NewsItem[] = news.map((n, i) => ({
  id: i,
  title: n.title,
  source: n.src,
  published_at: n.time,
}));

const aiVerdict: AiVerdict = {
  summary: 'Zyra is positioned at the inflection of industrial robotics adoption. Margins inflected positive in Q3 on the heels of the Helix-7 platform launch. Order book extension and softening lithium input costs widen the path to consensus FY guide. Bear case: capex cycle exposure if PMI re-rolls below 48.',
  pros: [
    'Backlog +38% YoY; 11.4 months coverage',
    'Gross margin +220bps; mix shift to recurring',
    'Free cash flow inflected, $312M TTM',
    'Insider buying cluster — 4 directors, $5.2M',
  ],
  cons: [
    'China revenue exposure ~22%',
    'Forward P/E premium vs. peer median 12x',
    'Capex sensitive to ISM <50 regime',
  ],
  scenarios: [
    { name: 'BULL', prob: 0.30, target: 262.00, label: 'Helix-7 ramps; margin > 28%' },
    { name: 'BASE', prob: 0.50, target: 218.00, label: 'Backlog conversion in-line' },
    { name: 'BEAR', prob: 0.20, target: 138.00, label: 'Capex cycle stalls in H2' },
  ],
  risks: { financial: 3, execution: 4, dilution: 2, competitive: 5, regulatory: 3 },
};

const portfolio: PortfolioMock = {
  value: 184230.55,
  gain: 12442.18,
  gainPct: 7.24,
  positions: [
    { sym: 'ZYRA', qty: 240, avg: 152.40, last: 184.22, pnl: 7636.80, pnlPct: 20.9 },
    { sym: 'HALO', qty: 12, avg: 820.10, last: 902.18, pnl: 984.96, pnlPct: 10.0 },
    { sym: 'AURA', qty: 80, avg: 121.50, last: 145.66, pnl: 1932.80, pnlPct: 19.9 },
    { sym: 'ORBT', qty: 320, avg: 38.20, last: 42.06, pnl: 1235.20, pnlPct: 10.1 },
    { sym: 'VRDN', qty: 600, avg: 15.90, last: 13.85, pnl: -1230.00, pnlPct: -12.9 },
    { sym: 'PRSM', qty: 20, avg: 210.00, last: 220.55, pnl: 211.00, pnlPct: 5.0 },
  ],
};

const indices: Index[] = [
  { name: 'S&P FTR', val: 5842.18, ch: 0.42 },
  { name: 'NASD-X', val: 18221.4, ch: 0.71 },
  { name: 'DJ-IND', val: 42118.0, ch: 0.18 },
  { name: 'RUSS-2K', val: 2284.55, ch: -0.22 },
  { name: 'VIX', val: 14.21, ch: -2.10 },
  { name: 'BRENT', val: 78.42, ch: 1.82 },
  { name: 'GOLD', val: 2641.10, ch: 0.31 },
  { name: '10Y UST', val: 4.218, ch: -1.2 },
  { name: 'BTC-USD', val: 71240.0, ch: 0.92 },
  { name: 'EUR/USD', val: 1.0842, ch: -0.14 },
];

export const MOCK: MockData = { tickers, news, newsItems, aiVerdict, portfolio, indices };

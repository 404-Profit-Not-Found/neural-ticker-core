// Ticker universe for the mock. Real-looking symbols, plus deliberate edge
// cases (marked EDGE). Prices are illustrative fixtures, not market data.

export interface SeedTicker {
  sym: string;
  name: string;
  exchange: string;
  currency: string;
  country: string;
  /** Finnhub-style industry; stored as both `sector` and `finnhub_industry`
   *  (tickers.service.ts ensureTicker: `sector: profile.finnhubIndustry`). */
  sector: string;
  /** `tickers.industry` — nullable in the entity and frequently NULL. */
  industry: string | null;
  price: number;
  /** Day change in percent; prevClose is derived from it. */
  chg: number;
  /** Market cap in billions of the native currency. */
  mcapB: number;
  pe: number | null;
  /** Neural overall score 0–10; null = ticker has no risk analysis yet. */
  score: number | null;
  /** financial_risk 0–10 (10 = worst). */
  risk: number;
  /** Base-scenario upside vs current price, percent. */
  upside: number;
  consensus: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | null;
  /** ok = logo served; broken = logo_url set but GET …/logo is 404;
   *  none = logo_url null and 404. ~20% are not `ok` on purpose. */
  logo: 'ok' | 'broken' | 'none';
  /** Annualised volatility used by the history generator. */
  vol: number;
  /** Annualised drift used by the history generator. */
  drift: number;
  sentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  newsImpact?: number;
  hidden?: boolean;
  dividend?: number;
  web?: string;
}

type Row = [
  sym: string,
  name: string,
  exchange: string,
  currency: string,
  country: string,
  sector: string,
  industry: string | null,
  price: number,
  chg: number,
  mcapB: number,
  pe: number | null,
  score: number | null,
  risk: number,
  upside: number,
  consensus: SeedTicker['consensus'],
  logo: SeedTicker['logo'],
  vol: number,
  drift: number,
  extra?: Partial<SeedTicker>,
];

// prettier-ignore
const ROWS: Row[] = [
  ['AAPL', 'Apple Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Technology', 'Consumer Electronics', 232.29, 1.05, 3480, 35.2, 7.2, 2.5, 9.4, 'Buy', 'ok', 0.24, 0.18, { sentiment: 'BULLISH', newsImpact: 6, dividend: 0.44, web: 'https://www.apple.com/' }],
  ['MSFT', 'Microsoft Corp', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Technology', 'Software - Infrastructure', 431.1, -1.04, 3205, 36.4, 8.1, 2.0, 16.8, 'Strong Buy', 'ok', 0.22, 0.2, { sentiment: 'BULLISH', newsImpact: 5, dividend: 0.72, web: 'https://www.microsoft.com/' }],
  ['NVDA', 'NVIDIA Corp', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Semiconductors', 'Semiconductors', 121.4, 2.84, 2978, 56.9, 8.4, 3.0, 31.5, 'Strong Buy', 'ok', 0.48, 0.55, { sentiment: 'BULLISH', newsImpact: 9, dividend: 0.03, web: 'https://www.nvidia.com/' }],
  ['GOOGL', 'Alphabet Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Media', 'Internet Content & Information', 168.42, 0.31, 2070, 24.1, 7.9, 2.5, 22.3, 'Strong Buy', 'ok', 0.27, 0.2, { sentiment: 'NEUTRAL', newsImpact: 4, web: 'https://abc.xyz/' }],
  ['AMZN', 'Amazon.com Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Retail', 'Internet Retail', 189.75, -0.62, 1990, 45.3, 7.4, 3.0, 18.9, 'Strong Buy', 'ok', 0.3, 0.19, { sentiment: 'BULLISH', newsImpact: 5, web: 'https://www.amazon.com/' }],
  ['META', 'Meta Platforms Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Media', 'Internet Content & Information', 561.3, 1.92, 1420, 28.7, 7.8, 3.5, 14.2, 'Buy', 'ok', 0.34, 0.3, { sentiment: 'BULLISH', newsImpact: 7, dividend: 0.36 }],
  ['TSLA', 'Tesla Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Automobiles', 'Auto Manufacturers', 248.5, -3.41, 794, 68.2, 5.2, 6.5, -8.5, 'Hold', 'ok', 0.58, 0.1, { sentiment: 'BEARISH', newsImpact: 8, web: 'https://www.tesla.com/' }],
  // EDGE: exactly zero change.
  ['AMD', 'Advanced Micro Devices Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Semiconductors', 'Semiconductors', 156.8, 0, 254, 187.4, 7.0, 4.0, 24.6, 'Buy', 'ok', 0.46, 0.22, { sentiment: 'NEUTRAL', newsImpact: 3 }],
  ['PLTR', 'Palantir Technologies Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Technology', 'Software - Infrastructure', 37.2, 4.12, 83, 219.0, 6.4, 5.5, 6.1, 'Hold', 'ok', 0.62, 0.6, { sentiment: 'BULLISH', newsImpact: 6 }],
  ['AVGO', 'Broadcom Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Semiconductors', 'Semiconductors', 172.6, 0.88, 806, 138.5, 7.7, 3.5, 12.4, 'Strong Buy', 'ok', 0.36, 0.35, { dividend: 1.22 }],
  ['NFLX', 'Netflix Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Media', 'Entertainment', 705.4, -0.27, 302, 43.6, 7.1, 3.5, 5.8, 'Buy', 'ok', 0.33, 0.4],
  ['CRM', 'Salesforce Inc', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Technology', 'Software - Application', 272.9, 0.54, 264, 47.8, 6.8, 3.0, 13.3, 'Buy', 'ok', 0.3, 0.12, { dividend: 0.59 }],
  ['ORCL', 'Oracle Corp', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Technology', 'Software - Infrastructure', 168.3, -1.15, 466, 43.2, 6.9, 4.5, 7.7, 'Buy', 'ok', 0.29, 0.3, { dividend: 0.95 }],
  // EDGE: null P/E (loss-making), bearish.
  ['INTC', 'Intel Corp', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Semiconductors', 'Semiconductors', 22.84, -2.36, 98, null, 4.4, 6.5, 11.2, 'Hold', 'ok', 0.44, -0.3, { sentiment: 'BEARISH', newsImpact: 7 }],
  ['JPM', 'JPMorgan Chase & Co', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Banking', 'Banks - Diversified', 210.75, 0.42, 601, 11.8, 7.6, 3.0, 8.9, 'Buy', 'ok', 0.21, 0.2, { dividend: 2.37 }],
  ['V', 'Visa Inc', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Financial Services', 'Credit Services', 274.1, 0.12, 541, 29.4, 7.5, 2.0, 15.1, 'Strong Buy', 'ok', 0.19, 0.12, { dividend: 0.76 }],
  // EDGE: huge share price.
  ['BRK.A', 'Berkshire Hathaway Inc', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Insurance', 'Insurance - Diversified', 689420, 0.18, 992, 9.6, 7.3, 1.5, 4.2, 'Buy', 'ok', 0.16, 0.14],
  ['UNH', 'UnitedHealth Group Inc', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Health Care', 'Healthcare Plans', 584.2, -0.74, 539, 38.1, 6.7, 4.0, 9.6, 'Buy', 'ok', 0.22, 0.08, { dividend: 1.44 }],
  // Highest neural score → NO BRAINER in v2's scoreToVerdict.
  ['LLY', 'Eli Lilly and Co', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Pharmaceuticals', 'Drug Manufacturers - General', 921.5, 1.33, 875, 112.4, 9.1, 2.5, 19.7, 'Strong Buy', 'ok', 0.3, 0.45, { sentiment: 'BULLISH', newsImpact: 8, dividend: 0.56 }],
  ['JNJ', 'Johnson & Johnson', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Pharmaceuticals', 'Drug Manufacturers - General', 161.9, -0.09, 390, 23.9, 6.5, 2.0, 7.3, 'Hold', 'ok', 0.15, 0.03, { dividend: 3.06 }],
  ['PFE', 'Pfizer Inc', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Pharmaceuticals', 'Drug Manufacturers - General', 29.12, -0.48, 165, null, 4.9, 4.5, 14.8, 'Hold', 'broken', 0.23, -0.15, { dividend: 5.77 }],
  ['XOM', 'Exxon Mobil Corp', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Energy', 'Oil & Gas Integrated', 117.4, 0.95, 521, 14.1, 6.6, 3.0, 10.5, 'Buy', 'ok', 0.24, 0.1, { dividend: 3.24 }],
  ['CVX', 'Chevron Corp', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Energy', 'Oil & Gas Integrated', 147.85, 0.61, 270, 14.6, 6.2, 3.5, 12.0, 'Buy', 'ok', 0.23, 0.02, { dividend: 4.41 }],
  ['WMT', 'Walmart Inc', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Retail', 'Discount Stores', 80.4, 0.22, 646, 41.7, 7.0, 2.0, 5.5, 'Buy', 'ok', 0.17, 0.3, { dividend: 1.03 }],
  ['KO', 'Coca-Cola Co', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Beverages', 'Beverages - Non-Alcoholic', 71.25, -0.11, 307, 28.9, 6.4, 1.5, 6.0, 'Buy', 'ok', 0.13, 0.1, { dividend: 2.72 }],
  ['DIS', 'Walt Disney Co', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Media', 'Entertainment', 93.6, -1.02, 170, 35.9, 5.5, 4.5, 20.4, 'Buy', 'ok', 0.27, -0.05, { dividend: 0.96 }],
  ['BA', 'Boeing Co', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Aerospace & Defense', 'Aerospace & Defense', 154.9, -2.91, 95, null, 4.2, 7.5, 18.6, 'Hold', 'ok', 0.36, -0.25, { sentiment: 'BEARISH', newsImpact: 9 }],
  // High risk + high score → backend "Speculative Buy".
  ['COIN', 'Coinbase Global Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Financial Services', 'Financial Data & Stock Exchanges', 172.3, 5.87, 43, 29.3, 7.6, 8.0, 44.0, 'Buy', 'ok', 0.78, 0.5, { sentiment: 'BULLISH', newsImpact: 7 }],
  ['RIVN', 'Rivian Automotive Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Automobiles', 'Auto Manufacturers', 10.94, -4.76, 11, null, 3.1, 8.5, -22.0, 'Sell', 'broken', 0.72, -0.45, { sentiment: 'BEARISH', newsImpact: 6 }],
  ['SOFI', 'SoFi Technologies Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Financial Services', 'Credit Services', 7.92, 1.8, 8.4, 71.6, 6.3, 6.0, 26.3, 'Hold', 'broken', 0.56, 0.05],
  ['SHOP', 'Shopify Inc', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'CA', 'Technology', 'Software - Application', 79.6, 2.2, 102, 81.2, 6.9, 4.0, 15.6, 'Buy', 'ok', 0.5, 0.25],
  ['UBER', 'Uber Technologies Inc', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'US', 'Technology', 'Software - Application', 74.85, 0.67, 157, 79.4, 7.2, 4.0, 21.1, 'Strong Buy', 'ok', 0.38, 0.3],
  ['SMCI', 'Super Micro Computer Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Technology', 'Computer Hardware', 41.2, -6.83, 24, 20.4, 3.6, 8.0, -15.0, 'Sell', 'broken', 0.95, 0.15, { sentiment: 'BEARISH', newsImpact: 9 }],
  ['MU', 'Micron Technology Inc', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Semiconductors', 'Semiconductors', 104.3, 1.44, 116, 148.2, 7.0, 4.5, 28.7, 'Strong Buy', 'ok', 0.45, 0.22, { dividend: 0.44 }],
  // Non-USD listings — MarketDataService treats any dotted symbol as non-US
  // (Yahoo path); currency comes from exchange-currency.util.ts.
  ['ASML.AS', 'ASML Holding NV', 'AMS', 'EUR', 'NL', 'Semiconductors', 'Semiconductor Equipment & Materials', 742.8, 0.92, 292, 41.5, 8.0, 3.0, 17.4, 'Strong Buy', 'ok', 0.36, 0.2, { dividend: 0.86 }],
  ['SAP.DE', 'SAP SE', 'XETRA', 'EUR', 'DE', 'Technology', 'Software - Application', 204.35, -0.33, 251, 92.6, 7.4, 2.5, 8.1, 'Buy', 'ok', 0.24, 0.3, { dividend: 1.08 }],
  // EDGE: no risk analysis, no logo (EU small cap; see ticker-detail.controller.ts).
  ['EKT.DE', 'Energiekontor AG', 'XETRA', 'EUR', 'DE', 'Utilities', null, 58.4, 1.21, 0.82, 9.8, null, 5, 0, null, 'none', 0.38, -0.1],
  ['SHEL.L', 'Shell PLC', 'LSE', 'GBP', 'GB', 'Energy', 'Oil & Gas Integrated', 25.84, 0.47, 162, 11.9, 6.8, 3.0, 13.7, 'Buy', 'ok', 0.22, 0.08, { dividend: 4.02 }],
  ['VOLV-B.ST', 'Volvo AB', 'STO', 'SEK', 'SE', 'Machinery', null, 281.4, 0.54, 572, 11.2, 6.1, 3.5, 6.4, 'Hold', 'none', 0.26, 0.12, { dividend: 2.67 }],
  // EDGE: JPY listing, four-digit price, no risk analysis, no logo.
  ['7203.T', 'Toyota Motor Corp', 'TSE', 'JPY', 'JP', 'Automobiles', 'Auto Manufacturers', 2612.5, -0.44, 41200, 7.9, null, 5, 0, 'Buy', 'none', 0.27, 0.15, { dividend: 2.87 }],
  // EDGE: sub-dollar price, double-digit drop, null P/E, worst scores.
  ['MULN', 'Mullen Automotive Inc', 'NASDAQ CAPITAL MARKET', 'USD', 'US', 'Automobiles', 'Auto Manufacturers', 0.1834, -11.42, 0.012, null, 1.2, 9.5, -100, 'Sell', 'none', 1.6, -2.4, { sentiment: 'BEARISH', newsImpact: 8 }],
  // EDGE: very long company name.
  ['TSM', 'Taiwan Semiconductor Manufacturing Company Limited Sponsored ADR (each representing five common shares)', 'NEW YORK STOCK EXCHANGE, INC.', 'USD', 'TW', 'Semiconductors', 'Semiconductors', 184.6, -0.85, 957, 31.8, 8.2, 4.0, 23.9, 'Strong Buy', 'ok', 0.34, 0.4, { sentiment: 'BULLISH', newsImpact: 6, dividend: 1.31 }],
  // Shadow-banned ticker: hidden from analyzer/search, 404 on GET /tickers/:symbol.
  ['DJT', 'Trump Media & Technology Group Corp', 'NASDAQ NMS - GLOBAL MARKET', 'USD', 'US', 'Media', null, 16.4, -3.1, 3.3, null, 2.4, 9.0, -60, 'Sell', 'broken', 1.1, -0.6, { hidden: true }],
];

export const SEED_TICKERS: SeedTicker[] = ROWS.map((r) => ({
  sym: r[0],
  name: r[1],
  exchange: r[2],
  currency: r[3],
  country: r[4],
  sector: r[5],
  industry: r[6],
  price: r[7],
  chg: r[8],
  mcapB: r[9],
  pe: r[10],
  score: r[11],
  risk: r[12],
  upside: r[13],
  consensus: r[14],
  logo: r[15],
  vol: r[16],
  drift: r[17],
  ...(r[18] ?? {}),
}));

/** Scenario price targets shared by the risk analysis and the research notes.
 *  Mirrors the prompt rule in ResearchService.buildPrompt: financial risk >= 8
 *  forces a $0.00 bear case. */
export function scenarioTargets(s: SeedTicker): { bull: number; base: number; bear: number } {
  const dp = s.price < 1 ? 4 : 2;
  const f = (n: number): number => Number(n.toFixed(dp));
  return {
    bull: f(s.price * (1 + Math.max(s.upside, 10) / 100 + 0.28)),
    base: f(s.price * (1 + s.upside / 100)),
    bear: s.risk >= 8 ? 0 : f(s.price * (1 - (0.03 + s.risk * 0.025))),
  };
}

/** Brand-ish colours for the generated logo tiles. */
export const LOGO_COLORS: Record<string, string> = {
  AAPL: '#a1a1aa', MSFT: '#3b82f6', NVDA: '#76b900', GOOGL: '#ea4335', AMZN: '#ff9900',
  META: '#0866ff', TSLA: '#e82127', AMD: '#00a651', PLTR: '#101113', AVGO: '#cc092f',
  NFLX: '#e50914', CRM: '#00a1e0', ORCL: '#c74634', INTC: '#0071c5', JPM: '#5a4634',
  V: '#1a1f71', 'BRK.A': '#2b2e83', UNH: '#002677', LLY: '#d52b1e', JNJ: '#eb1700',
  XOM: '#fe0000', CVX: '#0054a4', WMT: '#0071ce', KO: '#f40009', DIS: '#113ccf',
  BA: '#0033a0', COIN: '#0052ff', SHOP: '#95bf47', UBER: '#111111', MU: '#0e8ed6',
  'ASML.AS': '#0f238c', 'SAP.DE': '#008fd3', 'SHEL.L': '#fbce07', TSM: '#c8102e',
};

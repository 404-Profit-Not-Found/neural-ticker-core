// Long-form fixture content: research note bodies, news, comments, digest.
// Written to exercise markdown rendering (headings, tables, nested lists,
// code, links, quotes) and layout edge cases (very long / very short text).
import type { SeedTicker } from './seed-tickers.ts';
import { scenarioTargets } from './seed-tickers.ts';
import { round } from './rng.ts';

const money = (n: number, cur = 'USD'): string => {
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '';
  const body = n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toFixed(2);
  return sym ? `${sym}${body}` : `${body} ${cur}`;
};

/** Deep-dive note — the shape ResearchService.buildPrompt asks the model for
 *  (src/modules/research/research.service.ts): markdown, a 3y financials
 *  table, cited claims, and a closing "Risk/Reward Profile" section. */
export function deepDiveMarkdown(t: SeedTicker, question: string): string {
  const p = t.price;
  const { bull, base, bear } = scenarioTargets(t);
  const rev = round(t.mcapB / 14, 1);
  return `# ${t.name} (${t.sym}) — Deep Research

> **Question:** ${question}
>
> **Bottom line:** ${t.score !== null && t.score >= 7.5 ? 'High-conviction compounder; accumulate on weakness.' : t.score !== null && t.score >= 5 ? 'Balanced set-up — position sizing matters more than direction here.' : 'The equity is priced for a recovery the filings do not yet support.'}

## 1. Executive Summary

${t.name} trades at **${money(p, t.currency)}** (${t.chg >= 0 ? '+' : ''}${t.chg.toFixed(2)}% on the day) for a market capitalisation of roughly **${t.mcapB >= 1000 ? (t.mcapB / 1000).toFixed(2) + 'T' : t.mcapB + 'B'} ${t.currency}**. Our weighted price target is **${money(base, t.currency)}** (${t.upside >= 0 ? '+' : ''}${t.upside.toFixed(1)}%), with a bull case of ${money(bull, t.currency)} and a bear case of ${money(bear, t.currency)}.

Three things drive the thesis:

1. **Demand visibility.** Backlog and remaining performance obligations cover more than four quarters of consensus revenue[^1].
2. **Operating leverage.** Incremental margins have run *above* the ten-year average for six consecutive quarters.
3. **Capital returns.** Buybacks retired ~2.1% of the float over the trailing twelve months.
   - Net of stock-based compensation the figure is closer to 0.9%.
   - Management has **not** committed to a floor on repurchases.

## 2. Business & Moat

| Segment | FY rev mix | YoY growth | Gross margin | Comment |
|:--|--:|--:|--:|:--|
| Core platform | 58% | +14.2% | 71.4% | Pricing power intact |
| Services & subscriptions | 27% | +21.8% | 78.9% | Fastest-growing line |
| Hardware / other | 15% | −3.1% | 34.0% | Cyclical, shrinking in mix |

The moat is a combination of **switching costs** and **scale economies shared** — the company reinvests scale gains into price, which widens the gap to sub-scale peers. See the [latest 10-K](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-K) (Item 1A) for management's own framing of competitive risks, and the [investor relations deck](https://example.com/ir/${t.sym.toLowerCase()}-q3-deck.pdf) for segment disclosures.

### 2.1 What the bears say

- Customer concentration: the top ten accounts are ~38% of receivables.
- The replacement cycle is lengthening (from 3.1 to 3.8 years by our estimate).
- Regulatory scrutiny in the EU could cap take-rates.

### 2.2 What the bulls say

- Net revenue retention has stayed above 118% through the downturn.
- A second product curve is already at a \`$4B+\` annualised run-rate.

## 3. Financials (last three fiscal years)

| Metric (${t.currency}, billions) | FY-2 | FY-1 | FY0 | 3y CAGR |
|:--|--:|--:|--:|--:|
| Revenue | ${round(rev * 0.74, 1)} | ${round(rev * 0.87, 1)} | ${rev} | 16.3% |
| Gross profit | ${round(rev * 0.74 * 0.58, 1)} | ${round(rev * 0.87 * 0.6, 1)} | ${round(rev * 0.62, 1)} | 18.9% |
| Operating income | ${round(rev * 0.74 * 0.21, 1)} | ${round(rev * 0.87 * 0.24, 1)} | ${round(rev * 0.27, 1)} | 27.4% |
| Free cash flow | ${round(rev * 0.74 * 0.18, 1)} | ${round(rev * 0.87 * 0.2, 1)} | ${round(rev * 0.23, 1)} | 26.1% |
| Diluted shares (bn) | 1.92 | 1.88 | 1.84 | −2.1% |

A quick sanity check on the valuation maths:

\`\`\`python
price, fcf_per_share, growth, discount = ${p}, ${round(p / 31, 2)}, 0.14, 0.09
terminal = fcf_per_share * (1 + growth) ** 5 * 22   # exit multiple
fair_value = terminal / (1 + discount) ** 5
print(f"fair value ≈ {fair_value:,.2f} vs price {price:,.2f}")
\`\`\`

## 4. Catalysts & Timeline

- [x] Q2 print cleared the raised guide
- [ ] Investor day — capital allocation framework update
- [ ] Product refresh cycle begins shipping
- [ ] Appeal ruling on the antitrust matter

#### Scenario table

| Scenario | Probability | Price target | Implied return | Key driver |
|:--|--:|--:|--:|:--|
| Bull | 25% | ${money(bull, t.currency)} | ${(((bull - p) / p) * 100).toFixed(1)}% | Margin expansion + multiple re-rating |
| Base | 50% | ${money(base, t.currency)} | ${(((base - p) / p) * 100).toFixed(1)}% | Consensus growth, stable multiple |
| Bear | 25% | ${money(bear, t.currency)} | ${(((bear - p) / p) * 100).toFixed(1)}% | ${t.risk >= 8 ? 'Insolvency / dilutive recapitalisation' : 'Demand air-pocket, de-rating'} |

---

## 5. Risk/Reward Profile

**Overall Score:** ${t.score ?? 'n/a'}/10 · **Financial Risk:** ${t.risk}/10 · **Execution Risk:** ${Math.min(10, round(t.risk + 0.8, 1))}/10

*This note was generated by an AI research agent. It is not investment advice; verify every figure against primary filings before acting on it.*

[^1]: Company filings, most recent quarterly report, note 3 ("Revenue from contracts with customers").
`;
}

/** Short earnings-reaction note — tests a compact body. */
export function earningsMarkdown(t: SeedTicker): string {
  return `## ${t.sym}: Earnings reaction

**Print:** revenue beat by 2.4%, EPS beat by 6 cents, guide roughly in line.

- Gross margin **+120 bps** QoQ on mix.
- Opex growth decelerated to +7% YoY.
- Buyback authorisation raised by \`$10B\`.

**Read-through:** estimates drift up 1–2%; the multiple, not the numbers, is the debate from here.

| | Reported | Consensus | Surprise |
|:--|--:|--:|--:|
| Revenue | 26.04B | 25.43B | +2.4% |
| EPS | 2.31 | 2.25 | +2.7% |
| Next-Q guide | 27.0B | 26.9B | +0.4% |
`;
}

/** Comparative note across several tickers — wide table + long paragraphs. */
export function comparisonMarkdown(a: SeedTicker, b: SeedTicker, c: SeedTicker): string {
  const row = (t: SeedTicker): string =>
    `| [${t.sym}](/ticker/${t.sym}) | ${t.name} | ${money(t.price, t.currency)} | ${t.pe ?? '—'} | ${t.score ?? '—'} | ${t.risk} | ${t.upside >= 0 ? '+' : ''}${t.upside.toFixed(1)}% | ${t.consensus ?? '—'} |`;
  return `# ${a.sym} vs ${b.sym} vs ${c.sym}: which one earns the incremental dollar?

Short answer: **${[a, b, c].sort((x, y) => (y.score ?? 0) - (x.score ?? 0))[0]?.sym}** on quality, **${[a, b, c].sort((x, y) => y.upside - x.upside)[0]?.sym}** on upside.

## Side-by-side

| Symbol | Company | Price | P/E (TTM) | Neural score | Fin. risk | Base upside | Street |
|:--|:--|--:|--:|--:|--:|--:|:--|
${row(a)}
${row(b)}
${row(c)}

## How to read this

The three businesses sell into overlapping budgets but monetise very differently. ${a.name} captures value at the point of sale and is therefore the most exposed to unit volumes; ${b.name} monetises usage, which smooths the cycle but caps the upside in boom years; ${c.name} sits in between and has historically traded at a discount to both for reasons that look increasingly stale.

> "Compare the *incremental* return on capital, not the average. The average tells you where the business has been." — desk note

### Positioning

1. Core: the highest-quality name at 50–60% of the basket.
2. Satellite: the highest-upside name at 25–30%.
3. Hedge: fund the remainder from the name with the weakest balance sheet.
   1. Size the hedge on *beta-adjusted* notional.
   2. Re-test monthly.

### Data notes

- Prices as of the last close; all multiples trailing unless stated.
- \`Neural score\` is the 0–10 composite from the risk/reward engine.
- Sources: [SEC EDGAR](https://www.sec.gov/edgar), company reports, [FRED](https://fred.stlouisfed.org/).
`;
}

/** Daily digest body — the structure ResearchService.getOrGenerateDailyDigest
 *  prompts for: "Market Pulse", "Key Stories", then a trailing JSON block. */
export function digestMarkdown(items: SeedTicker[]): string {
  const stories = items
    .map((t) => {
      const sentiment = t.sentiment ?? 'NEUTRAL';
      const impact = t.newsImpact ?? 4;
      return `### [${t.sym}](/ticker/${t.sym}) (${sentiment}) [Impact: ${impact}/10]
**${t.name}: ${sentiment === 'BULLISH' ? 'estimates move higher after channel checks' : sentiment === 'BEARISH' ? 'guidance risk builds into the print' : 'quiet tape, positioning unchanged'}**
- **The Why**: ${sentiment === 'BULLISH' ? 'Supply-chain data points to accelerating orders through year-end.' : sentiment === 'BEARISH' ? 'Two sell-side desks cut numbers on softer end-demand.' : 'No incremental news; the stock traded with the sector.'}
- **Risk/Catalyst**: ${impact >= 8 ? 'Binary event inside two weeks — expect a wide range.' : 'Next earnings date is the first real test.'}`;
    })
    .join('\n\n');
  const json = JSON.stringify(
    {
      items: items.map((t) => ({
        symbol: t.sym,
        sentiment: t.sentiment ?? 'NEUTRAL',
        impact_score: t.newsImpact ?? 4,
        summary: `${t.name}: ${(t.sentiment ?? 'NEUTRAL').toLowerCase()} set-up into the next catalyst.`,
      })),
    },
    null,
    2,
  );
  return `## Market Pulse
Risk appetite is firm but narrow: semis and megacap software are doing the lifting while cyclicals lag. Rates are range-bound ahead of the next inflation print.

---

## Key Stories

${stories}

\`\`\`json
${json}
\`\`\`
`;
}

export function portfolioAnalysisMarkdown(risk: string, horizon: string, goal: string): string {
  return `## Risk-Profile Alignment
Your book is **${risk}**-risk on paper but concentrated: the top three positions are well over half of holdings value. That is fine for a ${horizon} horizon only if you can sit through a 30% drawdown in semis.

## Strategic Moves
1. **Trim NVDA** by a fifth — it has done the work; redeploy into the laggard quality names.
2. **Sell RIVN** — the position is small, the thesis is not improving, and the tax loss has value.

## High-Impact Opportunities
- **Add ASML.AS** on weakness for ${goal}: the only EUV supplier, order book visible into next year.
- Hold cash at 8–10% so the next pullback is an opportunity, not a problem.
`;
}

export const QUICK_RECOMMENDATION = `### Diversification
Tech and semis dominate; one energy name and one healthcare name are doing the diversifying.

### Risk Flags
NVDA plus TSLA drive most of the daily variance. The RIVN and INTC losses are small in dollars but signal weak sell discipline.

### Next Moves
1. Trim NVDA — lock in part of the gain, keep the core.
2. Add JNJ — cheapest defensive ballast already in the book.
3. Hold SHEL.L — income offset while rates stay elevated.`;

// ── News ─────────────────────────────────────────────────────────────────

export interface SeedNews {
  headline: string;
  source: string;
  summary: string;
  category: string;
  related: string;
  /** Hours before "now". */
  ageH: number;
  image?: boolean;
}

// EDGE: very long and very short headlines, empty summary, missing image.
export const GENERAL_NEWS: SeedNews[] = [
  { headline: 'Fed holds', source: 'Reuters', summary: 'The Federal Reserve left its policy rate unchanged and signalled patience.', category: 'top news', related: '', ageH: 0.4, image: true },
  { headline: 'Chipmakers extend rally as hyperscaler capital-expenditure guidance tops even the most bullish Wall Street forecasts for a third consecutive quarter, lifting equipment suppliers, memory names and the broader semiconductor index to fresh record highs', source: 'Bloomberg', summary: 'Semiconductor shares rose broadly after four of the largest cloud providers raised capital-spending plans, with most of the increase earmarked for AI accelerators and the data-centre build-out around them. Equipment makers and memory suppliers outperformed.', category: 'top news', related: 'NVDA,AMD,AVGO,MU,TSM,ASML.AS', ageH: 1.2, image: true },
  { headline: 'Oil slips 2% on surprise inventory build', source: 'CNBC', summary: 'Crude futures fell after government data showed stockpiles rising against expectations of a draw.', category: 'business', related: 'XOM,CVX,SHEL.L', ageH: 2.5, image: true },
  { headline: 'Apple supplier checks point to stronger holiday-quarter builds', source: 'MarketWatch', summary: 'Channel checks from two Asian brokers suggest build plans were revised up mid-quarter.', category: 'technology', related: 'AAPL,TSM', ageH: 3.1 },
  { headline: 'Tesla cuts prices again in China', source: 'Reuters', summary: '', category: 'business', related: 'TSLA', ageH: 4.6, image: true },
  { headline: 'Treasury yields steady ahead of CPI; curve remains inverted for a record stretch', source: 'Financial Times', summary: 'Ten-year yields were little changed as traders held positions into the inflation release.', category: 'economy', related: '', ageH: 5.9 },
  { headline: 'JPMorgan tops estimates as net interest income holds up', source: 'Bloomberg', summary: 'The bank reported quarterly profit above forecasts and nudged its full-year net interest income target higher.', category: 'business', related: 'JPM', ageH: 7.4, image: true },
  { headline: 'EU opens formal probe into cloud licensing terms', source: 'Politico', summary: 'Regulators will examine whether bundling practices disadvantage rival cloud providers.', category: 'top news', related: 'MSFT,ORCL,SAP.DE', ageH: 9.2 },
  { headline: 'Boeing delivery pause widens after new inspection finding', source: 'WSJ', summary: 'The planemaker halted deliveries of one variant pending additional fuselage inspections.', category: 'business', related: 'BA', ageH: 11.5, image: true },
  { headline: 'Bitcoin back above key level; Coinbase volumes jump', source: 'CoinDesk', summary: 'Spot volumes on the largest US exchange rose sharply alongside the move.', category: 'crypto', related: 'COIN', ageH: 13.8 },
  { headline: 'Lilly obesity drug wins broader label', source: 'STAT', summary: 'The expanded indication covers an additional patient population estimated in the millions.', category: 'health', related: 'LLY', ageH: 17 },
  { headline: 'Why the equal-weight index is quietly catching up', source: 'Barron\'s', summary: 'Breadth has improved over the past month even as the headline index stalled.', category: 'markets', related: '', ageH: 21.5, image: true },
  { headline: 'Walmart raises full-year outlook', source: 'AP', summary: 'The retailer cited grocery share gains and a growing advertising business.', category: 'business', related: 'WMT', ageH: 26 },
  { headline: 'Super Micro shares slide after auditor resignation', source: 'Reuters', summary: 'The server maker said it would work to appoint a new auditor and did not expect restatements.', category: 'technology', related: 'SMCI', ageH: 30, image: true },
  { headline: 'Dollar firms as rate-cut bets fade', source: 'Reuters', summary: 'The greenback rose against major peers.', category: 'forex', related: '', ageH: 34 },
  { headline: 'Disney streaming turns second straight quarterly profit', source: 'Variety', summary: 'Direct-to-consumer operating income improved on price increases and lower marketing spend.', category: 'business', related: 'DIS,NFLX', ageH: 41 },
];

export function companyNews(t: SeedTicker): SeedNews[] {
  const n = t.name.replace(/ (Inc|Corp|Co|PLC|SE|AG|NV|AB)\.?$/, '');
  const up = t.chg >= 0;
  return [
    { headline: `${n} ${up ? 'rises' : 'falls'} ${Math.abs(t.chg).toFixed(1)}% as ${up ? 'analysts lift targets' : 'traders trim positions'}`, source: 'MarketWatch', summary: `Shares of ${t.name} ${up ? 'gained' : 'declined'} in ${up ? 'above' : 'below'}-average volume. ${t.consensus ? `Street consensus remains ${t.consensus}.` : ''}`, category: 'company', related: t.sym, ageH: 1.5, image: true },
    { headline: `${t.sym}: what to watch into earnings`, source: 'Seeking Alpha', summary: 'Three numbers will set the tone: gross margin, next-quarter guide, and capital returns.', category: 'company', related: t.sym, ageH: 8 },
    { headline: `${n} names new chief financial officer; outgoing CFO to remain as an adviser through the transition period and the filing of the annual report`, source: 'Reuters', summary: 'The appointment takes effect at the start of next quarter.', category: 'company', related: t.sym, ageH: 19, image: true },
    { headline: `Options market prices a ${Math.max(2, Math.round(t.vol * 9))}% move for ${t.sym}`, source: 'Bloomberg', summary: '', category: 'company', related: t.sym, ageH: 27 },
    { headline: `${n} to present at industry conference`, source: 'Business Wire', summary: 'A live webcast will be available on the company\'s investor relations site.', category: 'company', related: t.sym, ageH: 52 },
    { headline: `Is ${t.sym} still a buy after the run?`, source: 'The Motley Fool', summary: 'Valuation looks full on near-term numbers, but the multi-year set-up is intact.', category: 'company', related: t.sym, ageH: 77, image: true },
    { headline: `${n} ${up ? 'wins' : 'loses'} key contract`, source: 'CNBC', summary: 'Terms were not disclosed.', category: 'company', related: t.sym, ageH: 118 },
  ];
}

// ── Social ───────────────────────────────────────────────────────────────

export interface SeedComment {
  sym: string;
  author: number; // index into the seeded users
  content: string;
  ageH: number;
  likes: number;
  replies?: { author: number; content: string; ageH: number; likes: number }[];
  status?: 'ok' | 'pending' | 'flagged';
}

export const COMMENTS: SeedComment[] = [
  { sym: 'NVDA', author: 2, content: 'Blackwell lead times are still 9+ months per my supplier contacts. Demand is not the problem, packaging capacity is.', ageH: 2, likes: 14, status: 'ok', replies: [
    { author: 0, content: 'Agree — CoWoS is the bottleneck. Watching TSM capex for the tell.', ageH: 1.5, likes: 4 },
    { author: 3, content: 'Counterpoint: custom ASICs take share at the hyperscalers by FY27.', ageH: 1.1, likes: 2 },
  ] },
  { sym: 'NVDA', author: 4, content: 'Trimmed 20% here. Not bearish, just position sizing.', ageH: 6, likes: 5, status: 'ok' },
  { sym: 'NVDA', author: 1, content: 'Long comment to test wrapping: the bull case rests on three legs — (1) training demand stays supply-constrained through next year, (2) inference becomes a larger TAM than training and the software stack keeps the attach rate high, and (3) sovereign AI adds a customer class that did not exist two years ago. Take away any one leg and the multiple still works on next-year numbers; take away two and you are looking at a 30% drawdown before fundamentals catch up. I size it accordingly. Also: https://example.com/a-very-long-url-that-should-wrap/without-breaking-the-layout/even-on-a-390px-wide-mobile-viewport?utm_source=test', ageH: 20, likes: 22, status: 'ok' },
  { sym: 'NVDA', author: 5, content: '🚀🚀🚀', ageH: 30, likes: 1, status: 'pending' },
  { sym: 'NVDA', author: 3, content: 'Anyone modelling the export-control scenario? <@USER0> you had numbers on this.', ageH: 44, likes: 3, status: 'ok' },
  { sym: 'AAPL', author: 0, content: 'Services margin keeps doing the heavy lifting. Hardware is a distribution channel at this point.', ageH: 5, likes: 9, status: 'ok', replies: [
    { author: 2, content: 'Until the App Store ruling bites.', ageH: 4, likes: 1 },
  ] },
  { sym: 'AAPL', author: 4, content: 'Buyback pace slowed a touch QoQ, worth watching.', ageH: 28, likes: 2, status: 'ok' },
  { sym: 'TSLA', author: 3, content: 'Margins ex-credits are the only number that matters this quarter.', ageH: 3, likes: 7, status: 'ok' },
  { sym: 'TSLA', author: 5, content: 'Short interest creeping back up.', ageH: 12, likes: 0, status: 'ok' },
  { sym: 'MSFT', author: 2, content: 'Azure growth re-accelerating is the whole story.', ageH: 9, likes: 6, status: 'ok' },
  { sym: 'PLTR', author: 1, content: 'Valuation is silly, execution is not.', ageH: 15, likes: 11, status: 'ok' },
  { sym: 'COIN', author: 5, content: 'Volumes up 40% w/w.', ageH: 7, likes: 3, status: 'ok' },
];

export const STOCKTWITS_BODIES: string[] = [
  '$SYM breaking out of the wedge, volume confirming',
  '$SYM puts are free money into this print imo',
  'Added to $SYM on the dip. Not selling a share before earnings.',
  '$SYM institutions loading, check the dark pool prints',
  'Who is still holding $SYM bags from the top? 😂',
  '$SYM guidance will be the tell. Everything else is noise.',
  '$SYM gap fill then up. Calling it.',
  'Out of $SYM for now, will re-enter lower',
  '$SYM short squeeze incoming, float is tiny',
  '$SYM chart looks identical to last cycle',
];

// ── Analyst ratings ──────────────────────────────────────────────────────

export const ANALYST_FIRMS: string[] = [
  'Morgan Stanley', 'Goldman Sachs', 'JPMorgan', 'Bank of America Securities', 'Barclays',
  'Wells Fargo', 'Citigroup', 'UBS', 'Evercore ISI', 'Bernstein', 'Wedbush', 'Jefferies',
  'Piper Sandler', 'KeyBanc', 'Raymond James', 'Deutsche Bank', 'Mizuho', 'Oppenheimer',
];

// ── Risk analysis text ───────────────────────────────────────────────────

export const CATALYSTS_NEAR: string[] = [
  'Next quarterly earnings and forward guide',
  'Product refresh cycle begins shipping',
  'Investor day: capital allocation framework',
  'Regulatory decision expected within the quarter',
  'Index inclusion review',
];
export const CATALYSTS_LONG: string[] = [
  'Second product curve reaching scale',
  'Operating margin expansion toward long-term target',
  'International expansion into under-penetrated markets',
  'Balance-sheet deleveraging enabling larger buybacks',
];
export const RED_FLAGS: string[] = [
  'Customer concentration above 30% of revenue',
  'Stock-based compensation above 12% of revenue',
  'Negative free cash flow in three of the last four quarters',
  'Auditor change within the last twelve months',
  'Going-concern language in the latest filing',
  'Insider selling accelerated over the last 90 days',
  'Inventory growing faster than revenue',
];
export const STRENGTHS: string[] = ['Dominant market share in core segment', 'Net cash balance sheet', 'High recurring revenue mix', 'Proven pricing power'];
export const WEAKNESSES: string[] = ['Reliance on a single supplier for critical components', 'Slowing growth in the legacy segment', 'Elevated valuation versus history'];
export const OPPORTUNITIES: string[] = ['Adjacent market entry with existing distribution', 'Monetisation of the installed base through services'];
export const THREATS: string[] = ['Well-funded new entrants', 'Export controls and tariff exposure', 'Antitrust action in the EU and US'];

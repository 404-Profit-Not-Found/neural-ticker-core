/**
 * E2E test of the GeminiProvider with quality='extraction'.
 * Verifies model swap + grounding-off + system instruction swap end-to-end.
 */
import 'dotenv/config';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GeminiProvider } from '../src/modules/llm/providers/gemini.provider';
import configuration from '../src/config/configuration';

const SAMPLE = `
AAPL fiscal Q4 2025. Apple Inc. designs and sells smartphones, computers, and services worldwide.
Revenue: $94.93B. Net income: $14.7B. PE TTM: 32.5. EPS TTM: 6.10.
Dividend yield: 0.45%. Beta: 1.20. Debt/equity: 1.8. Gross margin: 45.2%.
Next earnings: 2026-01-30. Consensus rating: Buy.
Morgan Stanley reiterated Overweight (Buy) with $250 target on 2025-11-01.
`;

const prompt = `You are a strict data extraction engine. Extract for ticker "AAPL":
description (string|null), financials (object with pe_ttm, eps_ttm, dividend_yield, beta, debt_to_equity, gross_margin, next_earnings_date, consensus_rating), ratings (array of {firm, rating, price_target, rating_date}).
Return SINGLE JSON.

Text:
${SAMPLE}

Output:`;

async function main() {
  const mod = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ load: [configuration], isGlobal: true })],
    providers: [GeminiProvider],
  }).compile();
  const provider = mod.get(GeminiProvider);
  const cfg = mod.get(ConfigService);
  console.log('Configured extraction model:', cfg.get('gemini.models.extraction'));

  const t0 = Date.now();
  try {
    const r = await provider.generate({
      question: prompt,
      tickers: ['AAPL'],
      numericContext: {},
      quality: 'extraction',
    });
    const ms = Date.now() - t0;
    console.log(`OK (${ms}ms, model=${r.models.join(',')}, tokIn=${r.tokensIn}, tokOut=${r.tokensOut})`);
    console.log('--- response head ---');
    console.log(r.answerMarkdown.slice(0, 800));
    const m = r.answerMarkdown.match(/\{[\s\S]*\}/);
    if (!m) { console.log('NO JSON FOUND'); return; }
    const data = JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1'));
    console.log('parsed keys:', Object.keys(data),
      'financials keys:', data.financials ? Object.keys(data.financials).length : 0,
      'ratings:', Array.isArray(data.ratings) ? data.ratings.length : 0);
  } catch (e: any) {
    console.log('FAIL', e.message);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

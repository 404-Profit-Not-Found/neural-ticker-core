/**
 * Quick test for the data extraction model (gemini-2.5-flash-lite).
 * Run: npx ts-node scripts/test-extraction.ts
 */
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const MODEL =
  process.env.GEMINI_MODEL_EXTRACTION ||
  process.env.TEST_MODEL ||
  'gemini-2.5-flash-lite';

const SAMPLE_TEXT = `
Apple Inc. (AAPL) reported fiscal Q4 2025 earnings.
The company designs and sells smartphones, computers, and services worldwide.
Revenue: $94.93 billion. Net income: $14.7 billion.
PE ratio (TTM): 32.5. EPS (TTM): 6.10. Dividend yield: 0.45%. Beta: 1.20.
Debt to equity: 1.8. Gross margin: 45.2%. Net profit margin: 23.5%.
ROE: 156%. ROA: 22%. Price to book: 47.2.
Next earnings date: 2026-01-30. Consensus rating: Buy.
Morgan Stanley reiterated Overweight (Buy) with $250 target on 2025-11-01.
Goldman Sachs raised target to $260 (Buy) on 2025-10-28.
`;

const prompt = `You are a strict data extraction engine.
Extract the following for ticker "AAPL" from the provided text.

1. Company Profile (Return as string "description"): 2-3 sentences. null if not found.
2. Financial Metrics (Return as object "financials"): pe_ttm, eps_ttm, dividend_yield, beta, debt_to_equity, gross_margin, net_profit_margin, roe, roa, price_to_book, next_earnings_date, consensus_rating. Numbers, except next_earnings_date as YYYY-MM-DD and consensus_rating as string. null if not found.
3. Analyst Ratings (Return as array "ratings"): { "firm": string, "analyst_name": string|null, "rating": "Buy"|"Hold"|"Sell", "price_target": number|null, "rating_date": "YYYY-MM-DD" }.

Return ONE JSON object:
{ "description": "...", "financials": { ... }, "ratings": [ ... ] }

Text:
${SAMPLE_TEXT}

Output:`;

async function testWithKey(label: string, apiKey?: string, useSearch = false) {
  if (!apiKey) {
    console.log(`[${label}] SKIP — no key configured`);
    return;
  }
  console.log(`\n=== ${label} | model=${MODEL} | grounding=${useSearch} ===`);
  const client = new GoogleGenAI({ apiKey });
  const t0 = Date.now();
  try {
    const result = await client.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: useSearch ? { tools: [{ googleSearch: {} }] } : {},
    });
    const ms = Date.now() - t0;
    const text = result.text || '';
    console.log(`OK (${ms}ms, tokensIn=${result.usageMetadata?.promptTokenCount}, tokensOut=${result.usageMetadata?.candidatesTokenCount})`);
    console.log('--- raw response ---');
    console.log(text.slice(0, 1500));
    console.log('--- parse check ---');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log('NO JSON BLOCK FOUND');
      return;
    }
    try {
      const data = JSON.parse(match[0].replace(/,\s*([}\]])/g, '$1'));
      console.log('JSON OK. Keys:', Object.keys(data));
      console.log('  description?', !!data.description);
      console.log('  financials keys:', data.financials ? Object.keys(data.financials).length : 0);
      console.log('  ratings count:', Array.isArray(data.ratings) ? data.ratings.length : 0);
    } catch (e: any) {
      console.log('JSON PARSE FAILED:', e.message);
    }
  } catch (e: any) {
    const ms = Date.now() - t0;
    console.log(`FAIL (${ms}ms): ${e.message}`);
    if (e.status) console.log('  status:', e.status);
  }
}

async function main() {
  console.log('Extraction model under test:', MODEL);
  await testWithKey('PRIMARY  / no grounding', process.env.GEMINI_API_KEY, false);
  await testWithKey('PRIMARY  / w/ grounding', process.env.GEMINI_API_KEY, true);
  await testWithKey('SECONDARY/ no grounding', process.env.GEMINI_API_KEY_SECONDARY, false);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});

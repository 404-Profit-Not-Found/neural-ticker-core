/**
 * Probe which Gemini models accept googleSearch grounding on a given API key.
 * Pass KEY=primary or KEY=secondary (default primary).
 */
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
];

const PROMPT =
  'In one short sentence: what was Apple\'s last reported quarterly revenue? Use Google Search to verify.';

async function probe(client: GoogleGenAI, model: string, useGrounding: boolean) {
  const t0 = Date.now();
  try {
    const r = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
      config: useGrounding ? { tools: [{ googleSearch: {} }] } : {},
    });
    const ms = Date.now() - t0;
    const gm = r.candidates?.[0]?.groundingMetadata as any;
    const chunks = gm?.groundingChunks?.length || 0;
    const queries = gm?.webSearchQueries?.length || 0;
    return { ok: true, ms, chunks, queries };
  } catch (e: any) {
    const ms = Date.now() - t0;
    let status: any = e.status || e.code;
    const m2 = String(e.message || '').match(/"code":\s*(\d+)/);
    if (m2 && !status) status = Number(m2[1]);
    const m3 = String(e.message || '').match(/"status":\s*"([^"]+)"/);
    return { ok: false, ms, status, reason: m3?.[1] || '' };
  }
}

async function main() {
  const which = (process.env.KEY || 'primary').toLowerCase();
  const key =
    which === 'secondary'
      ? process.env.GEMINI_API_KEY_SECONDARY
      : process.env.GEMINI_API_KEY;
  if (!key) throw new Error(`No key for ${which}`);
  const client = new GoogleGenAI({ apiKey: key });
  console.log(`Testing on ${which.toUpperCase()} key\n`);

  console.log('Model'.padEnd(34), 'grounded'.padEnd(40), 'baseline (no tools)');
  console.log('-'.repeat(108));

  for (const model of MODELS) {
    const grounded = await probe(client, model, true);
    const baseline = await probe(client, model, false);
    const fmt = (r: any) =>
      r.ok
        ? `OK ${String(r.ms).padStart(5)}ms chunks=${r.chunks} q=${r.queries}`.padEnd(40)
        : `FAIL ${r.status || '?'} ${r.reason || ''}`.padEnd(40);
    console.log(model.padEnd(34), fmt(grounded), fmt(baseline));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

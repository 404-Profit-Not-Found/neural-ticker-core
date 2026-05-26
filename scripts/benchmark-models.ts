/**
 * Benchmark all Gemini/Gemma models used by GeminiProvider.
 *
 * For each model:
 *   - sends a small prompt
 *   - non-Gemma / non-extraction models also get Google Search grounding
 *     enabled so we verify tool calls work end-to-end
 *   - records latency, token usage, grounding metadata, error (if any)
 *
 * Run:  npx ts-node scripts/benchmark-models.ts
 */
import 'dotenv/config';
import { GoogleGenAI, Tool } from '@google/genai';

type Tier =
  | 'deep'
  | 'medium'
  | 'low'
  | 'extraction'
  | 'cron'
  | 'summary'
  | 'recommendation'
  | 'scoring';

const TIERS: { tier: Tier; model: string }[] = [
  { tier: 'deep', model: 'gemini-3.1-pro-preview' },
  { tier: 'medium', model: 'gemini-2.5-flash' },
  { tier: 'low', model: 'gemini-2.5-flash-lite' },
  { tier: 'extraction', model: 'gemini-3.1-flash-lite' },
  { tier: 'cron', model: 'gemini-3.1-flash-lite' },
  { tier: 'summary', model: 'gemma-4-26b-a4b-it' },
  { tier: 'recommendation', model: 'gemma-4-31b-it' },
  { tier: 'scoring', model: 'gemma-4-26b-a4b-it' },
];

const GEMMA_MODELS = new Set(['gemma-4-26b-a4b-it', 'gemma-4-31b-it']);

const PROMPT_GENERIC =
  'In one short sentence, what is the current ticker symbol for Apple Inc.?';
const PROMPT_GROUNDED =
  'Give one sentence: what was Apple’s most recent quarterly revenue announcement? Cite the source.';
const PROMPT_EXTRACTION =
  'From this text, return ONLY JSON {"ticker": string, "name": string}: "Tesla, ticker TSLA, makes electric vehicles."';

interface Row {
  tier: Tier;
  model: string;
  key: 'primary' | 'secondary';
  searchEnabled: boolean;
  ok: boolean;
  ms: number;
  tokensIn?: number;
  tokensOut?: number;
  groundingChunks?: number;
  searchQueries?: number;
  textPreview?: string;
  error?: string;
}

async function callOnce(
  client: GoogleGenAI,
  model: string,
  prompt: string,
  tools: Tool[],
): Promise<Row['groundingChunks'] extends infer _ ? Partial<Row> : never> {
  const t0 = Date.now();
  try {
    const res: any = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: tools.length ? tools : undefined,
        systemInstruction:
          'You are a concise assistant. Answer in one short sentence.',
      },
    });
    const ms = Date.now() - t0;
    const cand = res?.candidates?.[0];
    const gMeta = cand?.groundingMetadata;
    return {
      ok: true,
      ms,
      tokensIn: res?.usageMetadata?.promptTokenCount,
      tokensOut: res?.usageMetadata?.candidatesTokenCount,
      groundingChunks: gMeta?.groundingChunks?.length ?? 0,
      searchQueries: gMeta?.webSearchQueries?.length ?? 0,
      textPreview:
        (res?.text || cand?.content?.parts?.map((p: any) => p.text).join(''))?.slice(
          0,
          80,
        ) ?? '',
    } as any;
  } catch (err: any) {
    return {
      ok: false,
      ms: Date.now() - t0,
      error: err?.message?.slice(0, 200) || String(err).slice(0, 200),
    } as any;
  }
}

async function benchmark() {
  const primaryKey = process.env.GEMINI_API_KEY;
  const secondaryKey = process.env.GEMINI_API_KEY_SECONDARY;
  if (!primaryKey) throw new Error('GEMINI_API_KEY not set');

  const primary = new GoogleGenAI({ apiKey: primaryKey });
  const secondary = secondaryKey
    ? new GoogleGenAI({ apiKey: secondaryKey })
    : null;

  const rows: Row[] = [];

  for (const { tier, model } of TIERS) {
    const isGemma = GEMMA_MODELS.has(model);
    const isExtraction = tier === 'extraction';
    const searchEnabled = !isGemma && !isExtraction;
    const tools: Tool[] = searchEnabled ? [{ googleSearch: {} }] : [];
    const prompt = isExtraction
      ? PROMPT_EXTRACTION
      : searchEnabled
        ? PROMPT_GROUNDED
        : PROMPT_GENERIC;

    process.stdout.write(`\n[${tier.padEnd(14)}] ${model} ... `);

    // Try primary first
    let result = await callOnce(primary, model, prompt, tools);
    let keyUsed: 'primary' | 'secondary' = 'primary';

    // If primary fails on a known gated model & we have a secondary key, retry
    if (!result.ok && secondary) {
      process.stdout.write(`primary failed (${result.error?.slice(0, 60)}), retrying on SECONDARY... `);
      result = await callOnce(secondary, model, prompt, tools);
      keyUsed = 'secondary';
    }

    process.stdout.write(
      result.ok
        ? `OK ${result.ms}ms tok:${result.tokensIn ?? '?'}/${result.tokensOut ?? '?'} grounding:${result.groundingChunks ?? 0}`
        : `FAIL ${result.ms}ms ${result.error}`,
    );

    rows.push({
      tier,
      model,
      key: keyUsed,
      searchEnabled,
      ok: !!result.ok,
      ms: result.ms ?? 0,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      groundingChunks: result.groundingChunks,
      searchQueries: result.searchQueries,
      textPreview: result.textPreview,
      error: result.error,
    });
  }

  console.log('\n\n================ RESULTS ================');
  console.log(
    [
      'tier'.padEnd(15),
      'model'.padEnd(26),
      'key'.padEnd(10),
      'search'.padEnd(8),
      'ok'.padEnd(5),
      'ms'.padEnd(7),
      'tok in/out'.padEnd(12),
      'ground'.padEnd(7),
      'queries'.padEnd(8),
      'preview/error',
    ].join(' | '),
  );
  console.log('-'.repeat(150));
  for (const r of rows) {
    console.log(
      [
        r.tier.padEnd(15),
        r.model.padEnd(26),
        r.key.padEnd(10),
        (r.searchEnabled ? 'yes' : 'no').padEnd(8),
        (r.ok ? 'OK' : 'FAIL').padEnd(5),
        String(r.ms).padEnd(7),
        `${r.tokensIn ?? '?'}/${r.tokensOut ?? '?'}`.padEnd(12),
        String(r.groundingChunks ?? 0).padEnd(7),
        String(r.searchQueries ?? 0).padEnd(8),
        (r.ok ? r.textPreview : r.error)?.replace(/\n/g, ' ') ?? '',
      ].join(' | '),
    );
  }
  console.log('=========================================');

  const failed = rows.filter((r) => !r.ok);
  const searchExpectedButZero = rows.filter(
    (r) => r.ok && r.searchEnabled && (r.groundingChunks ?? 0) === 0,
  );

  console.log(`\nTotal: ${rows.length}`);
  console.log(`OK: ${rows.length - failed.length}, FAIL: ${failed.length}`);
  if (searchExpectedButZero.length) {
    console.log(
      `\nWARN: ${searchExpectedButZero.length} model(s) had search enabled but returned no grounding chunks:`,
    );
    for (const r of searchExpectedButZero) console.log(`  - ${r.tier} (${r.model})`);
  }
}

benchmark().catch((e) => {
  console.error('Benchmark crashed:', e);
  process.exit(1);
});

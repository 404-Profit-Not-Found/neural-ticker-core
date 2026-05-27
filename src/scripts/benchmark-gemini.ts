import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import { Chalk } from 'chalk';

dotenv.config();
const chalk = new Chalk({ level: 3 });

type CallResult = {
  ok: boolean;
  ms: number;
  bytes: number;
  status?: number | string;
  message?: string;
  preview?: string;
};

// All models we currently reference in the codebase + the ones the
// Gemini docs claim to be available on this key.
const MODELS_FROM_CODE: string[] = [
  // configuration.ts defaults
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemma-4-26b-a4b-it',
  'gemini-3.1-flash-lite',
  'gemma-4-31b-it',
  // gemini.provider.ts hard-coded
  'gemini-2.5-flash',
];

const MODELS_FROM_DOCS: string[] = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3-pro',
  'gemma-3-1b',
  'gemma-3-2b',
  'gemma-3-4b',
  'gemma-3-12b',
  'gemma-3-27b',
];

const ALL_MODELS = Array.from(
  new Set<string>([...MODELS_FROM_CODE, ...MODELS_FROM_DOCS]),
);

const EXTRACTION_PROMPT = `You are a strict data extraction engine.
Return ONLY a JSON object (no markdown, no commentary) with this exact shape:
{"ticker":"AAPL","price":number,"sentiment":"bullish"|"bearish"|"neutral"}

Source text:
Apple Inc. (AAPL) closed at $189.42 today amid optimistic analyst upgrades.`;

const SIMPLE_PROMPT = 'Reply with the single word: OK';

function classify(err: any): { status: number | string; msg: string } {
  const status = err?.status ?? err?.code ?? err?.response?.status ?? 'ERR';
  const msg =
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    err?.message ||
    String(err);
  return { status, msg: msg.slice(0, 240) };
}

async function callModel(
  client: GoogleGenAI,
  model: string,
  prompt: string,
): Promise<CallResult> {
  const start = Date.now();
  try {
    const resp = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 256 },
    });
    const text = resp.text || '';
    return {
      ok: text.length > 0,
      ms: Date.now() - start,
      bytes: text.length,
      preview: text.slice(0, 120).replace(/\s+/g, ' '),
      status: text.length > 0 ? 200 : 'EMPTY',
    };
  } catch (err: any) {
    const { status, msg } = classify(err);
    return {
      ok: false,
      ms: Date.now() - start,
      bytes: 0,
      status,
      message: msg,
    };
  }
}

function fmtStatus(ok: boolean, status: number | string | undefined): string {
  if (ok) return chalk.green(`✓ ${status ?? 200}`);
  return chalk.red(`✗ ${status ?? 'ERR'}`);
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('FATAL: GEMINI_API_KEY missing in .env'));
    process.exit(1);
  }
  const client = new GoogleGenAI({ apiKey });

  console.log(
    chalk.bold.cyan(
      `\nGemini API key benchmark — ${ALL_MODELS.length} models × 2 calls (simple + JSON extraction)\n`,
    ),
  );

  const rows: Array<Record<string, string>> = [];

  for (const model of ALL_MODELS) {
    process.stdout.write(chalk.yellow(model.padEnd(28)));
    const simple = await callModel(client, model, SIMPLE_PROMPT);
    process.stdout.write(' simple=' + fmtStatus(simple.ok, simple.status));
    const extract = await callModel(client, model, EXTRACTION_PROMPT);
    process.stdout.write(
      '  extract=' + fmtStatus(extract.ok, extract.status) + '\n',
    );

    let extractValid = false;
    if (extract.ok && extract.preview) {
      const m = extract.preview.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const obj = JSON.parse(m[0]);
          extractValid =
            typeof obj.ticker === 'string' &&
            typeof obj.price === 'number' &&
            typeof obj.sentiment === 'string';
        } catch {
          extractValid = false;
        }
      }
    }

    rows.push({
      Model: model,
      Simple: simple.ok ? `OK ${simple.ms}ms` : `FAIL ${simple.status}`,
      Extract: extract.ok ? `OK ${extract.ms}ms` : `FAIL ${extract.status}`,
      'JSON valid': extract.ok ? (extractValid ? 'yes' : 'NO') : '-',
      Error: (simple.message || extract.message || '').slice(0, 90),
    });
  }

  console.log(chalk.bold.cyan('\nResults:\n'));
  console.table(rows);

  const dead = rows.filter((r) => r.Simple.startsWith('FAIL'));
  const extractBroken = rows.filter(
    (r) => !r.Simple.startsWith('FAIL') && r['JSON valid'] === 'NO',
  );
  const extractFails = rows.filter(
    (r) => !r.Simple.startsWith('FAIL') && r.Extract.startsWith('FAIL'),
  );

  console.log(chalk.bold.red('\nDead models (simple call fails):'));
  if (dead.length === 0) console.log(chalk.green('  none'));
  for (const r of dead) console.log(`  - ${r.Model}  (${r.Error})`);

  console.log(
    chalk.bold.yellow(
      '\nWorking but extraction call fails (e.g. quota on long output):',
    ),
  );
  if (extractFails.length === 0) console.log(chalk.green('  none'));
  for (const r of extractFails) console.log(`  - ${r.Model}  (${r.Error})`);

  console.log(
    chalk.bold.yellow('\nWorking but produced invalid JSON for extraction:'),
  );
  if (extractBroken.length === 0) console.log(chalk.green('  none'));
  for (const r of extractBroken) console.log(`  - ${r.Model}`);
}

main().catch((e) => {
  console.error(chalk.red('Benchmark crashed:'), e);
  process.exit(1);
});

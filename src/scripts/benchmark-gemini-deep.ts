import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import { Chalk } from 'chalk';

dotenv.config();
const chalk = new Chalk({ level: 3 });

const ITERS = 5;

// The handful that came back ambiguous in the first sweep:
// - gemini-3-pro-preview: 429 once → is this hard-quota or transient?
// - gemma-4-31b-it: 500 on short prompt, 200 on long → flaky?
// - gemini-3.1-flash-lite: works, but is it on the docs sheet? confirm stability
// Plus the production-realistic extraction prompt used by research.service.ts.
const MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-3.1-flash-lite',
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
];

const PROD_EXTRACTION_PROMPT = `You are a strict data extraction engine.
Given the research note below, return ONLY valid JSON. No prose, no markdown fences.
Schema:
{
  "ticker": string,
  "company": string,
  "description": string,
  "metrics": { "revenue_ttm_usd": number|null, "operating_margin_pct": number|null },
  "risks": string[],
  "sentiment": "bullish"|"bearish"|"neutral"
}

Research note:
Apple Inc. (AAPL) reported fiscal Q4 2025 revenue of $94.93B, up 6% YoY.
Services hit a record $24.97B. Operating margin expanded ~120bps to 31.5%.
iPhone unit growth was flat in China; FX headwinds continue. Analyst tone bullish into the holiday quarter.`;

type Run = {
  ok: boolean;
  ms: number;
  status: number | string;
  preview: string;
  jsonOk: boolean;
};

async function call(client: GoogleGenAI, model: string): Promise<Run> {
  const start = Date.now();
  try {
    const r = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: PROD_EXTRACTION_PROMPT }] }],
      config: { maxOutputTokens: 600 },
    });
    const txt = r.text || '';
    let jsonOk = false;
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const o = JSON.parse(m[0]);
        jsonOk =
          typeof o.ticker === 'string' &&
          typeof o.company === 'string' &&
          typeof o.sentiment === 'string' &&
          Array.isArray(o.risks) &&
          o.metrics &&
          typeof o.metrics === 'object';
      } catch {
        jsonOk = false;
      }
    }
    return {
      ok: txt.length > 0,
      ms: Date.now() - start,
      status: 200,
      preview: txt.slice(0, 160).replace(/\s+/g, ' '),
      jsonOk,
    };
  } catch (err: any) {
    return {
      ok: false,
      ms: Date.now() - start,
      status: err?.status ?? err?.code ?? 'ERR',
      preview: (err?.message || '').slice(0, 160),
      jsonOk: false,
    };
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('GEMINI_API_KEY missing'));
    process.exit(1);
  }
  const client = new GoogleGenAI({ apiKey });

  console.log(
    chalk.bold.cyan(
      `\nDeep extraction benchmark — ${MODELS.length} models × ${ITERS} runs (production-shaped JSON prompt)\n`,
    ),
  );

  const summary: any[] = [];
  for (const m of MODELS) {
    const runs: Run[] = [];
    process.stdout.write(chalk.yellow(m.padEnd(28)) + ' ');
    for (let i = 0; i < ITERS; i++) {
      const r = await call(client, m);
      runs.push(r);
      process.stdout.write(
        r.ok && r.jsonOk
          ? chalk.green('✓')
          : r.ok
            ? chalk.yellow('~')
            : chalk.red('✗'),
      );
      await new Promise((res) => setTimeout(res, 1200)); // be polite vs free-tier RPM
    }
    process.stdout.write('\n');
    const ok = runs.filter((r) => r.ok).length;
    const jsonOk = runs.filter((r) => r.jsonOk).length;
    const avgMs = ok
      ? Math.round(runs.filter((r) => r.ok).reduce((a, r) => a + r.ms, 0) / ok)
      : 0;
    const errs = runs.filter((r) => !r.ok).map((r) => r.status);
    summary.push({
      Model: m,
      Pass: `${ok}/${ITERS}`,
      JSON: `${jsonOk}/${ITERS}`,
      AvgMs: avgMs || '-',
      ErrorStatuses: errs.join(',') || '-',
    });
  }

  console.log(chalk.bold.cyan('\nSummary:\n'));
  console.table(summary);

  console.log(chalk.bold.cyan('\nVerdict:'));
  for (const row of summary) {
    const pass = parseInt(row.Pass.split('/')[0], 10);
    const json = parseInt(row.JSON.split('/')[0], 10);
    if (pass === 0)
      console.log(
        `  ${chalk.red('DEAD')}      ${row.Model}  (status ${row.ErrorStatuses})`,
      );
    else if (pass < ITERS)
      console.log(
        `  ${chalk.yellow('FLAKY')}     ${row.Model}  (${row.Pass}, errs=${row.ErrorStatuses})`,
      );
    else if (json < ITERS)
      console.log(
        `  ${chalk.yellow('JSON-WEAK')} ${row.Model}  (extracts: ${row.JSON})`,
      );
    else
      console.log(
        `  ${chalk.green('OK')}        ${row.Model}  (${row.AvgMs}ms avg)`,
      );
  }
}

main().catch((e) => {
  console.error(chalk.red('Crashed:'), e);
  process.exit(1);
});

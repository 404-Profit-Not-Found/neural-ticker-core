/**
 * Verify GEMINI_API_KEY_SECONDARY against multiple endpoints,
 * so we can tell whether it's truly invalid or only some model is gated.
 */
import 'dotenv/config';

async function call(label: string, url: string) {
  const t0 = Date.now();
  try {
    const r = await fetch(url);
    const text = await r.text();
    const ms = Date.now() - t0;
    console.log(`[${label}] HTTP ${r.status} (${ms}ms)`);
    console.log(text.slice(0, 600));
    console.log('---');
  } catch (e: any) {
    console.log(`[${label}] threw ${e.message}`);
  }
}

async function main() {
  const key = process.env.GEMINI_API_KEY_SECONDARY;
  if (!key) {
    console.log('No GEMINI_API_KEY_SECONDARY set');
    return;
  }
  console.log('GEMINI_API_KEY_SECONDARY is set; running endpoint checks.');

  await call(
    'listModels',
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
  );

  await call(
    'generateContent flash-lite',
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(key)}`,
  );
}

main().catch((e) => console.error(e));

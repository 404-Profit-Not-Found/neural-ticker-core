import 'dotenv/config';

async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('No GEMINI_API_KEY');
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`,
  );
  const data: any = await r.json();
  if (!data.models) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  const interesting = data.models.filter((m: any) =>
    /flash|lite|gemini-3/i.test(m.name),
  );
  for (const m of interesting) {
    console.log(m.name, '|', m.displayName, '|', (m.supportedGenerationMethods || []).join(','));
  }
}
main().catch((e) => console.error(e));

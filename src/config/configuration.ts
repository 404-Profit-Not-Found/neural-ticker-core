export default () => {
  return {
    env: process.env.APP_ENV || 'local',
    port: parseInt(process.env.APP_PORT || '3000', 10),
    frontendUrl: process.env.FRONTEND_URL,
    database: {
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME ?? process.env.POSTGRES_USER ?? 'admin',
      password: (
        process.env.DB_PASSWORD ??
        process.env.POSTGRES_PASSWORD ??
        ''
      ).toString(),
      database: process.env.DB_DATABASE,
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
    },
    finnhub: {
      apiKey: process.env.FINNHUB_API_KEY,
      baseUrl: process.env.FINNHUB_BASE_URL || 'https://finnhub.io/api/v1',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      // Per-request guardrails consumed by OpenAiProvider's SDK client: bound
      // retry budget and single-attempt timeout so a hung upstream can't stall
      // the research pipeline. Provider falls back to 2 / 60000 if unset.
      maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '2', 10),
      timeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10),
      models: {
        low: process.env.OPENAI_MODEL_LOW || 'gpt-4.1-mini', // Default to mini for extraction
        medium: process.env.OPENAI_MODEL_MEDIUM || 'gpt-4.1-mini',
        high: process.env.OPENAI_MODEL_HIGH || 'gpt-4o',
        deep: process.env.OPENAI_MODEL_DEEP || 'gpt-5.1',
      },
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL,
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      secondaryApiKey: process.env.GEMINI_API_KEY_SECONDARY,
      models: {
        // 'low' = the cheap/fast research tier. gemini-3.1-flash-lite gives
        // 500 free requests/day on the primary key (vs ~20/day for the old
        // 2.5-flash-lite) and is NOT a gated "-preview" model, so it stays on
        // the free key. 2.5-flash-lite remains an automatic 429 fallback.
        low: process.env.GEMINI_MODEL_LOW || 'gemini-3.1-flash-lite',
        // 'medium' = the balanced "flash" tier. gemini-3.5-flash has no
        // '-preview' suffix, so it runs on the primary (free) key.
        medium: process.env.GEMINI_MODEL_MEDIUM || 'gemini-3.5-flash',
        // 'deep' = the premium "pro" tier. Pro is only available on the billed
        // (secondary) key, so it MUST keep the gated '-preview' suffix.
        deep: process.env.GEMINI_MODEL_DEEP || 'gemini-3.1-pro-preview',
        extraction:
          process.env.GEMINI_MODEL_EXTRACTION || 'gemini-3.1-flash-lite',
      },
    },
    llm: {
      // Hard daily cap on free-tier (primary-key) flash-lite calls. Kept below
      // Google's 500/day free quota so background/cron research stops on its
      // own and never escalates to the billed secondary key. DB-backed counter
      // (llm_daily_usage) survives Cloud Run instance restarts.
      dailyFreeLimit: parseInt(process.env.LLM_DAILY_FREE_LIMIT || '450', 10),
    },
    riskReward: {
      enabled: process.env.RRSCORE_ENABLED !== 'false',
      cron: process.env.RRSCORE_CRON_EXPRESSION || '0 * * * *',
      // Re-research cadence for the universe scan: a ticker is "due" once its
      // latest analysis is older than this (or it has never been analysed).
      // Defaults to 7 days ("raz za tyzden").
      maxAgeHours: parseInt(process.env.RRSCORE_MAX_AGE_HOURS || '168', 10),
      batchSize: parseInt(process.env.RRSCORE_BATCH_SIZE || '50', 10),
      provider: process.env.RRSCORE_PROVIDER || 'gemini',
    },
    marketData: {
      stalePriceMinutes: parseInt(
        process.env.MARKET_DATA_STALE_PRICE_MINUTES || '15',
        10,
      ),
      staleFundamentalsHours: parseInt(
        process.env.MARKET_DATA_STALE_FUNDAMENTALS_HOURS || '24',
        10,
      ),
    },
    http: {
      readTimeout: parseInt(process.env.HTTP_READ_TIMEOUT_SEC || '10', 10),
      writeTimeout: parseInt(process.env.HTTP_WRITE_TIMEOUT_SEC || '10', 10),
    },
    firebase: {
      serviceAccountJson:
        process.env.GCP_SA_KEY || process.env.FIREBASE_CREDENTIALS_JSON,
      projectId: process.env.FIREBASE_PROJECT_ID,
    },
  };
};

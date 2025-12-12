export default () => {
  console.log('[DEBUG Config] DB_PASSWORD env:', process.env.DB_PASSWORD);
  console.log(
    '[DEBUG Config] DB_PASSWORD type:',
    typeof process.env.DB_PASSWORD,
  );

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
      models: {
        low: 'gpt-4.1-nano',
        medium: 'gpt-4.1-mini',
        high: 'gpt-5-mini',
        deep: 'gpt-5.1',
      },
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL,
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      models: {
        low: 'gemini-2.5-flash-lite',
        medium: 'gemini-2.5-flash-lite',
        deep: 'gemini-2.0-flash-exp',
        extraction: 'gemini-2.5-flash-lite',
      },
    },
    riskReward: {
      enabled: process.env.RRSCORE_ENABLED !== 'false',
      cron: process.env.RRSCORE_CRON_EXPRESSION || '0 * * * *',
      maxAgeHours: parseInt(process.env.RRSCORE_MAX_AGE_HOURS || '168', 10),
      batchSize: parseInt(process.env.RRSCORE_BATCH_SIZE || '50', 10),
      provider: process.env.RRSCORE_PROVIDER || 'openai',
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

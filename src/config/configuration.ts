export default () => ({
  env: process.env.APP_ENV || 'local',
  port: parseInt(process.env.APP_PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  finnhub: {
    apiKey: process.env.FINNHUB_API_KEY,
    baseUrl: process.env.FINNHUB_BASE_URL || 'https://finnhub.io/api/v1',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    models: {
      low: process.env.OPENAI_MODEL_LOW || 'gpt-4o-mini',
      medium: process.env.OPENAI_MODEL_MEDIUM || 'gpt-4o',
      high: process.env.OPENAI_MODEL_HIGH || 'gpt-4o',
      deep: process.env.OPENAI_MODEL_DEEP || 'gpt-4o',
    },
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    models: {
      low: process.env.GEMINI_MODEL_LOW || 'gemini-1.5-flash',
      medium: process.env.GEMINI_MODEL_MEDIUM || 'gemini-1.5-pro',
      high: process.env.GEMINI_MODEL_HIGH || 'gemini-1.5-pro',
    },
  },
  riskReward: {
    enabled: process.env.RRSCORE_ENABLED !== 'false',
    cron: process.env.RRSCORE_CRON_EXPRESSION || '0 * * * *',
    maxAgeHours: parseInt(process.env.RRSCORE_MAX_AGE_HOURS || '168', 10),
    batchSize: parseInt(process.env.RRSCORE_BATCH_SIZE || '50', 10),
    provider: process.env.RRSCORE_PROVIDER || 'openai',
  },
  http: {
    readTimeout: parseInt(process.env.HTTP_READ_TIMEOUT_SEC || '10', 10),
    writeTimeout: parseInt(process.env.HTTP_WRITE_TIMEOUT_SEC || '10', 10),
  },
});

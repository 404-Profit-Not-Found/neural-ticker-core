import { validate } from './validation';

describe('Configuration Validation', () => {
  const validConfig = {
    DATABASE_URL: 'postgres://localhost:5432/db',
    FINNHUB_API_KEY: 'test-key',
    OPENAI_API_KEY: 'test-key',
    GOOGLE_CALLBACK_URL: 'http://localhost:3000/callback',
    GEMINI_API_KEY: 'test-key',
  };

  it('should validate a valid configuration', () => {
    const result = validate(validConfig);
    expect(result.DATABASE_URL).toBe(validConfig.DATABASE_URL);
    expect(result.FINNHUB_API_KEY).toBe(validConfig.FINNHUB_API_KEY);
  });

  it('should throw an error if a required field is missing', () => {
    const invalidConfig = { ...validConfig };
    delete (invalidConfig as any).DATABASE_URL;

    expect(() => validate(invalidConfig)).toThrow();
  });

  it('should handle optional fields and implicit conversion', () => {
    const configWithOptionals = {
      ...validConfig,
      APP_PORT: '3000',
      RRSCORE_BATCH_SIZE: '100',
      APP_ENV: 'local',
    };

    const result = validate(configWithOptionals);
    expect(result.APP_PORT).toBe(3000); // Converted to number
    expect(result.RRSCORE_BATCH_SIZE).toBe(100); // Converted to number
    expect(result.APP_ENV).toBe('local');
  });

  it('should throw error for invalid enum value', () => {
    const invalidEnumConfig = {
      ...validConfig,
      APP_ENV: 'invalid-env',
    };

    expect(() => validate(invalidEnumConfig)).toThrow();
  });

  it('should throw error for out of range numbers', () => {
    const outOfRangeConfig = {
      ...validConfig,
      RRSCORE_BATCH_SIZE: '600', // Max is 500
    };

    expect(() => validate(outOfRangeConfig)).toThrow();
  });

  it('should throw error for invalid URL', () => {
     const invalidUrlConfig = {
      ...validConfig,
      FINNHUB_BASE_URL: 'not-a-url',
    };

    expect(() => validate(invalidUrlConfig)).toThrow();
  });
});

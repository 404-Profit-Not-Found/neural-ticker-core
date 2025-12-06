// This file runs before every test file.
// Validates environment variables and sets defaults for testing.

import * as dotenv from 'dotenv';

// Load .env file if available (local development)
dotenv.config();

// FORCE CI/TEST DEFAULTS
// These values ensure that tests pass even if the environment (like GitHub Actions)
// does not provide them, avoiding "SASL: client password must be a string" errors.

if (!process.env.DB_PASSWORD) {
  process.env.DB_PASSWORD = 'password';
}
if (!process.env.DB_USERNAME) {
  process.env.DB_USERNAME = 'neural';
}
if (!process.env.DB_DATABASE) {
  process.env.DB_DATABASE = 'neural_db';
}
if (!process.env.DB_HOST) {
  process.env.DB_HOST = '127.0.0.1';
}

// Stub API Keys if missing
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
process.env.FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'test-key';

// Mock Firebase Credentials if missing
if (!process.env.FIREBASE_CREDENTIALS_JSON) {
  process.env.FIREBASE_CREDENTIALS_JSON = JSON.stringify({
    private_key:
      '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDb...\n-----END PRIVATE KEY-----\n',
    client_email: 'mock@email.com',
    project_id: 'mock-project',
  });
}

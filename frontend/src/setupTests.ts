import '@testing-library/jest-dom/vitest';

// Stub global constants
Object.defineProperty(global, '__APP_VERSION__', {
  value: '0.0.0-test',
  writable: true
});

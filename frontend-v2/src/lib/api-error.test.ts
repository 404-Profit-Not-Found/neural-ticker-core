import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api-error';

describe('apiErrorMessage', () => {
  it('returns the server message', () => {
    expect(apiErrorMessage({ response: { data: { message: 'This nickname is already taken.' } } }, 'x')).toBe(
      'This nickname is already taken.',
    );
  });

  it('returns the first validation message of a list', () => {
    expect(apiErrorMessage({ response: { data: { message: ['', 'content must be shorter than 4000 characters'] } } }, 'x')).toBe(
      'content must be shorter than 4000 characters',
    );
  });

  it('falls back for anything else', () => {
    expect(apiErrorMessage(new Error('Network Error'), 'Try again.')).toBe('Try again.');
    expect(apiErrorMessage({ response: { data: '<html>502</html>' } }, 'Try again.')).toBe('Try again.');
    expect(apiErrorMessage(null, 'Try again.')).toBe('Try again.');
  });
});

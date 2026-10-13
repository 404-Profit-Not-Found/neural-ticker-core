import { BadRequestException } from '@nestjs/common';
import {
  LlmUnavailableException,
  asLlmUnavailable,
} from './llm-unavailable.exception';

describe('LlmUnavailableException', () => {
  it('is a 503 with a stable message and a machine-readable code — and nothing else', () => {
    const error = new LlmUnavailableException('quota_exhausted');

    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toEqual({
      statusCode: 503,
      error: 'Service Unavailable',
      message:
        'AI analysis is temporarily unavailable. Please try again later.',
      code: 'LLM_UNAVAILABLE',
    });
    // The reason is for logs and callers, never for the response.
    expect(JSON.stringify(error.getResponse())).not.toContain('quota');
    expect(error.reason).toBe('quota_exhausted');
  });
});

describe('asLlmUnavailable — "no LLM answer can be had" vs a bug', () => {
  const sdkError = (status: number, message: string) =>
    Object.assign(new Error(message), { name: 'ApiError', status });

  it.each([
    [
      'no key configured',
      new LlmUnavailableException('not_configured'),
      'not_configured',
    ],
    [
      'the provider rejects the key (401)',
      sdkError(401, 'Unauthorized'),
      'not_configured',
    ],
    [
      'the provider rejects the key (403)',
      sdkError(403, 'Forbidden'),
      'not_configured',
    ],
    [
      '"API key not valid" in the text',
      new Error('API key not valid. Please pass a valid API key.'),
      'not_configured',
    ],
    ['quota (429)', sdkError(429, 'Too Many Requests'), 'quota_exhausted'],
    [
      'quota in the text',
      new Error('You exceeded your current quota'),
      'quota_exhausted',
    ],
    [
      'RESOURCE_EXHAUSTED',
      new Error('{"status":"RESOURCE_EXHAUSTED"}'),
      'quota_exhausted',
    ],
    [
      'a numeric `code` of 429',
      Object.assign(new Error('x'), { code: 429 }),
      'quota_exhausted',
    ],
    ['provider 500', sdkError(500, 'Internal'), 'provider_error'],
    [
      'provider 503 overloaded',
      sdkError(503, 'The model is overloaded'),
      'provider_error',
    ],
    [
      'connection reset',
      Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
      'provider_error',
    ],
    [
      'DNS failure in the cause',
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ENOTFOUND' },
      }),
      'provider_error',
    ],
    ['a timeout', new Error('Request timed out.'), 'provider_error'],
  ])('%s → LLM unavailable (%s)', (_label, error, reason) => {
    const unavailable = asLlmUnavailable(error);
    expect(unavailable).toBeInstanceOf(LlmUnavailableException);
    expect(unavailable!.reason).toBe(reason);
  });

  it.each([
    [
      'a programming error',
      new TypeError("Cannot read properties of undefined (reading 'text')"),
    ],
    ['an unparseable answer', new Error('No JSON found in LLM response')],
    [
      'a request the provider rejects as invalid (400)',
      sdkError(400, 'Invalid model name'),
    ],
    [
      'one of our own HTTP errors',
      new BadRequestException('Unknown provider: foo'),
    ],
    ['a missing ticker', new Error('Ticker XYZ not found')],
    ['not an error at all', 'boom'],
    ['nothing', undefined],
  ])('%s stays what it is', (_label, error) => {
    expect(asLlmUnavailable(error)).toBeNull();
  });

  it('never copies the provider text into the response (it can quote a key)', () => {
    const unavailable = asLlmUnavailable(
      sdkError(
        403,
        'API key AIzaSyFAKE-not-a-real-key is not valid for project 123',
      ),
    )!;
    const body = JSON.stringify(unavailable.getResponse());
    expect(body).not.toContain('AIza');
    expect(body).not.toContain('project');
    expect(unavailable.message).toBe(
      'AI analysis is temporarily unavailable. Please try again later.',
    );
  });
});

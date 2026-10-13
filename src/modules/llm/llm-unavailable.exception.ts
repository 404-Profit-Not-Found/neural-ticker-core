import { HttpException, ServiceUnavailableException } from '@nestjs/common';

export const LLM_UNAVAILABLE_CODE = 'LLM_UNAVAILABLE';
export const LLM_UNAVAILABLE_MESSAGE =
  'AI analysis is temporarily unavailable. Please try again later.';

export type LlmUnavailableReason =
  /** No API key, or the provider rejects the one we have. */
  | 'not_configured'
  /** The provider's quota / rate limit is used up. */
  | 'quota_exhausted'
  /** The provider is down, overloaded or unreachable. */
  | 'provider_error';

/**
 * An action needed an LLM answer and none could be had — not a bug of ours.
 * Answered as
 *   503 { statusCode, error: 'Service Unavailable',
 *         message: 'AI analysis is temporarily unavailable. Please try again later.',
 *         code: 'LLM_UNAVAILABLE' }
 * The body is fixed: it never carries the provider's error text (which can
 * quote the request, the model, the project or a key fragment). `reason` is
 * for our logs and for callers that react to it (credit refunds); it is not
 * serialized.
 */
export class LlmUnavailableException extends ServiceUnavailableException {
  constructor(readonly reason: LlmUnavailableReason) {
    super({
      statusCode: 503,
      error: 'Service Unavailable',
      message: LLM_UNAVAILABLE_MESSAGE,
      code: LLM_UNAVAILABLE_CODE,
    });
  }
}

const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * Is this failure "the LLM is unavailable"? Returns the exception to answer
 * with, or null for anything else — a programming error, a bad request the
 * provider rejected (400), one of our own HTTP errors — which must stay what
 * it is (a 500, or its own status).
 */
export function asLlmUnavailable(
  error: unknown,
): LlmUnavailableException | null {
  if (error instanceof LlmUnavailableException) return error;
  if (!error || typeof error !== 'object') return null;
  // Our own HTTP errors (validation, unknown provider, …) are not outages.
  if (error instanceof HttpException) return null;

  const e = error as {
    status?: unknown;
    code?: unknown;
    name?: unknown;
    message?: unknown;
    cause?: { code?: unknown };
  };
  const str = (value: unknown): string =>
    typeof value === 'string' || typeof value === 'number' ? `${value}` : '';
  const status = Number(
    e.status ?? (typeof e.code === 'number' ? e.code : NaN),
  );
  const code = str(e.code) || str(e.cause?.code);
  const text = `${str(e.name)} ${str(e.message)}`.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    /api key (is )?(not configured|not valid|invalid|missing)|invalid api key|incorrect api key|unauthenticated|permission denied/.test(
      text,
    )
  ) {
    return new LlmUnavailableException('not_configured');
  }
  if (
    status === 429 ||
    /quota|rate limit|resource_exhausted|too many requests|\b429\b/.test(text)
  ) {
    return new LlmUnavailableException('quota_exhausted');
  }
  if (
    (status >= 500 && status < 600) ||
    NETWORK_CODES.has(code) ||
    /fetch failed|network error|socket hang up|timed? ?out|overloaded|service unavailable|\bunavailable\b|internal error encountered/.test(
      text,
    )
  ) {
    return new LlmUnavailableException('provider_error');
  }
  return null;
}

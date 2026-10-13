/**
 * The human-readable message of a failed API call. NestJS sends
 * `{ message: string | string[] }` (an array for validation errors); anything
 * else — a network failure, an HTML error page — falls back to `fallback`.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  const message = (data as { message?: unknown } | null | undefined)?.message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message)) {
    const first = message.find((m): m is string => typeof m === 'string' && m.trim().length > 0);
    if (first) return first;
  }
  return fallback;
}

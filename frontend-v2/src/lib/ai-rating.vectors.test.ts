import { describe, expect, it } from 'vitest';
import { calculateAiRating, type VerdictInput } from './rating-utils';
import { deriveVerdict, type VerdictSource } from './ticker-metrics';
// The vectors live at the repository root because the backend checks the same
// file (src/lib/ticker-verdict.spec.ts). The frontend image is built from this
// directory alone, where the path does not exist — hence no type-level import.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- resolved by Vitest in a full checkout; absent in the Docker build context
import golden from '../../../test-vectors/ai-rating.json';

/**
 * The AI rating exists on both sides: here (what every badge shows) and on the
 * server (what the analyzer filters, sorts and counts by, in SQL). They agreed
 * only by accident until they did not — "Strong Buy" returned tickers badged
 * "Buy". These golden vectors are the contract: the same inputs, the same
 * outputs, checked here against `deriveVerdict` / `calculateAiRating` and on
 * the server against its port and its SQL.
 *
 * If this fails after a change to the rating maths, that is the point: the
 * server has to change with it. Copy `rating-utils.ts` to the backend
 * (src/lib/rating-utils.ts), update src/lib/ticker-verdict.ts, and regenerate:
 *   UPDATE_AI_RATING_VECTORS=1 npx jest src/lib/ticker-verdict.spec.ts
 */
interface Vector {
  name: string;
  source: VerdictSource;
  input: VerdictInput | null;
  expected: {
    upside: number | null;
    downside: number | null;
    downsideEstimated: boolean;
    /** null = the ticker has not been analysed (shown here as "-"). */
    rating: string | null;
    variant: string | null;
    score: number | null;
  };
}

const vectors = (golden as unknown as { vectors: Vector[] }).vectors;

describe('AI rating — golden vectors shared with the server', () => {
  it('has the vectors', () => {
    expect(vectors.length).toBeGreaterThan(300);
  });

  it.each(vectors.map((v) => [v.name, v] as const))('%s', (_name, { source, input, expected }) => {
    // 1. From what the API returns to upside / downside / rating.
    const verdict = deriveVerdict(source);
    expect({
      upside: verdict.upside,
      downside: verdict.downside,
      downsideEstimated: verdict.downsideEstimated,
      rating: verdict.rating,
      variant: verdict.variant,
    }).toEqual({
      upside: expected.upside,
      downside: expected.downside,
      downsideEstimated: expected.downsideEstimated,
      rating: expected.rating ?? '-',
      variant: expected.variant,
    });

    // 2. The score behind it, from the inputs the server derived.
    if (input === null) {
      expect(expected.score).toBeNull();
      return;
    }
    const rated = calculateAiRating(input);
    expect(rated.score).toBe(expected.score);
    expect(rated.rating).toBe(expected.rating);
    expect(rated.variant).toBe(expected.variant);
  });
});

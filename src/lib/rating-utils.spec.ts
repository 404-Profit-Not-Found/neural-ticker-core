import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * src/lib/rating-utils.ts is a byte-for-byte copy of the clients' rating
 * maths. This fails the moment one side changes without the other — the drift
 * that used to make the "Strong Buy" filter return tickers badged "Buy".
 *
 * When it fails: copy the frontend file over (below the marker line), then
 * bring the SQL twin in src/lib/ticker-verdict.ts into line and regenerate
 * the golden vectors —
 *   UPDATE_AI_RATING_VECTORS=1 npx jest src/lib/ticker-verdict.spec.ts
 * — and run the frontend's own check: (cd frontend-v2 && npx vitest run
 * src/lib/ai-rating.vectors.test.ts).
 */
describe('rating-utils.ts is the clients’ reference, unchanged', () => {
  const ROOT = join(__dirname, '..', '..');
  const MARKER =
    '// ============================ reference copy below ============================\n';
  const backend = readFileSync(join(__dirname, 'rating-utils.ts'), 'utf8');
  const copy = backend.slice(backend.indexOf(MARKER) + MARKER.length);

  it('has the marker line that separates the header from the copy', () => {
    expect(backend.split(MARKER)).toHaveLength(2);
  });

  // frontend-v2 is the client that ships; frontend/ is the previous one and
  // may be removed, so it is only checked while it is there.
  it.each([
    ['frontend-v2/src/lib/rating-utils.ts', true],
    ['frontend/src/lib/rating-utils.ts', false],
  ])('is identical to %s', (path, required) => {
    const file = join(ROOT, path);
    if (!existsSync(file)) {
      expect(required).toBe(false);
      return;
    }
    expect(copy).toBe(readFileSync(file, 'utf8'));
  });
});

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  AI_RATINGS,
  deriveVerdict,
  ratingFields,
  ratingFilterValue,
  tickerVerdict,
  verdictSource,
} from './ticker-verdict';
import {
  RatingCase,
  boundaryCases,
  randomCases,
  toVerdictRow,
} from '../../test/support/rating-cases';

const VECTOR_FILE = join(
  __dirname,
  '..',
  '..',
  'test-vectors',
  'ai-rating.json',
);
const RANDOM_VECTORS = 150;

interface Vector {
  name: string;
  /** What a client derives a rating from (its `VerdictSource`). */
  source: Record<string, unknown>;
  /** What `deriveVerdict` hands to `calculateAiRating`; null if not analysed. */
  input: Record<string, unknown> | null;
  expected: {
    upside: number | null;
    downside: number | null;
    downsideEstimated: boolean;
    /** null = not analysed (the clients display "-"). */
    rating: string | null;
    variant: string | null;
    score: number | null;
  };
}

const allCases = (): RatingCase[] => [
  ...boundaryCases(),
  ...randomCases(RANDOM_VECTORS),
];

/** JSON has no `undefined`: compare what actually gets written. */
const asJson = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function buildVectors(): Vector[] {
  return allCases().map((c) => {
    const source = verdictSource(toVerdictRow(c));
    const { input, ...expected } = deriveVerdict(source);
    return asJson({
      name: c.name,
      source,
      input,
      expected,
    }) as unknown as Vector;
  });
}

describe('AI rating — golden vectors (test-vectors/ai-rating.json)', () => {
  const built = buildVectors();

  if (process.env.UPDATE_AI_RATING_VECTORS) {
    it('writes the vector file', () => {
      mkdirSync(join(VECTOR_FILE, '..'), { recursive: true });
      writeFileSync(
        VECTOR_FILE,
        JSON.stringify(
          {
            about:
              'Golden vectors for the AI rating: inputs -> expected outputs. ' +
              'Checked by the backend (src/lib/ticker-verdict.spec.ts) and by ' +
              'the frontend (frontend-v2/src/lib/ai-rating.vectors.test.ts), ' +
              'so the two implementations cannot drift apart. Generated — do ' +
              'not edit by hand: UPDATE_AI_RATING_VECTORS=1 npx jest ' +
              'src/lib/ticker-verdict.spec.ts',
            vectors: built,
          },
          null,
          1,
        ) + '\n',
      );
      expect(existsSync(VECTOR_FILE)).toBe(true);
    });
    return;
  }

  const file: { vectors: Vector[] } = JSON.parse(
    readFileSync(VECTOR_FILE, 'utf8'),
  );

  it('the file holds exactly the cases the generator produces (regenerate after changing either)', () => {
    expect(file.vectors.map((v) => v.name)).toEqual(built.map((v) => v.name));
    expect(file.vectors.length).toBeGreaterThan(300);
  });

  it('every vector: the server derives the same inputs and the same result', () => {
    // One assertion per vector would be 300+ test lines; report the first few.
    const wrong = built
      .map((vector, i) => ({ vector, stored: file.vectors[i] }))
      .filter(
        ({ vector, stored }) =>
          JSON.stringify(vector) !== JSON.stringify(stored),
      )
      .slice(0, 3);
    expect(wrong).toEqual([]);
  });

  it('the vectors cover every rating, the not-analysed case and both downside modes', () => {
    const ratings = new Set(file.vectors.map((v) => v.expected.rating));
    for (const rating of AI_RATINGS) expect(ratings).toContain(rating);
    expect(ratings).toContain(null);
    const estimated = file.vectors.filter((v) => v.expected.downsideEstimated);
    expect(estimated.length).toBeGreaterThan(20);
    expect(file.vectors.length - estimated.length).toBeGreaterThan(100);
  });
});

/**
 * The rules where the server's old formulas (the SQL in MarketDataService and
 * the old src/lib/verdict.util.ts) disagreed with what the clients show.
 */
describe('AI rating — what the server now computes like the clients', () => {
  const rate = (over: Partial<RatingCase>) =>
    tickerVerdict(
      toVerdictRow({
        name: 'case',
        close: 100,
        analysis: {
          financial_risk: 5,
          overall_score: 5,
          upside_percent: 0,
          base: null,
          bear: null,
        },
        fundamentals: {
          consensus_rating: null,
          pe_ttm: null,
          revenue_ttm: 1000,
          fifty_two_week_high: null,
          fifty_two_week_low: null,
        },
        news_sentiment: null,
        news_impact_score: null,
        ...over,
      }),
    );
  const analysis = (over: Record<string, number | null>) => ({
    financial_risk: 5,
    overall_score: 5,
    upside_percent: 0,
    base: null,
    bear: null,
    ...over,
  });

  it('a ticker that was never analysed has no rating and no score', () => {
    const verdict = rate({ analysis: null });
    expect(verdict).toMatchObject({ rating: null, variant: null, score: null });
    expect(
      ratingFields(toVerdictRow({ ...allCases()[0], analysis: null })),
    ).toEqual({ rating: null, rating_score: null });
  });

  it('downside weighs 0.4 per point (the SQL used 0.8)', () => {
    // -30 % downside: 50 - 30 * 0.4 = 38
    expect(rate({ analysis: analysis({ bear: 70 }) }).score).toBe(38);
  });

  it('a negative upside lowers the score, down to -50 % (the SQL floored it at 0)', () => {
    expect(rate({ analysis: analysis({ base: 70, bear: 100 }) }).score).toBe(
      38,
    );
    expect(rate({ analysis: analysis({ base: 10, bear: 100 }) }).score).toBe(
      30,
    );
  });

  it('without a base target the stored upside_percent is used (the SQL used 0)', () => {
    const verdict = rate({
      analysis: analysis({ upside_percent: 25, bear: 100 }),
    });
    expect(verdict.upside).toBe(25);
    expect(verdict.score).toBe(60);
  });

  it('without a bear target the downside is estimated as -(risk * 2.5) (the SQL used risk * 5)', () => {
    const verdict = rate({ analysis: analysis({ financial_risk: 4 }) });
    expect(verdict).toMatchObject({ downside: -10, downsideEstimated: true });
    expect(verdict.score).toBe(46);
  });

  it('…and as -100 % from risk 8', () => {
    expect(rate({ analysis: analysis({ financial_risk: 8 }) }).downside).toBe(
      -100,
    );
  });

  it('a bear target of 0 is a real -100 %, not "missing"', () => {
    expect(rate({ analysis: analysis({ bear: 0 }) })).toMatchObject({
      downside: -100,
      downsideEstimated: false,
    });
  });

  it('52-week low reward also counts the position in the range (the SQL only looked at the distance from the low)', () => {
    // 60 is 20 % above the low of 50, but in the bottom 5 % of 50–250.
    const verdict = rate({
      close: 60,
      fundamentals: {
        consensus_rating: null,
        pe_ttm: null,
        revenue_ttm: 1000,
        fifty_two_week_low: 50,
        fifty_two_week_high: 250,
      },
    });
    // 50 - 5 (estimated downside -12.5 %) + 10
    expect(verdict.score).toBe(55);
  });

  it('a neural score of 0 means "none", not "bad" (the SQL took 10 points off)', () => {
    const zero = rate({ analysis: analysis({ overall_score: 0, bear: 100 }) });
    const low = rate({ analysis: analysis({ overall_score: 3, bear: 100 }) });
    expect(zero.score).toBe(50);
    expect(low.score).toBe(40);
  });

  it('news sentiment is matched exactly: "Bullish" is not "BULLISH" (the SQL upper-cased it)', () => {
    const exact = rate({ news_sentiment: 'BULLISH', news_impact_score: 9 });
    const other = rate({ news_sentiment: 'Bullish', news_impact_score: 9 });
    expect(exact.score! - other.score!).toBe(15);
  });

  it('extreme risk with a middling score is a Sell whatever the score says (the SQL had no veto)', () => {
    const verdict = rate({
      analysis: analysis({
        financial_risk: 9,
        overall_score: 7,
        base: 160,
        bear: 95,
      }),
      fundamentals: {
        consensus_rating: 'Buy',
        pe_ttm: null,
        revenue_ttm: 1000,
        fifty_two_week_high: null,
        fifty_two_week_low: null,
      },
    });
    // 50 + 24 - 2 - 20 + 10 + 5: a "Buy" by score
    expect(verdict.score).toBe(67);
    expect(verdict.rating).toBe('Sell');
  });

  it('each ticker has exactly one rating: Speculative Buy and No Brainer are not also Strong Buy', () => {
    expect(
      rate({ analysis: analysis({ financial_risk: 8, base: 200, bear: 60 }) })
        .rating,
    ).toBe('Speculative Buy');
  });
});

describe('ratingFilterValue', () => {
  it.each([
    ['Strong Buy', 'Strong Buy'],
    ['Buy', 'Buy'],
    ['Hold', 'Hold'],
    ['Sell', 'Sell'],
    ['Speculative Buy', 'Speculative Buy'],
    ['No Brainer', 'No Brainer'],
    ['Legendary', 'No Brainer'],
  ])('%s selects %s', (value, rating) => {
    expect(ratingFilterValue(value)).toBe(rating);
  });

  it.each(['', 'strong buy', 'Strong', "Sell' OR 1=1 --", 'null'])(
    'an unknown value (%j) selects nothing',
    (value) => {
      expect(ratingFilterValue(value)).toBeNull();
    },
  );
});

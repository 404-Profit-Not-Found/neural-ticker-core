import { BadRequestException } from '@nestjs/common';
import { NumericIdPipe } from './numeric-id.pipe';

describe('NumericIdPipe', () => {
  const pipe = new NumericIdPipe();

  it.each(['1', '42', '000123', '999999999999999999'])(
    'passes a numeric id through unchanged, as a string (%s)',
    (id) => {
      expect(pipe.transform(id)).toBe(id);
    },
  );

  it.each([
    ['letters', 'abc'],
    ['a UUID', '3f9a1c2e-0000-4000-8000-000000000001'],
    ['a decimal', '1.5'],
    ['a negative number', '-1'],
    ['an exponent', '1e3'],
    ['hex', '0x10'],
    ['whitespace', ' 12 '],
    ['empty', ''],
    ['SQL', '1; DROP TABLE research_notes'],
    // 19+ digits can exceed bigint → "out of range" from Postgres (a 500).
    ['more digits than always fit a bigint', '9999999999999999999'],
    ['a non-string', 12 as any],
    ['undefined', undefined],
  ])('answers %s with 400 instead of letting it reach Postgres', (_l, id) => {
    expect(() => pipe.transform(id)).toThrow(BadRequestException);
  });
});

import { ColumnNumericTransformer } from './column-numeric.transformer';

describe('ColumnNumericTransformer', () => {
  let transformer: ColumnNumericTransformer;

  beforeEach(() => {
    transformer = new ColumnNumericTransformer();
  });

  describe('to', () => {
    it('should return the number map as-is', () => {
      expect(transformer.to(10.5)).toBe(10.5);
      expect(transformer.to(null)).toBeNull();
    });
  });

  describe('from', () => {
    it('should convert string to number', () => {
      expect(transformer.from('10.5')).toBe(10.5);
      expect(transformer.from('0')).toBe(0);
      expect(transformer.from('-123.456')).toBe(-123.456);
    });

    it('should return null for null input', () => {
      expect(transformer.from(null)).toBeNull();
    });

    it('should return null for invalid string', () => {
      // In strict TypeORM usage, this might not happen with numeric columns, but safe to test
      expect(transformer.from('abc')).toBeNull();
    });
  });
});

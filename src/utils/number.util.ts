export class NumberUtil {
  /**
   * Parses a market cap string or number into a raw numeric value.
   * Handles suffixes like B, M, T, K.
   * Examples:
   * - "2.5B" -> 2,500,000,000
   * - "500M" -> 500,000,000
   * - 1000 -> 1000
   */
  static parseMarketCap(
    value: string | number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'number') {
      return isNaN(value) ? null : value; // Ensure not NaN
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toUpperCase();
      if (!normalized) return null;

      // Extract numeric part and suffix
      const match = normalized.match(/^([\d.,]+)\s*([BMTK])?$/);
      if (!match) {
        // Try parsing just as a number (e.g. "2500000")
        const raw = parseFloat(normalized.replace(/,/g, ''));
        return isNaN(raw) ? null : raw;
      }

      let num = parseFloat(match[1].replace(/,/g, ''));
      if (isNaN(num)) return null;

      const suffix = match[2];
      switch (suffix) {
        case 'T': // Trillion
          num *= 1_000_000_000_000;
          break;
        case 'B': // Billion
          num *= 1_000_000_000;
          break;
        case 'M': // Million
          num *= 1_000_000;
          break;
        case 'K': // Thousand
          num *= 1_000;
          break;
      }
      return num;
    }

    return null;
  }
}

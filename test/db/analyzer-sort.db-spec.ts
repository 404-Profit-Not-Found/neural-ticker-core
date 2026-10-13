import { DataSource } from 'typeorm';
import { MarketDataService } from '../../src/modules/market-data/market-data.service';
import { describeDb, ensureMigrated, truncateAll } from './support/test-db';
import { createMarketDataService, seedTicker } from './support/market-fixtures';

/**
 * Sorting the analyzer on PostgreSQL. `ORDER BY x DESC` puts NULLs FIRST by
 * default, so "highest upside / risk / score first" used to open with the
 * tickers that have no analysis at all.
 */
describeDb('analyzer sort order (real PostgreSQL)', () => {
  let service: MarketDataService;
  let ds: DataSource;
  let close: () => Promise<void>;

  beforeAll(async () => {
    await ensureMigrated();
    ({ service, ds, close } = await createMarketDataService());
    await truncateAll(ds);

    // Analysed tickers with distinct values in every sortable column…
    await seedTicker(ds, {
      symbol: 'AAA',
      price: { close: 100, prevClose: 80 }, // +25 %
      fundamentals: { market_cap: 300, pe_ttm: 30, consensus_rating: 'Buy' },
      risk: { financial_risk: 2, overall_score: 9, base: 150, bear: 90 }, // +50 / -10
    });
    await seedTicker(ds, {
      symbol: 'BBB',
      price: { close: 100, prevClose: 100 }, // 0 %
      fundamentals: { market_cap: 200, pe_ttm: 20, consensus_rating: 'Hold' },
      risk: { financial_risk: 5, overall_score: 6, base: 120, bear: 70 }, // +20 / -30
    });
    await seedTicker(ds, {
      symbol: 'CCC',
      price: { close: 100, prevClose: 125 }, // -20 %
      fundamentals: { market_cap: 100, pe_ttm: 10, consensus_rating: 'Sell' },
      risk: { financial_risk: 9, overall_score: 3, base: 90, bear: 40 }, // -10 / -60
    });
    // …and the ones the bug put on top: priced but never analysed, no
    // fundamentals; and one with nothing at all.
    await seedTicker(ds, {
      symbol: 'NOAI',
      price: { close: 50, prevClose: 50 },
    });
    await seedTicker(ds, { symbol: 'ZNEW' });
    await seedTicker(ds, { symbol: 'NADA' });
  });

  afterAll(async () => {
    await close?.();
  });

  const order = async (
    sortBy: string,
    sortDir: 'ASC' | 'DESC',
  ): Promise<string[]> => {
    const page = await service.getAnalyzerTickers({ sortBy, sortDir });
    return page.items.map((item: any) => item.ticker.symbol);
  };

  // [sortBy, tickers WITH a value in ascending order, tickers without one]
  const CASES: [string, string[], string[]][] = [
    ['upside_percent', ['CCC', 'BBB', 'AAA'], ['NADA', 'NOAI', 'ZNEW']],
    ['downside_percent', ['CCC', 'BBB', 'AAA'], ['NADA', 'NOAI', 'ZNEW']],
    ['financial_risk', ['AAA', 'BBB', 'CCC'], ['NADA', 'NOAI', 'ZNEW']],
    ['overall_score', ['CCC', 'BBB', 'AAA'], ['NADA', 'NOAI', 'ZNEW']],
    ['ai_rating', ['CCC', 'BBB', 'AAA'], ['NADA', 'NOAI', 'ZNEW']],
    ['market_cap', ['CCC', 'BBB', 'AAA'], ['NADA', 'NOAI', 'ZNEW']],
    ['pe_ttm', ['CCC', 'BBB', 'AAA'], ['NADA', 'NOAI', 'ZNEW']],
    ['consensus', ['AAA', 'BBB', 'CCC'], ['NADA', 'NOAI', 'ZNEW']],
    // NOAI has a price (0 % change, tied with BBB → by symbol); the other two have none.
    ['change', ['CCC', 'BBB', 'NOAI', 'AAA'], ['NADA', 'ZNEW']],
    ['close', ['NOAI', 'AAA', 'BBB', 'CCC'], ['NADA', 'ZNEW']],
  ];

  describe.each(CASES)('sortBy=%s', (sortBy, ascending, withoutValue) => {
    it('ASC: values ascending, then the rows without a value (by symbol)', async () => {
      expect(await order(sortBy, 'ASC')).toEqual([
        ...ascending,
        ...withoutValue,
      ]);
    });

    it('DESC: values descending, and STILL the rows without a value last', async () => {
      const descending = [...ascending].reverse();
      const result = await order(sortBy, 'DESC');

      expect(result.slice(-withoutValue.length)).toEqual(withoutValue);
      expect([...result.slice(0, descending.length)].sort()).toEqual(
        [...descending].sort(),
      );
      // Ties keep the stable secondary order (symbol ASC) in both directions.
      const tieFree = !['change', 'close'].includes(sortBy);
      if (tieFree)
        expect(result.slice(0, descending.length)).toEqual(descending);
    });
  });

  it('paging through a sort never repeats or drops a row (stable secondary order)', async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const result = await service.getAnalyzerTickers({
        sortBy: 'upside_percent',
        sortDir: 'DESC',
        page,
        limit: 2,
      });
      expect(result.meta.total).toBe(6);
      seen.push(...result.items.map((item: any) => item.ticker.symbol));
    }
    expect(seen).toEqual(['AAA', 'BBB', 'CCC', 'NADA', 'NOAI', 'ZNEW']);
  });

  it('the same request twice returns the same order', async () => {
    const first = await order('ai_rating', 'DESC');
    expect(await order('ai_rating', 'DESC')).toEqual(first);
  });
});

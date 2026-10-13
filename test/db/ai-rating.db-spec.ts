import { DataSource } from 'typeorm';
import { MarketDataService } from '../../src/modules/market-data/market-data.service';
import { TickerEntity } from '../../src/modules/tickers/entities/ticker.entity';
import {
  AI_RATINGS,
  VERDICT_SQL,
  Verdict,
  tickerVerdict,
} from '../../src/lib/ticker-verdict';
import {
  RatingCase,
  boundaryCases,
  randomCases,
  toVerdictRow,
} from '../support/rating-cases';
import { describeDb, ensureMigrated, truncateAll } from './support/test-db';
import {
  createMarketDataService,
  seedRatingCases,
} from './support/market-fixtures';

/**
 * The AI rating is computed twice: in TypeScript (the clients' maths, ported
 * in src/lib/ticker-verdict.ts) and in SQL (VERDICT_SQL — what the analyzer
 * filters, sorts and counts by). This proves, on a real PostgreSQL and for
 * several hundred tickers covering the whole input space, that they are the
 * same function: the same score to the last bit, the same rating, and filters
 * that return exactly the tickers TypeScript gives each rating.
 */
describeDb('AI rating: SQL == TypeScript (real PostgreSQL)', () => {
  const RANDOM = 420;
  const cases: RatingCase[] = [...boundaryCases(), ...randomCases(RANDOM, 7)];
  const expected: Verdict[] = cases.map((c) => tickerVerdict(toVerdictRow(c)));

  let service: MarketDataService;
  let ds: DataSource;
  let close: () => Promise<void>;
  let symbols: string[];
  /** symbol → what TypeScript says about it */
  const bySymbol = new Map<string, Verdict>();

  beforeAll(async () => {
    await ensureMigrated();
    ({ service, ds, close } = await createMarketDataService());
    await truncateAll(ds);
    symbols = await seedRatingCases(ds, cases);
    symbols.forEach((symbol, i) => bySymbol.set(symbol, expected[i]));
  }, 120000);

  afterAll(async () => {
    await close?.();
  });

  const symbolsRatedByTs = (...ratings: string[]): string[] =>
    symbols.filter((s) => ratings.includes(bySymbol.get(s)!.rating as string));

  /** Every page of an analyzer request, as symbols. */
  const analyzerSymbols = async (
    options: Record<string, unknown>,
  ): Promise<{ symbols: string[]; items: any[]; total: number }> => {
    const items: any[] = [];
    let total = 0;
    for (let page = 1; ; page++) {
      const result = await service.getAnalyzerTickers({
        sortBy: 'symbol',
        sortDir: 'ASC',
        limit: 100,
        page,
        ...options,
      } as any);
      total = result.meta.total;
      items.push(...result.items);
      if (page >= result.meta.totalPages) break;
    }
    return { symbols: items.map((i) => i.ticker.symbol), items, total };
  };

  it('the test set is what it claims to be', () => {
    expect(cases.length).toBeGreaterThanOrEqual(500);
    const count = (rating: string | null) =>
      expected.filter((v) => v.rating === rating).length;
    for (const rating of AI_RATINGS) expect(count(rating)).toBeGreaterThan(3);
    // never analysed
    expect(count(null)).toBeGreaterThan(20);
    // price above the 52-week high / below the low, no price, zero revenue…
    expect(
      cases.filter(
        (c) =>
          c.close &&
          c.fundamentals?.fifty_two_week_high &&
          c.close > c.fundamentals.fifty_two_week_high,
      ).length,
    ).toBeGreaterThan(20);
    expect(
      cases.filter(
        (c) =>
          c.close &&
          c.fundamentals?.fifty_two_week_low &&
          c.close < c.fundamentals.fifty_two_week_low,
      ).length,
    ).toBeGreaterThan(20);
    expect(cases.filter((c) => !c.close).length).toBeGreaterThan(10);
    expect(
      cases.filter((c) => c.analysis && c.analysis.bear === null).length,
    ).toBeGreaterThan(60);
    expect(
      cases.filter((c) => c.analysis && c.analysis.base === null).length,
    ).toBeGreaterThan(40);
  });

  it('for EVERY ticker the SQL score, rating, upside and downside equal the TypeScript ones — exactly, not approximately', async () => {
    const qb = ds.getRepository(TickerEntity).createQueryBuilder('ticker');
    (MarketDataService as any).joinVerdictInputs(qb);
    const rows: any[] = await qb
      .select('ticker.symbol', 'symbol')
      .addSelect(VERDICT_SQL.score, 'score')
      .addSelect(VERDICT_SQL.rating, 'rating')
      .addSelect(VERDICT_SQL.upside, 'upside')
      .addSelect(VERDICT_SQL.downside, 'downside')
      .orderBy('ticker.symbol', 'ASC')
      .getRawMany();

    expect(rows).toHaveLength(cases.length);

    const mismatches = rows
      .map((row, i) => {
        const ts = bySymbol.get(row.symbol)!;
        const sql = {
          score: row.score === null ? null : Number(row.score),
          rating: row.rating,
          upside: row.upside === null ? null : Number(row.upside),
          downside: row.downside === null ? null : Number(row.downside),
        };
        const want = {
          score: ts.score,
          rating: ts.rating,
          upside: ts.upside,
          downside: ts.downside,
        };
        return Object.is(JSON.stringify(sql), JSON.stringify(want))
          ? null
          : { symbol: row.symbol, case: cases[i].name, sql, ts: want };
      })
      .filter(Boolean);

    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });

  describe.each([...AI_RATINGS])('aiRating=%s', (rating) => {
    it('returns exactly the tickers TypeScript gives that rating, and says so on each', async () => {
      const result = await analyzerSymbols({ aiRating: [rating] });

      expect(result.symbols).toEqual(symbolsRatedByTs(rating));
      expect(result.total).toBe(result.symbols.length);
      for (const item of result.items) {
        expect(item.aiAnalysis.rating).toBe(rating);
        expect(item.aiAnalysis.rating_score).toBe(
          bySymbol.get(item.ticker.symbol)!.score,
        );
      }
    });
  });

  it('aiRating=Legendary is the old name of "No Brainer"', async () => {
    const result = await analyzerSymbols({ aiRating: ['Legendary'] });
    expect(result.symbols).toEqual(symbolsRatedByTs('No Brainer'));
  });

  it('several ratings select their union; every rating together = every analysed ticker', async () => {
    const two = await analyzerSymbols({ aiRating: ['Strong Buy', 'Sell'] });
    expect(two.symbols).toEqual(symbolsRatedByTs('Strong Buy', 'Sell'));

    const all = await analyzerSymbols({ aiRating: [...AI_RATINGS] });
    expect(all.symbols).toEqual(
      symbols.filter((s) => bySymbol.get(s)!.rating !== null),
    );
  });

  it('a ticker without an analysis matches no rating filter and carries no rating', async () => {
    const unrated = symbols.filter((s) => bySymbol.get(s)!.rating === null);
    const everything = await analyzerSymbols({});

    expect(everything.symbols).toEqual(symbols);
    for (const item of everything.items) {
      const ts = bySymbol.get(item.ticker.symbol)!;
      if (ts.rating === null) expect(item.aiAnalysis).toBeNull();
      else {
        expect(item.aiAnalysis.rating).toBe(ts.rating);
        expect(item.aiAnalysis.rating_score).toBe(ts.score);
      }
    }
    for (const rating of AI_RATINGS) {
      const hit = await analyzerSymbols({ aiRating: [rating] });
      expect(hit.symbols.filter((s) => unrated.includes(s))).toEqual([]);
    }
  });

  it('an unknown rating value selects nothing (and is never interpolated into the SQL)', async () => {
    for (const value of ['Strong', 'strong buy', "Sell' OR '1'='1"]) {
      const result = await analyzerSymbols({ aiRating: [value] });
      expect(result.symbols).toEqual([]);
    }
    const mixed = await analyzerSymbols({ aiRating: ['nonsense', 'Hold'] });
    expect(mixed.symbols).toEqual(symbolsRatedByTs('Hold'));
  });

  it('the rating filter combines with the other filters and with paging', async () => {
    const highRiskSells = await analyzerSymbols({
      aiRating: ['Sell'],
      risk: ['High'],
    });
    expect(highRiskSells.symbols).toEqual(
      symbolsRatedByTs('Sell').filter(
        (s) => cases[symbols.indexOf(s)].analysis!.financial_risk > 6.5,
      ),
    );

    // Paged 7 at a time: the same list, no repeats, no gaps.
    const holds = symbolsRatedByTs('Hold');
    const paged: string[] = [];
    for (let page = 1; paged.length < holds.length; page++) {
      const result = await service.getAnalyzerTickers({
        aiRating: ['Hold'],
        sortBy: 'symbol',
        sortDir: 'ASC',
        limit: 7,
        page,
      } as any);
      expect(result.meta.total).toBe(holds.length);
      paged.push(...result.items.map((i: any) => i.ticker.symbol));
    }
    expect(paged).toEqual(holds);
  });

  it('the upside filter uses the upside the clients show (stored upside when there is no base target)', async () => {
    const result = await analyzerSymbols({ upside: '> 50%' });
    expect(result.symbols).toEqual(
      symbols.filter((s) => (bySymbol.get(s)!.upside ?? -Infinity) > 50),
    );
  });

  it.each(['ASC', 'DESC'] as const)(
    'sortBy=ai_rating %s orders by the verdict score, un-analysed tickers last',
    async (sortDir) => {
      const { symbols: ordered } = await analyzerSymbols({
        sortBy: 'ai_rating',
        sortDir,
      });
      const score = (s: string) => bySymbol.get(s)!.score;
      const want = [...symbols].sort((a, b) => {
        const [x, y] = [score(a), score(b)];
        if (x === null || y === null) {
          return x === y ? a.localeCompare(b) : x === null ? 1 : -1;
        }
        return (sortDir === 'ASC' ? x - y : y - x) || a.localeCompare(b);
      });
      expect(ordered).toEqual(want);
    },
  );

  it.each([
    ['upside_percent', 'upside'],
    ['downside_percent', 'downside'],
  ] as const)(
    'sortBy=%s DESC orders by the value the clients show, rows without it last',
    async (sortBy, field) => {
      const { symbols: ordered } = await analyzerSymbols({
        sortBy,
        sortDir: 'DESC',
      });
      const value = (s: string) => bySymbol.get(s)![field];
      const want = [...symbols].sort((a, b) => {
        const [x, y] = [value(a), value(b)];
        if (x === null || y === null) {
          return x === y ? a.localeCompare(b) : x === null ? 1 : -1;
        }
        return y - x || a.localeCompare(b);
      });
      expect(ordered).toEqual(want);
    },
  );

  it('the dashboard counters are the analyzer lists they link to', async () => {
    const strongBuy = await service.getStrongBuyCount();
    const sell = await service.getSellCount();

    expect(strongBuy.symbols).toEqual(symbolsRatedByTs('Strong Buy'));
    expect(strongBuy.count).toBe(strongBuy.symbols.length);
    expect(sell.symbols).toEqual(symbolsRatedByTs('Sell'));
    expect(sell.count).toBe(sell.symbols.length);

    expect(
      (await analyzerSymbols({ aiRating: ['Strong Buy'] })).symbols,
    ).toEqual(strongBuy.symbols);
    expect((await analyzerSymbols({ aiRating: ['Sell'] })).symbols).toEqual(
      sell.symbols,
    );
  });

  it('a hidden ticker is in neither the counters nor the lists', async () => {
    const victim = symbolsRatedByTs('Sell')[0];
    await ds.query('UPDATE tickers SET is_hidden = true WHERE symbol = $1', [
      victim,
    ]);
    try {
      expect((await service.getSellCount()).symbols).not.toContain(victim);
      expect(
        (await analyzerSymbols({ aiRating: ['Sell'] })).symbols,
      ).not.toContain(victim);
    } finally {
      await ds.query('UPDATE tickers SET is_hidden = false WHERE symbol = $1', [
        victim,
      ]);
    }
  });

  // The clients derive upside / downside from aiAnalysis.base_price and
  // bear_price: the analyzer reads them through SQL joins, the snapshots from
  // the analysis' loaded scenarios. They must be the same two numbers.
  it('snapshots and analyzer return the same scenario targets (base_price / bear_price) for every sampled ticker', async () => {
    const sample = symbols.filter((_, i) => i % 5 === 0);
    const fromAnalyzer = new Map<string, any>();
    for (const item of (await analyzerSymbols({})).items) {
      fromAnalyzer.set(item.ticker.symbol, item.aiAnalysis);
    }
    const snapshots: any[] = [];
    for (let i = 0; i < sample.length; i += 100) {
      snapshots.push(...(await service.getSnapshots(sample.slice(i, i + 100))));
    }

    let analysed = 0;
    for (const snapshot of snapshots) {
      const symbol = snapshot.ticker.symbol;
      const analyzer = fromAnalyzer.get(symbol);
      const c = cases[symbols.indexOf(symbol)];
      if (!c.analysis) {
        expect(snapshot.aiAnalysis).toBeNull();
        expect(analyzer).toBeNull();
        continue;
      }
      analysed++;
      expect({
        base_price: snapshot.aiAnalysis.base_price,
        bear_price: snapshot.aiAnalysis.bear_price,
      }).toEqual({
        base_price: analyzer.base_price,
        bear_price: analyzer.bear_price,
      });
      // …and they are the stored targets: a number, 0 included, or null.
      expect(snapshot.aiAnalysis.base_price).toBe(c.analysis.base);
      expect(snapshot.aiAnalysis.bear_price).toBe(c.analysis.bear);
    }
    expect(analysed).toBeGreaterThan(90);
  });

  it('the snapshots return the same rating and score as the analyzer, for analysed and un-analysed tickers alike', async () => {
    // every 6th ticker: ~90 snapshots through the bulk (database-only) path
    const sample = symbols.filter((_, i) => i % 6 === 0);
    const snapshots: any[] = [];
    for (let i = 0; i < sample.length; i += 100) {
      snapshots.push(...(await service.getSnapshots(sample.slice(i, i + 100))));
    }

    expect(snapshots).toHaveLength(sample.length);
    for (const snapshot of snapshots) {
      expect(snapshot.error).toBeUndefined();
      const ts = bySymbol.get(snapshot.ticker.symbol)!;
      if (ts.rating === null) {
        expect(snapshot.aiAnalysis).toBeNull();
      } else {
        expect(snapshot.aiAnalysis.rating).toBe(ts.rating);
        expect(snapshot.aiAnalysis.rating_score).toBe(ts.score);
      }
    }
  });
});

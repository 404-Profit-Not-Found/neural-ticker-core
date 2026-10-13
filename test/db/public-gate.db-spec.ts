import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MarketDataService } from '../../src/modules/market-data/market-data.service';
import { PriceOhlcv } from '../../src/modules/market-data/entities/price-ohlcv.entity';
import { TickerRequestEntity } from '../../src/modules/ticker-requests/entities/ticker-request.entity';
import { TickerEntity } from '../../src/modules/tickers/entities/ticker.entity';
import { TickerLogoEntity } from '../../src/modules/tickers/entities/ticker-logo.entity';
import { TickersService } from '../../src/modules/tickers/tickers.service';
import {
  ONE_LETTER_VENUE_SUFFIXES,
  isUsStyleSymbol,
  usStyleSymbolSql,
} from '../../src/modules/tickers/utils/exchange-currency.util';
import { describeDb, ensureMigrated, truncateAll } from './support/test-db';
import { createMarketDataService, seedTicker } from './support/market-fixtures';

/**
 * Symbols at the database boundary: the public-read gate's lookups with odd
 * symbols, and the SQL twin of `isUsStyleSymbol` behind the analyzer's region
 * filter.
 */
describeDb(
  'symbols: public-read gate and region filter (real PostgreSQL)',
  () => {
    let ds: DataSource;
    let marketData: MarketDataService;
    let close: () => Promise<void>;
    let tickers: TickersService;
    let queries: string[];

    // Symbols a database may hold that the strict creation pattern would refuse.
    const TRACKED = [
      'AAPL',
      'BRK.B',
      'RELIANCE.NS', // 11 characters
      '^GSPC',
      'BTC-USD',
      'EURUSD=X',
      'M&M.NS',
      "O'REILLY",
      'A%', // LIKE wildcards must be literals
      'A_B',
      'X'.repeat(32),
    ];

    beforeAll(async () => {
      await ensureMigrated();
      ({ service: marketData, ds, close } = await createMarketDataService());
      tickers = new TickersService(
        ds.getRepository(TickerEntity),
        ds.getRepository(TickerLogoEntity),
        ds.getRepository(PriceOhlcv),
        ds.getRepository(TickerRequestEntity),
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { get: () => undefined } as any,
      );
      await truncateAll(ds);
      for (const symbol of TRACKED) {
        await ds.query(
          `INSERT INTO tickers (symbol, name, exchange, currency, country) VALUES ($1, $1, 'NASDAQ', 'USD', 'US')`,
          [symbol],
        );
      }
      // Count the statements the gate sends.
      const original = ds.driver.createQueryRunner.bind(ds.driver);
      jest
        .spyOn(ds.driver, 'createQueryRunner')
        .mockImplementation((mode: any) => {
          const runner = original(mode);
          const run = runner.query.bind(runner);
          runner.query = ((sql: string, ...rest: any[]) => {
            if (/FROM "tickers"/.test(sql)) queries.push(sql);
            return (run as any)(sql, ...rest);
          }) as any;
          return runner;
        });
    });
    afterAll(async () => {
      jest.restoreAllMocks();
      await close?.();
    });
    beforeEach(() => {
      queries = [];
    });

    describe('assertPublicReadAllowed', () => {
      it.each(TRACKED)(
        'a tracked ticker (%s) is served to anonymous and signed-in callers alike',
        async (symbol) => {
          await expect(
            tickers.assertPublicReadAllowed(symbol, false),
          ).resolves.toBeUndefined();
          await expect(
            tickers.assertPublicReadAllowed(symbol, true),
          ).resolves.toBeUndefined();
        },
      );

      it('matches exactly: case and surrounding spaces are normalised, nothing else is', async () => {
        await expect(
          tickers.assertPublicReadAllowed('  aapl ', false),
        ).resolves.toBeUndefined();
        await expect(
          tickers.assertPublicReadAllowed('brk.b', false),
        ).resolves.toBeUndefined();
        // "A%" is tracked; it must not make every A… symbol "tracked"
        await expect(
          tickers.assertPublicReadAllowed('AAPX', false),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          tickers.assertPublicReadAllowed('AXB', false),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          tickers.assertPublicReadAllowed('AAP', false),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it.each([
        ["' OR '1'='1", BadRequestException],
        ["AAPL'; DROP TABLE tickers;--", BadRequestException],
        ['AAPL%', BadRequestException],
        ['\\', BadRequestException],
        ['NUL\u0000X', BadRequestException],
        ['ÄÖÜ', BadRequestException],
        ['NVDA', NotFoundException],
      ])(
        'an untracked %j from an anonymous caller is refused (%p), as data — never as SQL',
        async (symbol, error) => {
          await expect(
            tickers.assertPublicReadAllowed(symbol, false),
          ).rejects.toBeInstanceOf(error);
          const [{ n }] = await ds.query(
            `SELECT count(*)::int AS n FROM tickers`,
          );
          expect(n).toBe(TRACKED.length);
        },
      );

      it('does ONE indexed lookup, and none at all for something that cannot be a symbol', async () => {
        await tickers.assertPublicReadAllowed('AAPL', false);
        expect(queries).toHaveLength(1);
        expect(queries[0]).toContain('WHERE');
        expect(queries[0]).toContain('$1');

        queries = [];
        await expect(
          tickers.assertPublicReadAllowed('Y'.repeat(33), false),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
          tickers.assertPublicReadAllowed('   ', false),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(queries).toHaveLength(0);

        const [plan] = await ds.query(
          `EXPLAIN (FORMAT JSON) SELECT 1 FROM tickers WHERE symbol = 'AAPL'`,
        );
        expect(JSON.stringify(plan)).toContain('UQ_');
      });
    });

    describe('partitionPublicRead (a list of symbols)', () => {
      it('splits a mixed list with one query; duplicates collapse; odd tracked symbols are readable', async () => {
        const result = await tickers.partitionPublicRead(
          [
            'aapl',
            'AAPL',
            ' brk.b ',
            '^GSPC',
            "O'REILLY",
            'A%',
            'NVDA',
            'A_B',
            'AXB',
            'not a symbol!',
            'Z'.repeat(40),
            '',
          ],
          false,
        );

        expect(result.readable).toEqual([
          'AAPL',
          'BRK.B',
          '^GSPC',
          "O'REILLY",
          'A%',
          'A_B',
        ]);
        expect(result.refused).toEqual([
          { symbol: 'NVDA', error: 'Ticker NVDA not found' },
          { symbol: 'AXB', error: 'Ticker AXB not found' },
          { symbol: 'NOT A SYMBOL!', error: 'Invalid ticker symbol format' },
          { symbol: 'Z'.repeat(40), error: 'Invalid ticker symbol format' },
        ]);
        expect(queries).toHaveLength(1);
      });

      it('a signed-in caller keeps untracked well-formed symbols', async () => {
        const result = await tickers.partitionPublicRead(
          ['AAPL', 'NVDA', 'bad symbol'],
          true,
        );
        expect(result.readable).toEqual(['AAPL', 'NVDA']);
        expect(result.refused).toEqual([
          { symbol: 'BAD SYMBOL', error: 'Invalid ticker symbol format' },
        ]);
      });

      it('100 symbols are still one query; an empty list is none', async () => {
        const many = Array.from({ length: 100 }, (_, i) => `S${i}`);
        const result = await tickers.partitionPublicRead(
          [...many, 'AAPL'],
          false,
        );
        expect(result.readable).toEqual(['AAPL']);
        expect(result.refused).toHaveLength(100);
        expect(queries).toHaveLength(1);

        queries = [];
        expect(await tickers.partitionPublicRead([], false)).toEqual({
          readable: [],
          refused: [],
        });
        expect(
          await tickers.partitionPublicRead(['   ', 'Q'.repeat(50)], false),
        ).toMatchObject({ readable: [] });
        expect(queries).toHaveLength(0);
      });
    });

    describe('region filter: the SQL twin of isUsStyleSymbol', () => {
      const SYMBOLS = [
        // bare
        'AAPL',
        'RDS-A',
        'BTC-USD',
        '^GSPC',
        'EURUSD=X',
        // US share classes
        'BRK.A',
        'BRK.B',
        'BF.B',
        'brk.b',
        'HEI.A',
        // one-letter venues
        'VOD.L',
        'BMW.F',
        '7203.T',
        'ABC.V',
        'vod.l',
        // multi-letter venues, known and unknown
        'SAP.DE',
        'VOLV-B.ST',
        'SHOP.TO',
        'BBCA.JK',
        'RELIANCE.NS',
        '0700.HK',
        'M&M.NS',
        // odd endings
        'ABC.',
        'ABC.1',
        'ABC.B2',
        'A.B.C',
        'A.B.DE',
        '.B',
        'X.L.B',
      ];

      it('knows which one-letter endings are venues', () => {
        expect([...ONE_LETTER_VENUE_SUFFIXES].sort()).toEqual([
          'F',
          'L',
          'T',
          'V',
        ]);
      });

      it('agrees with isUsStyleSymbol for every symbol', async () => {
        const rows: { symbol: string; us: boolean }[] = await ds
          .createQueryBuilder()
          .select('s.symbol', 'symbol')
          .addSelect(usStyleSymbolSql('s.symbol'), 'us')
          .from(`(SELECT unnest(:symbols::text[]) AS symbol)`, 's')
          .setParameters({
            symbols: SYMBOLS,
            oneLetterVenues: ONE_LETTER_VENUE_SUFFIXES,
          })
          .getRawMany();

        expect(rows).toHaveLength(SYMBOLS.length);
        const sql = Object.fromEntries(rows.map((r) => [r.symbol, r.us]));
        const ts = Object.fromEntries(
          SYMBOLS.map((s) => [s, isUsStyleSymbol(s)]),
        );
        expect(sql).toEqual(ts);
        // …and it is not vacuous
        expect(ts['BRK.B']).toBe(true);
        expect(ts['VOD.L']).toBe(false);
        expect(ts['SAP.DE']).toBe(false);
        expect(ts['BBCA.JK']).toBe(false);
      });

      it('the analyzer: US now includes US share classes; EU is unchanged; nothing is in both', async () => {
        await truncateAll(ds);
        const universe: [string, string][] = [
          ['AAPL', 'NASDAQ'],
          ['BRK.B', 'NYSE'],
          ['BF.B', 'NYSE'],
          ['SAP.DE', 'XETRA'],
          ['VOD.L', 'LSE'],
          ['ASML.AS', 'AS'],
          ['7203.T', 'TSE'],
          ['SHOP.TO', 'TSX'],
          ['BARE', 'LSE'], // bare symbol on an EU exchange code
        ];
        for (const [symbol, exchange] of universe)
          await seedTicker(ds, { symbol, exchange });
        const region = async (r: string[]) =>
          (
            await marketData.getAnalyzerTickers({
              region: r,
              sortBy: 'symbol',
              sortDir: 'ASC',
            } as any)
          ).items
            .map((i: any) => i.ticker.symbol)
            .sort();

        const us = await region(['US']);
        const eu = await region(['EU']);

        expect(us).toEqual(['AAPL', 'BF.B', 'BRK.B']);
        expect(eu).toEqual(['ASML.AS', 'BARE', 'SAP.DE', 'VOD.L']);
        expect(us.filter((s: string) => eu.includes(s))).toEqual([]);
        expect(await region(['US', 'EU'])).toEqual([...us, ...eu].sort());
        // neither region: Tokyo, Toronto
        expect((await region([])).length).toBe(universe.length);
      });
    });
  },
);

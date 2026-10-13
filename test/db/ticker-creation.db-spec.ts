import { DataSource } from 'typeorm';
import { runWithActor } from '../../src/common/request-actor/request-actor';
import { JobsService } from '../../src/modules/jobs/jobs.service';
import {
  RequestQueue,
  RequestStatus,
  RequestType,
} from '../../src/modules/jobs/entities/request-queue.entity';
import { PriceOhlcv } from '../../src/modules/market-data/entities/price-ohlcv.entity';
import { ResearchNote } from '../../src/modules/research/entities/research-note.entity';
import { ResearchService } from '../../src/modules/research/research.service';
import { TickerRequestEntity } from '../../src/modules/ticker-requests/entities/ticker-request.entity';
import { TickerEntity } from '../../src/modules/tickers/entities/ticker.entity';
import { TickerLogoEntity } from '../../src/modules/tickers/entities/ticker-logo.entity';
import {
  TickerCreationCapException,
  TickersService,
} from '../../src/modules/tickers/tickers.service';
import {
  describeDb,
  ensureMigrated,
  openDataSource,
  truncateAll,
} from './support/test-db';

/**
 * New tickers on a real PostgreSQL: who created them, the per-user daily cap
 * under real concurrency (advisory lock + recount in one transaction), the
 * race for the same symbol, the idempotent ADD_TICKER queue and the
 * once-per-ticker claim of the initial research.
 */
describeDb('ticker creation (real PostgreSQL)', () => {
  let ds: DataSource;
  let tickers: TickersService;
  let limit: number | undefined;

  const pause = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  // The data providers know every symbol; the answer takes a moment, like a
  // network call, so parallel requests really overlap.
  const finnhub = {
    getCompanyProfile: jest.fn(async (symbol: string) => {
      await pause(15);
      return { name: `${symbol} Corp`, exchange: 'NASDAQ', currency: 'USD' };
    }),
  };
  const jobs = {
    initializeTicker: jest.fn(),
    queueRequest: jest.fn(),
  };

  const users: Record<string, string> = {};
  const as = <T>(user: string, role: string, fn: () => Promise<T>) =>
    runWithActor({ userId: users[user], role }, fn);
  const settle = async (work: Promise<unknown>[]) => {
    const results = await Promise.allSettled(work);
    return {
      created: results.filter((r) => r.status === 'fulfilled').length,
      refused: results.filter(
        (r) =>
          r.status === 'rejected' &&
          r.reason instanceof TickerCreationCapException,
      ).length,
      other: results
        .filter(
          (r) =>
            r.status === 'rejected' &&
            !(r.reason instanceof TickerCreationCapException),
        )
        .map((r: any) => String(r.reason?.message ?? r.reason)),
    };
  };
  const countTickers = async (where = 'true'): Promise<number> =>
    (await ds.query(`SELECT count(*)::int AS n FROM tickers WHERE ${where}`))[0]
      .n;

  beforeAll(async () => {
    await ensureMigrated();
    // A pool big enough for the parallel tests: each capped insert holds one
    // connection while it waits for the user's advisory lock.
    ds = await openDataSource({ extra: { max: 40 } } as any);
    tickers = new TickersService(
      ds.getRepository(TickerEntity),
      ds.getRepository(TickerLogoEntity),
      ds.getRepository(PriceOhlcv),
      ds.getRepository(TickerRequestEntity),
      finnhub as any,
      { getSummary: jest.fn(), getQuote: jest.fn() } as any,
      jobs as any,
      {} as any,
      {
        get: (key: string) =>
          key === 'tickers.createDailyLimit' ? limit : undefined,
      } as any,
    );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  beforeEach(async () => {
    await truncateAll(ds);
    jest.clearAllMocks();
    limit = undefined; // the default: 10
    for (const name of ['alice', 'bob', 'admin']) {
      const [{ id }] = await ds.query(
        `INSERT INTO users (email, nickname, role) VALUES ($1, $2, $3) RETURNING id`,
        [`${name}@example.test`, name, name === 'admin' ? 'admin' : 'user'],
      );
      users[name] = id;
    }
    await ds.query(
      `INSERT INTO tickers (symbol, name, exchange, currency, country) VALUES ('AAPL', 'Apple', 'NASDAQ', 'USD', 'US')`,
    );
  });

  describe('who created a ticker', () => {
    it('is stored — and never comes back from a read', async () => {
      const created = await as('alice', 'user', () =>
        tickers.ensureTicker('nvda'),
      );

      expect(created.symbol).toBe('NVDA');
      // (The entity object has the field, as every entity field; it is not
      // loaded — and what is undefined is not serialized.)
      expect(created.created_by_user_id).toBeUndefined();
      expect(JSON.stringify(created)).not.toContain('created_by');
      const [row] = await ds.query(
        `SELECT created_by_user_id FROM tickers WHERE symbol = 'NVDA'`,
      );
      expect(row.created_by_user_id).toBe(users.alice);

      // None of the ways a ticker row is read selects the column.
      for (const read of [
        await tickers.findOneBySymbol('NVDA'),
        await tickers.getTicker('NVDA'),
        await ds.getRepository(TickerEntity).findOneBy({ symbol: 'NVDA' }),
        (await ds.getRepository(TickerEntity).find())[0],
        await ds
          .getRepository(TickerEntity)
          .createQueryBuilder('ticker')
          .where('ticker.symbol = :s', { s: 'NVDA' })
          .getOne(),
      ]) {
        expect(read).toBeTruthy();
        expect(read!.created_by_user_id).toBeUndefined();
        expect(JSON.stringify(read)).not.toContain('created_by');
        expect(JSON.stringify(read)).not.toContain(users.alice);
      }
    });

    it('is NULL for system work, and the index only holds attributed rows', async () => {
      await tickers.ensureTicker('SYS1');
      const [row] = await ds.query(
        `SELECT created_by_user_id FROM tickers WHERE symbol = 'SYS1'`,
      );
      expect(row.created_by_user_id).toBeNull();
      const [index] = await ds.query(
        `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_tickers_created_by_user'`,
      );
      expect(index.indexdef).toContain('(created_by_user_id, created_at)');
      expect(index.indexdef).toContain(
        'WHERE (created_by_user_id IS NOT NULL)',
      );
    });
  });

  describe('per-user daily cap', () => {
    const create = (user: string, role: string, symbols: string[]) =>
      symbols.map((symbol) =>
        as(user, role, () => tickers.ensureTicker(symbol)),
      );
    const names = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${prefix}${i}`);

    it('the 11th new ticker in 24 hours is refused with a 429; nothing is created for it', async () => {
      for (const symbol of names('A', 10)) {
        await as('alice', 'user', () => tickers.ensureTicker(symbol));
      }
      finnhub.getCompanyProfile.mockClear();
      jobs.initializeTicker.mockClear();

      const error = await as('alice', 'user', () =>
        tickers.ensureTicker('ELEVENTH'),
      ).catch((e) => e);

      expect(error).toBeInstanceOf(TickerCreationCapException);
      expect(error.getStatus()).toBe(429);
      expect(error.getResponse().message).toContain(
        'limit of 10 new tickers per day',
      );
      expect(await countTickers(`symbol = 'ELEVENTH'`)).toBe(0);
      // refused before a single provider call
      expect(finnhub.getCompanyProfile).not.toHaveBeenCalled();
      expect(jobs.initializeTicker).not.toHaveBeenCalled();
    });

    it('tracked tickers are never affected — including the ones the user added', async () => {
      await Promise.all(create('alice', 'user', names('A', 10)));

      await expect(
        as('alice', 'user', () => tickers.ensureTicker('AAPL')),
      ).resolves.toMatchObject({ symbol: 'AAPL' });
      await expect(
        as('alice', 'user', () => tickers.ensureTicker('A3')),
      ).resolves.toMatchObject({ symbol: 'A3' });
    });

    it('is per user; admins and system work are not capped', async () => {
      await Promise.all(create('alice', 'user', names('A', 10)));

      await expect(
        as('bob', 'user', () => tickers.ensureTicker('BOB1')),
      ).resolves.toMatchObject({ symbol: 'BOB1' });
      const admin = await settle(create('admin', 'admin', names('ADM', 14)));
      expect(admin).toEqual({ created: 14, refused: 0, other: [] });
      await expect(tickers.ensureTicker('SYS1')).resolves.toMatchObject({
        symbol: 'SYS1',
      });
    });

    it('counts a rolling 24 hours: yesterday’s tickers free the allowance again', async () => {
      await Promise.all(create('alice', 'user', names('A', 10)));
      await expect(
        as('alice', 'user', () => tickers.ensureTicker('NOPE')),
      ).rejects.toBeInstanceOf(TickerCreationCapException);

      await ds.query(
        `UPDATE tickers SET created_at = now() - interval '25 hours'
          WHERE symbol IN ('A0', 'A1', 'A2')`,
      );

      const again = await settle(create('alice', 'user', names('B', 5)));
      expect(again).toEqual({ created: 3, refused: 2, other: [] });
    });

    it('TICKER_CREATE_DAILY_LIMIT changes it; 0 means "requests only"', async () => {
      limit = 2;
      expect(await settle(create('alice', 'user', names('A', 5)))).toEqual({
        created: 2,
        refused: 3,
        other: [],
      });

      limit = 0;
      await expect(
        as('bob', 'user', () => tickers.ensureTicker('BOB1')),
      ).rejects.toBeInstanceOf(TickerCreationCapException);
    });

    // The reason for the lock: without it every parallel request sees "9
    // created so far" and all of them insert.
    it('40 PARALLEL requests for 40 different symbols create exactly 10', async () => {
      const outcome = await settle(create('alice', 'user', names('P', 40)));

      expect(outcome).toEqual({ created: 10, refused: 30, other: [] });
      expect(await countTickers(`created_by_user_id = '${users.alice}'`)).toBe(
        10,
      );
      expect(jobs.initializeTicker).toHaveBeenCalledTimes(10);
    });

    it('…and two users in parallel each get their own 10', async () => {
      const [alice, bob] = await Promise.all([
        settle(create('alice', 'user', names('PA', 25))),
        settle(create('bob', 'user', names('PB', 25))),
      ]);

      expect(alice).toEqual({ created: 10, refused: 15, other: [] });
      expect(bob).toEqual({ created: 10, refused: 15, other: [] });
    });

    it('releases the lock when a request is refused or fails (no stuck user)', async () => {
      await Promise.all(create('alice', 'user', names('A', 10)));
      await settle(create('alice', 'user', names('X', 5)));

      const [{ held }] = await ds.query(
        `SELECT count(*)::int AS held FROM pg_locks WHERE locktype = 'advisory'`,
      );
      expect(held).toBe(0);
    });
  });

  describe('the same new symbol requested by several callers at once', () => {
    it('creates ONE row, initialises it ONCE, and every caller gets the ticker (no 500)', async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          as(i % 2 ? 'alice' : 'bob', 'user', () =>
            tickers.ensureTicker('RACE'),
          ),
        ),
      );

      expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
      const ids = new Set(results.map((r: any) => r.value.id));
      expect(ids.size).toBe(1);
      expect(await countTickers(`symbol = 'RACE'`)).toBe(1);
      expect(jobs.initializeTicker).toHaveBeenCalledTimes(1);
      expect(jobs.initializeTicker).toHaveBeenCalledWith('RACE');
      for (const r of results as any[]) {
        expect(JSON.stringify(r.value)).not.toContain('created_by');
      }
    });

    it('losing that race does not use up the loser’s allowance', async () => {
      limit = 1;
      await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          as('alice', 'user', () => tickers.ensureTicker('RACE')),
        ),
      );
      const [row] = await ds.query(
        `SELECT count(*)::int AS n FROM tickers WHERE created_by_user_id = $1`,
        [users.alice],
      );
      expect(row.n).toBe(1);
    });
  });

  describe('ADD_TICKER queue', () => {
    const makeJobs = (ensure: jest.Mock): JobsService =>
      new JobsService(
        {} as any,
        { ensureTicker: ensure } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        ds.getRepository(RequestQueue),
        {} as any,
        { get: () => undefined } as any,
        {} as any,
      );
    const queueRows = async (): Promise<any[]> =>
      ds.query(
        `SELECT id, status, attempts, payload FROM request_queue ORDER BY created_at`,
      );

    it('is idempotent per symbol: 20 parallel queueRequest calls leave ONE open row', async () => {
      const service = makeJobs(jest.fn());

      const rows = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          service.queueRequest(RequestType.ADD_TICKER, {
            symbol: i % 2 ? 'nvda' : 'NVDA',
          }),
        ),
      );

      expect(new Set(rows.map((r) => r.id)).size).toBe(1);
      const stored = await queueRows();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        status: 'PENDING',
        payload: { symbol: 'NVDA' },
      });
    });

    it('a different symbol gets its own row; a finished or failed one no longer blocks its symbol', async () => {
      const service = makeJobs(jest.fn());
      const first = await service.queueRequest(RequestType.ADD_TICKER, {
        symbol: 'NVDA',
      });
      await service.queueRequest(RequestType.ADD_TICKER, { symbol: 'AMD' });
      expect(await queueRows()).toHaveLength(2);

      for (const status of ['COMPLETED', 'FAILED']) {
        await ds.query(`UPDATE request_queue SET status = $1 WHERE id = $2`, [
          status,
          first.id,
        ]);
        const again = await service.queueRequest(RequestType.ADD_TICKER, {
          symbol: 'NVDA',
        });
        expect(again.id).not.toBe(first.id);
        await ds.query(`DELETE FROM request_queue WHERE id = $1`, [again.id]);
      }
    });

    it('a PROCESSING row blocks its symbol while fresh, not once it is stale (a crashed worker)', async () => {
      const service = makeJobs(jest.fn());
      const first = await service.queueRequest(RequestType.ADD_TICKER, {
        symbol: 'NVDA',
      });
      await ds.query(
        `UPDATE request_queue SET status = 'PROCESSING', updated_at = now() WHERE id = $1`,
        [first.id],
      );
      expect(
        (await service.queueRequest(RequestType.ADD_TICKER, { symbol: 'NVDA' }))
          .id,
      ).toBe(first.id);

      await ds.query(
        `UPDATE request_queue SET updated_at = now() - interval '31 minutes' WHERE id = $1`,
        [first.id],
      );
      expect(
        (await service.queueRequest(RequestType.ADD_TICKER, { symbol: 'NVDA' }))
          .id,
      ).not.toBe(first.id);
    });

    it('two workers running at once process each request exactly once', async () => {
      const ensure = jest.fn(async (_symbol: string) => {
        await pause(20);
        return {};
      });
      const a = makeJobs(ensure);
      const b = makeJobs(ensure);
      for (const symbol of ['NVDA', 'AMD', 'TSM', 'ASML']) {
        await a.queueRequest(RequestType.ADD_TICKER, { symbol });
      }

      await Promise.all([
        a.processPendingRequests(),
        b.processPendingRequests(),
      ]);

      expect(ensure).toHaveBeenCalledTimes(4);
      expect(ensure.mock.calls.map((c) => c[0]).sort()).toEqual([
        'AMD',
        'ASML',
        'NVDA',
        'TSM',
      ]);
      const stored = await queueRows();
      expect(stored.map((r) => r.status)).toEqual(
        Array(4).fill(RequestStatus.COMPLETED),
      );
    });

    it('a queued request is created on behalf of the user who caused it and counts against their cap', async () => {
      limit = 1;
      const service = makeJobs(
        jest.fn((symbol: string) => tickers.ensureTicker(symbol)),
      );
      await service.queueRequest(RequestType.ADD_TICKER, {
        symbol: 'Q1',
        requested_by: users.alice,
      });
      await service.queueRequest(RequestType.ADD_TICKER, {
        symbol: 'Q2',
        requested_by: users.alice,
      });
      await service.queueRequest(RequestType.ADD_TICKER, { symbol: 'Q3' }); // system / admin

      await service.processPendingRequests();

      const created = await ds.query(
        `SELECT symbol, created_by_user_id FROM tickers WHERE symbol LIKE 'Q%' ORDER BY symbol`,
      );
      expect(created).toEqual([
        { symbol: 'Q1', created_by_user_id: users.alice },
        { symbol: 'Q3', created_by_user_id: null },
      ]);
      const stored = await queueRows();
      expect(
        stored.map((r) => [r.payload.symbol, r.status, r.attempts]),
      ).toEqual([
        ['Q1', 'COMPLETED', 0],
        // over the cap: final, not retried ten times
        ['Q2', 'FAILED', 1],
        ['Q3', 'COMPLETED', 0],
      ]);
    });
  });

  describe('initial research of a new ticker', () => {
    const research = (): ResearchService => {
      const service = new ResearchService(
        ds.getRepository(ResearchNote),
        {} as any,
        {} as any,
        {} as any,
        { get: () => undefined } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      jest.spyOn(service, 'processTicket').mockImplementation(async () => {
        await pause(15);
      });
      return service;
    };
    const instance = (researchService: ResearchService, hasBudget = true) =>
      new JobsService(
        {} as any,
        {} as any,
        {
          getSnapshot: jest.fn().mockResolvedValue({}),
          syncTickerHistory: jest.fn().mockResolvedValue(undefined),
        } as any,
        {} as any,
        researchService,
        {} as any,
        ds.getRepository(RequestQueue),
        {} as any,
        { get: () => undefined } as any,
        { hasBudget: jest.fn().mockResolvedValue(hasBudget) } as any,
      );
    const notes = async (): Promise<any[]> =>
      ds.query(`SELECT tickers, quality, user_id, status FROM research_notes`);

    it('two app instances initialising the same ticker at once: ONE ticket, processed ONCE, free-only', async () => {
      const r1 = research();
      const r2 = research();

      await Promise.all([
        instance(r1).initializeTicker('NVDA'),
        instance(r2).initializeTicker('NVDA'),
      ]);

      expect(await notes()).toEqual([
        { tickers: ['NVDA'], quality: 'low', user_id: null, status: 'pending' },
      ]);
      const calls = [
        ...(r1.processTicket as jest.Mock).mock.calls,
        ...(r2.processTicket as jest.Mock).mock.calls,
      ];
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toEqual({ freeOnly: true });
    });

    it('a ticker the scanner (or an earlier run) already researched is not researched again', async () => {
      const r = research();
      await r.createResearchTicket(null, ['NVDA'], 'scan', 'gemini', 'cron');

      await instance(r).initializeTicker('NVDA');

      expect(await notes()).toHaveLength(1);
      expect(r.processTicket).not.toHaveBeenCalled();
    });

    it('a USER’s research on the ticker does not count as the system’s initial run', async () => {
      const r = research();
      await r.createResearchTicket(
        users.alice,
        ['NVDA'],
        'mine',
        'gemini',
        'low',
      );

      await instance(r).initializeTicker('NVDA');

      expect(await notes()).toHaveLength(2);
      expect(r.processTicket).toHaveBeenCalledTimes(1);
    });

    it('without free LLM budget no ticket is written at all', async () => {
      const r = research();

      await instance(r, false).initializeTicker('NVDA');

      expect(await notes()).toEqual([]);
      expect(r.processTicket).not.toHaveBeenCalled();
    });
  });
});

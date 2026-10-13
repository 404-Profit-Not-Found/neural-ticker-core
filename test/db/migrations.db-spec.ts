import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger as NestLogger } from '@nestjs/common';
import { DataSource, Logger as TypeOrmLogger } from 'typeorm';
import {
  SRC,
  describeDb,
  dropEverything,
  ensureMigrated,
  openDataSource,
} from './support/test-db';

const BASELINE = 'BaselineSchema1736000000000';

/** Everything that defines the schema, as sorted, comparable lines. */
async function schemaFingerprint(ds: DataSource): Promise<string[]> {
  const rows: { line: string }[] = await ds.query(`
    SELECT 'column ' || table_name || '.' || column_name || ' ' || data_type
           || coalesce('(' || character_maximum_length || ')', '')
           || coalesce(' [' || udt_name || ']', '')
           || ' null=' || is_nullable
           || ' default=' || coalesce(column_default, '-') AS line
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name <> 'migrations'
    UNION ALL
    SELECT 'index ' || indexname || ' :: ' || indexdef
      FROM pg_indexes WHERE schemaname = 'public' AND tablename <> 'migrations'
    UNION ALL
    SELECT 'constraint ' || c.conrelid::regclass || '.' || c.conname || ' :: '
           || pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'public' AND c.conrelid::regclass::text <> 'migrations'
    UNION ALL
    SELECT 'enum ' || t.typname || ' :: '
           || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     GROUP BY t.typname
    UNION ALL
    SELECT 'sequence ' || sequencename FROM pg_sequences
     WHERE schemaname = 'public' AND sequencename <> 'migrations_id_seq'
  `);
  return rows.map((r) => r.line).sort();
}

/** Records every statement TypeORM sends. */
class RecordingLogger implements TypeOrmLogger {
  readonly queries: string[] = [];
  logQuery(query: string): void {
    this.queries.push(query.replace(/\s+/g, ' ').trim());
  }
  logQueryError(): void {}
  logQuerySlow(): void {}
  logSchemaBuild(): void {}
  logMigration(): void {}
  log(): void {}
}

const isDdl = (query: string): boolean =>
  /^(CREATE|ALTER|DROP|TRUNCATE|DO|INSERT|UPDATE|DELETE)\b/i.test(query) &&
  !/^INSERT INTO "migrations"/i.test(query) &&
  // issued by the driver on every connect, with or without the baseline
  !/^CREATE EXTENSION IF NOT EXISTS "uuid-ossp"$/i.test(query);

describeDb('migrations against a real PostgreSQL', () => {
  let ds: DataSource;

  afterEach(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  // The suite builds its own connection options (test/db/support/test-db.ts)
  // instead of importing the factory in app.module.ts, which is not exported.
  // If the application changes how it connects, this fails and the mirror
  // must be updated with it.
  it('the application still connects the way this suite assumes', () => {
    const appModule = readFileSync(join(SRC, 'app.module.ts'), 'utf8');
    expect(appModule).toContain("type: 'postgres'");
    expect(appModule).toContain('autoLoadEntities: true');
    expect(appModule).toContain('migrationsRun: true');
    expect(appModule).toContain(
      "migrations: [join(__dirname, 'migrations', '*.{ts,js}')]",
    );
  });

  describe('an EMPTY database', () => {
    it.each(['all', 'each'] as const)(
      'is built by the migrations alone, in timestamp order (transaction: %s)',
      async (transaction) => {
        await dropEverything();
        ds = await openDataSource();
        const stamp = (name: string): number => Number(name.slice(-13));
        // In the order of the timestamp in the name — the order production
        // ran the existing ones in, with the baseline in front.
        const expected = ds.migrations
          .map((m) => m.name as string)
          .sort((a, b) => stamp(a) - stamp(b));

        const executed = await ds.runMigrations({ transaction });

        expect(executed.map((m) => m.name)).toEqual(expected);
        expect(expected[0]).toBe(BASELINE);
        expect(expected.length).toBeGreaterThanOrEqual(20);
        expect(await ds.showMigrations()).toBe(false);
        // A second boot has nothing left to do.
        expect(await ds.runMigrations({ transaction })).toEqual([]);
      },
    );

    it('ends up with a table for every entity', async () => {
      await ensureMigrated();
      ds = await openDataSource();

      const tables: { tablename: string }[] = await ds.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      );
      const present = new Set(tables.map((t) => t.tablename));
      const missing = ds.entityMetadatas
        .map((m) => m.tableName)
        .filter((name) => !present.has(name));

      expect(ds.entityMetadatas).toHaveLength(36);
      expect(missing).toEqual([]);
    });

    // What TypeORM would still change to make a migrated database match the
    // entities: NOTHING. (It used to be 76 statements — constraint and index
    // names, nullability, timestamp types, two missing foreign keys — which
    // made `synchronize` destructive on a migrated database: it would have
    // dropped two unique indexes and dropped and re-added six timestamp
    // columns. The entities now describe the schema the migrations build, and
    // AlignSchemaWithEntities adds the two foreign keys that were missing.)
    it('matches the entities exactly: the schema builder has nothing pending', async () => {
      await ensureMigrated();
      ds = await openDataSource();

      const pending = (
        await ds.driver.createSchemaBuilder().log()
      ).upQueries.map((q) => q.query.replace(/\s+/g, ' ').trim());

      expect(pending).toEqual([]);
    });

    it('so a `synchronize` on a migrated database is a no-op', async () => {
      await ensureMigrated();
      ds = await openDataSource();
      const before = await schemaFingerprint(ds);

      await ds.synchronize();

      expect(await schemaFingerprint(ds)).toEqual(before);
    });
  });

  describe('AlignSchemaWithEntities: the two foreign keys to tickers', () => {
    const MIGRATION = 'AlignSchemaWithEntities1791880300000';
    const KEYS = [
      ['stocktwits_analyses', 'FK_1c6e5ad63e17b3dd268a5baf3be'],
      ['event_calendar', 'FK_cf19f0813c5353475930eba56a7'],
    ] as const;
    const constraint = async (table: string, name: string) =>
      (
        await ds.query(
          `SELECT convalidated, confdeltype FROM pg_constraint
            WHERE conrelid = to_regclass($1) AND conname = $2`,
          [table, name],
        )
      )[0];
    /** Back to the state before the migration: no keys, migration not recorded. */
    const undo = async () => {
      for (const [table, name] of KEYS) {
        await ds.query(
          `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`,
        );
      }
      await ds.query(`DELETE FROM migrations WHERE name = $1`, [MIGRATION]);
    };
    const run = async () => {
      const fresh = await openDataSource();
      try {
        return (await fresh.runMigrations({ transaction: 'all' })).map(
          (m) => m.name,
        );
      } finally {
        await fresh.destroy();
      }
    };
    const addTicker = async (symbol: string): Promise<string> =>
      (
        await ds.query(
          `INSERT INTO tickers (symbol, name, exchange, currency, country) VALUES ($1, $1, 'X', 'USD', 'US') RETURNING id`,
          [symbol],
        )
      )[0].id;
    const addAnalysis = (tickerId: string | number, symbol: string) =>
      ds.query(
        `INSERT INTO stocktwits_analyses (ticker_id, symbol, sentiment_score, sentiment_label, posts_analyzed, weighted_sentiment_score, summary, model_used, analysis_start, analysis_end, highlights, extracted_events)
         VALUES ($1, $2, 0, 'neutral', 0, 0, '', 'm', now(), now(), '{}', '[]')`,
        [tickerId, symbol],
      );

    beforeEach(async () => {
      await ensureMigrated();
      ds = await openDataSource();
      await ds.query(
        `TRUNCATE stocktwits_analyses, event_calendar, tickers RESTART IDENTITY CASCADE`,
      );
    });
    afterEach(async () => {
      // leave the database as the migrations build it
      await ds.query(
        `TRUNCATE stocktwits_analyses, event_calendar, tickers RESTART IDENTITY CASCADE`,
      );
      for (const [table, name] of KEYS) {
        await ds
          .query(`ALTER TABLE "${table}" VALIDATE CONSTRAINT "${name}"`)
          .catch(() => undefined);
      }
    });

    it('a migrated database has both, validated, ON DELETE CASCADE', async () => {
      for (const [table, name] of KEYS) {
        expect(await constraint(table, name)).toEqual({
          convalidated: true,
          confdeltype: 'c',
        });
      }
      // deleting a ticker now takes its analyses and events with it
      const id = await addTicker('NVDA');
      await addAnalysis(id, 'NVDA');
      await ds.query(`DELETE FROM tickers WHERE id = $1`, [id]);
      expect(
        (
          await ds.query(`SELECT count(*)::int AS n FROM stocktwits_analyses`)
        )[0].n,
      ).toBe(0);
    });

    it('with orphan rows: the key is added NOT VALID, nothing is deleted, the migration does not fail and says how many', async () => {
      await undo();
      const id = await addTicker('NVDA');
      await addAnalysis(id, 'NVDA');
      await addAnalysis(987654, 'GONE1'); // its ticker no longer exists
      await addAnalysis(987655, 'GONE2');
      const warnings: string[] = [];
      jest
        .spyOn(NestLogger.prototype, 'warn')
        .mockImplementation((message: any) => {
          warnings.push(String(message));
        });

      const executed = await run();

      expect(executed).toEqual([MIGRATION]);
      expect(await constraint(...KEYS[0])).toEqual({
        convalidated: false,
        confdeltype: 'c',
      });
      // the table without orphans is validated as usual
      expect(await constraint(...KEYS[1])).toEqual({
        convalidated: true,
        confdeltype: 'c',
      });
      expect(
        (
          await ds.query(`SELECT count(*)::int AS n FROM stocktwits_analyses`)
        )[0].n,
      ).toBe(3);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(
        'stocktwits_analyses: 2 row(s) reference a ticker that no longer exists',
      );
      expect(warnings[0]).toContain(
        'ALTER TABLE "stocktwits_analyses" VALIDATE CONSTRAINT "FK_1c6e5ad63e17b3dd268a5baf3be";',
      );

      // NOT VALID still guards NEW rows…
      await expect(addAnalysis(555555, 'NOPE')).rejects.toMatchObject({
        code: '23503',
      });
      // …and once the orphans are gone, the printed statement validates it.
      await ds.query(
        `DELETE FROM stocktwits_analyses WHERE symbol LIKE 'GONE%'`,
      );
      await ds.query(
        `ALTER TABLE "stocktwits_analyses" VALIDATE CONSTRAINT "FK_1c6e5ad63e17b3dd268a5baf3be"`,
      );
      expect((await constraint(...KEYS[0])).convalidated).toBe(true);
      jest.restoreAllMocks();
    });

    it('where the key already exists (a schema TypeORM synchronize built) it changes nothing', async () => {
      await ds.query(`DELETE FROM migrations WHERE name = $1`, [MIGRATION]);
      const before = await schemaFingerprint(ds);

      expect(await run()).toEqual([MIGRATION]);

      expect(await schemaFingerprint(ds)).toEqual(before);
    });

    it('…also when it exists under another name', async () => {
      await undo();
      await ds.query(
        `ALTER TABLE stocktwits_analyses ADD CONSTRAINT some_other_name FOREIGN KEY (ticker_id) REFERENCES tickers(id) ON DELETE CASCADE`,
      );

      await run();

      expect(
        await constraint('stocktwits_analyses', KEYS[0][1]),
      ).toBeUndefined();
      expect(
        await constraint('stocktwits_analyses', 'some_other_name'),
      ).toMatchObject({ convalidated: true });
      // restore the canonical name for the specs that follow
      await ds.query(
        `ALTER TABLE stocktwits_analyses RENAME CONSTRAINT some_other_name TO "${KEYS[0][1]}"`,
      );
    });
  });

  describe('the baseline on a database that ALREADY has the schema (production)', () => {
    const rerunBaseline = async (): Promise<{
      executed: string[];
      statements: string[];
      before: string[];
      after: string[];
    }> => {
      const logger = new RecordingLogger();
      ds = await openDataSource({ logging: true, logger });
      await ds.query(`DELETE FROM migrations WHERE name = $1`, [BASELINE]);
      const before = await schemaFingerprint(ds);
      logger.queries.length = 0;

      const executed = await ds.runMigrations({ transaction: 'all' });

      const statements = [...logger.queries];
      const after = await schemaFingerprint(ds);
      return {
        executed: executed.map((m) => m.name),
        statements,
        before,
        after,
      };
    };

    it('built by the migrations: runs, records itself, and issues no statement that changes anything', async () => {
      await ensureMigrated();

      const { executed, statements, before, after } = await rerunBaseline();

      expect(executed).toEqual([BASELINE]);
      expect(statements.filter(isDdl)).toEqual([]);
      expect(
        statements.filter((q) => /^SELECT to_regclass/.test(q)),
      ).toHaveLength(22);
      expect(after).toEqual(before);
      expect(before.length).toBeGreaterThan(300);
    });

    it('built by TypeORM synchronize, with the older migrations recorded as executed: the same', async () => {
      await dropEverything();
      ds = await openDataSource();
      await ds.synchronize();
      await ds.query(
        `CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, "timestamp" bigint NOT NULL, name character varying NOT NULL)`,
      );
      for (const migration of ds.migrations) {
        await ds.query(
          `INSERT INTO migrations("timestamp", name) VALUES ($1, $2)`,
          [Number(migration.name!.slice(-13)), migration.name],
        );
      }
      await ds.destroy();

      const { executed, statements, before, after } = await rerunBaseline();

      expect(executed).toEqual([BASELINE]);
      expect(statements.filter(isDdl)).toEqual([]);
      expect(after).toEqual(before);

      // Leave the database migrated-from-empty for the other specs.
      await ds.destroy();
      await dropEverything();
      await ensureMigrated();
    });

    it('creates only what is missing when a single base table is absent', async () => {
      await ensureMigrated();
      ds = await openDataSource();
      await ds.query('DROP TABLE "auth_logs"');
      await ds.destroy();

      const { executed, statements } = await rerunBaseline();

      expect(executed).toEqual([BASELINE]);
      const ddl = statements.filter(isDdl);
      expect(ddl).toHaveLength(2);
      expect(ddl[0]).toMatch(/^CREATE TABLE "auth_logs" \(/);
      expect(ddl[1]).toMatch(/^CREATE INDEX "IDX_[0-9a-f]+" ON "auth_logs"/);
    });
  });
});

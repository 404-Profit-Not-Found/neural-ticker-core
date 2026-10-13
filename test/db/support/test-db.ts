import 'reflect-metadata';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * Real-PostgreSQL integration suite — support code.
 *
 * OPT-IN: every spec under test/db is skipped unless TEST_DATABASE_URL is set,
 * and the suite is not part of `npm test` / CI (run it with `npm run test:db`).
 *
 * The suite DROPS AND RECREATES THE `public` SCHEMA of the database it is
 * given. To make pointing it at something precious impossible it refuses any
 * database whose name does not contain "test" or "verify", and any host other
 * than this machine.
 */

export const SRC = join(__dirname, '..', '..', '..', 'src');

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** `describe` when a test database is configured, `describe.skip` otherwise. */
export const describeDb: jest.Describe = TEST_DATABASE_URL
  ? describe
  : describe.skip;

function assertDisposable(url: string): void {
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/test|verify/i.test(database)) {
    throw new Error(
      `TEST_DATABASE_URL points at database "${database}". This suite drops ` +
        'the whole schema, so it only runs against a database whose name ' +
        'contains "test" or "verify".',
    );
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error(
      `TEST_DATABASE_URL points at host "${parsed.hostname}". This suite ` +
        'only runs against a PostgreSQL on this machine.',
    );
  }
}

/**
 * The options the application connects with (the factory in
 * src/app.module.ts), for the non-test, non-production case:
 *   type postgres, autoLoadEntities, migrations from src/migrations,
 *   synchronize OFF.
 * `autoLoadEntities` = every entity a module registers = every *.entity.ts
 * (all 36 are registered), hence the glob. `migrationsRun` is false here only
 * because the suite runs the migrations itself, to report on each one;
 * migrations.db-spec.ts checks that the application still declares the
 * options this mirrors.
 */
export function appDataSourceOptions(
  overrides: Partial<DataSourceOptions> = {},
): DataSourceOptions {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set');
  assertDisposable(TEST_DATABASE_URL);
  return {
    type: 'postgres',
    url: TEST_DATABASE_URL,
    entities: [join(SRC, '**', '*.entity.{ts,js}')],
    migrations: [join(SRC, 'migrations', '*.{ts,js}')],
    synchronize: false,
    migrationsRun: false,
    ssl: false,
    ...overrides,
  } as DataSourceOptions;
}

export async function openDataSource(
  overrides: Partial<DataSourceOptions> = {},
): Promise<DataSource> {
  return new DataSource(appDataSourceOptions(overrides)).initialize();
}

/** Back to an EMPTY database: no tables, no types, no migration history. */
export async function dropEverything(): Promise<void> {
  // No entities: the driver must not try to install anything first.
  const ds = await openDataSource({ entities: [], migrations: [] });
  try {
    await ds.query('DROP SCHEMA IF EXISTS public CASCADE');
    await ds.query('CREATE SCHEMA public');
  } finally {
    await ds.destroy();
  }
}

/**
 * Makes sure the database holds the fully migrated schema, building it from
 * empty when it does not. Every spec calls this first; only the first call in
 * a run does any work.
 */
export async function ensureMigrated(): Promise<void> {
  let ds = await openDataSource();
  try {
    const hasHistory = await ds.query(
      `SELECT to_regclass('public.migrations') IS NOT NULL AS present`,
    );
    const pending = hasHistory[0].present ? await ds.showMigrations() : true;
    if (!pending) return;
  } finally {
    await ds.destroy();
  }
  await dropEverything();
  ds = await openDataSource();
  try {
    await ds.runMigrations({ transaction: 'all' });
  } finally {
    await ds.destroy();
  }
}

/** Empties every table (not the migration history) and restarts sequences. */
export async function truncateAll(ds: DataSource): Promise<void> {
  const tables: { tablename: string }[] = await ds.query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  );
  if (tables.length === 0) return;
  await ds.query(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')}
     RESTART IDENTITY CASCADE`,
  );
}

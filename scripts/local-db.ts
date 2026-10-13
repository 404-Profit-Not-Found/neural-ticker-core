/**
 * Guard + TypeORM DataSource for the local-development seed (seed-local.ts).
 *
 * The seed DELETES data, so the target is pinned:
 *   - database name must be exactly `neural_ticker_local`
 *   - host must be localhost / 127.0.0.1 / ::1
 * and `DATABASE_URL` is never read for connecting — the connection is built
 * from the guarded host/port/user/database only. This repo's production
 * database is remote; with these rules it cannot be reached from here, even
 * with a production DATABASE_URL exported in the shell.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse as parseDotenv } from 'dotenv';
import { DataSource } from 'typeorm';

export const REPO_ROOT = path.resolve(__dirname, '..');
export const LOCAL_DATABASE = 'neural_ticker_local';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

export interface LocalTarget {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export class LocalGuardError extends Error {}

/**
 * Resolve the connection target and refuse anything that is not the local
 * demo database. Values come from the shell environment first and `.env`
 * second — the same precedence the backend uses — so the guard judges the
 * target the backend itself would pick (minus DATABASE_URL, which is ignored).
 */
export function resolveLocalTarget(): LocalTarget {
  const envFile = path.join(REPO_ROOT, '.env');
  const fileEnv: Record<string, string> = fs.existsSync(envFile)
    ? parseDotenv(fs.readFileSync(envFile))
    : {};
  const pick = (key: string): string | undefined => {
    const value = process.env[key] ?? fileEnv[key];
    return value === undefined || value === '' ? undefined : value;
  };

  const host = pick('DB_HOST') ?? 'localhost';
  const database = pick('DB_DATABASE');
  const port = parseInt(pick('DB_PORT') ?? '5432', 10);
  const username =
    pick('DB_USERNAME') ?? pick('POSTGRES_USER') ?? os.userInfo().username;
  const password = pick('DB_PASSWORD') ?? pick('POSTGRES_PASSWORD') ?? '';

  const problems: string[] = [];
  if (database !== LOCAL_DATABASE) {
    problems.push(
      `DB_DATABASE is ${database ? `"${database}"` : 'not set'} — it must be exactly "${LOCAL_DATABASE}"`,
    );
  }
  if (!LOCAL_HOSTS.includes(host.toLowerCase())) {
    problems.push(
      `DB_HOST is "${host}" — it must be one of ${LOCAL_HOSTS.join(', ')}`,
    );
  }
  if (!Number.isInteger(port) || port <= 0) {
    problems.push(`DB_PORT "${pick('DB_PORT')}" is not a port number`);
  }
  if (problems.length > 0) {
    throw new LocalGuardError(
      [
        'REFUSING TO RUN: this script only ever touches the local demo database.',
        ...problems.map((p) => `  - ${p}`),
        `Set DB_HOST / DB_DATABASE in ${envFile} (see docs/local-development.md).`,
      ].join('\n'),
    );
  }

  if (process.env.DATABASE_URL) {
    // Never printed, never used.
    console.warn(
      'Note: DATABASE_URL is set in this shell. These scripts ignore it, but ' +
        'the backend does NOT — start the backend with `env -u DATABASE_URL`.',
    );
  }

  return { host, port, username, password, database: LOCAL_DATABASE };
}

/** DataSource over the app's real entities. No `url`, ever. */
export function createLocalDataSource(target: LocalTarget): DataSource {
  return new DataSource({
    type: 'postgres',
    host: target.host,
    port: target.port,
    username: target.username,
    ...(target.password ? { password: target.password } : {}),
    database: target.database,
    ssl: false,
    // Every entity the backend registers (all live under modules/*/entities).
    entities: [path.join(REPO_ROOT, 'src/modules/**/entities/*.entity.ts')],
    // The schema belongs to the backend's migrations; never touched here.
    synchronize: false,
    migrationsRun: false,
    logging: false,
  });
}

/**
 * Connect, then ask the SERVER where we are before the caller writes
 * anything: the session must be in `neural_ticker_local` on a loopback
 * address (or a unix socket).
 */
export async function connectLocal(target: LocalTarget): Promise<DataSource> {
  const ds = createLocalDataSource(target);
  await ds.initialize();
  const [row] = (await ds.query(
    'SELECT current_database() AS db, host(inet_server_addr()) AS addr',
  )) as { db: string; addr: string | null }[];
  const loopback =
    row.addr === null || row.addr === '127.0.0.1' || row.addr === '::1';
  if (row.db !== LOCAL_DATABASE || !loopback) {
    await ds.destroy();
    throw new LocalGuardError(
      `REFUSING TO RUN: connected to database "${row.db}" at ${row.addr ?? 'a unix socket'}, ` +
        `expected "${LOCAL_DATABASE}" on a loopback address.`,
    );
  }
  return ds;
}

/** Entry-point wrapper: guard failures exit 2, anything else exits 1. */
export function runScript(main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    if (err instanceof LocalGuardError) {
      console.error(err.message);
      process.exit(2);
    }
    // A failed statement carries its whole SQL text and every parameter;
    // print what identifies the failure, not thousands of bind values.
    const q = err as { message?: string; detail?: string; query?: string };
    if (typeof q?.query === 'string') {
      console.error(`Query failed: ${q.message}`);
      if (q.detail) console.error(`  ${q.detail}`);
      console.error(`  ${q.query.slice(0, 200)}${q.query.length > 200 ? ' …' : ''}`);
    } else {
      console.error(err instanceof Error ? err.message : err);
    }
    process.exit(1);
  });
}

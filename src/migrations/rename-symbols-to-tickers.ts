import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

// Helper to load .env manually since we might not have dotenv installed/exposed
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach((line) => {
      const [key, ...values] = line.split('=');
      if (key && values.length > 0) {
        const val = values.join('=').trim();
        // Remove quotes if present
        process.env[key.trim()] = val.replace(/^["'](.*)["']$/, '$1');
      }
    });
  }
}

loadEnv();

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
const dbUser = process.env.DB_USERNAME || 'postgres';
const dbPass = process.env.DB_PASSWORD || 'password';
const dbName = process.env.DB_DATABASE || 'neural_ticker';

// Prefer DATABASE_URL if set
const connectionUrl = process.env.DATABASE_URL;

const dataSourceConfig: any = {
  type: 'postgres',
  ssl:
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false,
};

if (connectionUrl) {
  Object.assign(dataSourceConfig, { url: connectionUrl });
  console.log(
    `Connecting via DATABASE_URL: ${connectionUrl.replace(/:[^:@]*@/, ':****@')}`,
  );
} else {
  Object.assign(dataSourceConfig, {
    host: dbHost,
    port: dbPort,
    username: dbUser,
    password: dbPass,
    database: dbName,
  });
  console.log(`Connecting via params: ${dbHost}:${dbPort}/${dbName}`);
}

const dataSource = new DataSource(dataSourceConfig);

async function migrate() {
  console.log('Initializing DataSource...');
  try {
    await dataSource.initialize();
  } catch (e) {
    console.error(
      'Connection failed. Please ensure database is running and credentials are correct.',
    );
    console.error('Debug: Host:', dbHost, 'Port:', dbPort);
    throw e;
  }

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    console.log('Checking tables...');

    // Check if 'symbols' table exists
    const symbolsExists = await queryRunner.hasTable('symbols');
    const tickersExists = await queryRunner.hasTable('tickers');

    if (symbolsExists) {
      if (!tickersExists) {
        console.log("Renaming 'symbols' table to 'tickers'...");
        await queryRunner.renameTable('symbols', 'tickers'); // This executes ALTER TABLE ... RENAME TO ...
        console.log('SUCCESS: Table renamed.');
      } else {
        console.warn("WARNING: Both 'symbols' and 'tickers' tables exist.");
        // Check if tickers is empty
        const tickersCount = await queryRunner.query(
          'SELECT COUNT(*) as count FROM tickers',
        );
        const count = parseInt(tickersCount[0].count, 10);

        if (count === 0) {
          console.log(
            "'tickers' table exists but is empty. Dropping it and renaming 'symbols'...",
          );
          await queryRunner.dropTable('tickers');
          await queryRunner.renameTable('symbols', 'tickers');
          console.log('SUCCESS: Table renamed after dropping empty target.');
        } else {
          console.warn(
            "Manual intervention required to merge data. 'tickers' table has data. Skipping rename.",
          );
        }
      }
    } else {
      console.log(
        "'symbols' table does not exist. Migration skipped (already done?).",
      );
    }
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

migrate().catch((err) => {
  console.error('Migration failed', err);
  process.exit(1);
});

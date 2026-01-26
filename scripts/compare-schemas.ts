import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const DEV_DB_URL = 'postgresql://neondb_owner:npg_iAFeH38yMBkW@ep-quiet-fire-ag2vydfm-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const PROD_DB_URL = 'postgresql://neondb_owner:npg_iAFeH38yMBkW@ep-red-sun-agranmzh-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require';

async function getSchema(connectionString: string, label: string) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log(`Connected to ${label}...`);
    
    const res = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name;
    `);
    
    const schema: Record<string, Record<string, string>> = {};
    res.rows.forEach((row: any) => {
      if (!schema[row.table_name]) {
        schema[row.table_name] = {};
      }
      schema[row.table_name][row.column_name] = row.data_type;
    });
    
    return schema;
  } catch (err) {
    console.error(`Error connecting to ${label}:`, err);
    return {};
  } finally {
    await client.end();
  }
}

async function compare() {
  console.log('--- Database Schema Comparison ---');
  const devSchema = await getSchema(DEV_DB_URL, 'DEV (Target)');
  const prodSchema = await getSchema(PROD_DB_URL, 'PROD (Source)');

  console.log('\n--- Missing Tables in PROD ---');
  for (const table of Object.keys(devSchema)) {
    if (!prodSchema[table]) {
      console.log(`[MISSING TABLE] ${table}`);
    }
  }

  console.log('\n--- Missing Columns in PROD (for existing tables) ---');
  for (const table of Object.keys(devSchema)) {
    if (prodSchema[table]) {
      for (const col of Object.keys(devSchema[table])) {
        if (!prodSchema[table][col]) {
          console.log(`[MISSING COLUMN] ${table}.${col} (${devSchema[table][col]})`);
        }
      }
    }
  }
  
  console.log('\n--- Extra Tables/Columns in PROD (Cleanup Candidates) ---');
  for (const table of Object.keys(prodSchema)) {
    if (!devSchema[table]) {
      console.log(`[EXTRA TABLE] ${table}`);
    } else {
      for (const col of Object.keys(prodSchema[table])) {
        if (!devSchema[table][col]) {
          console.log(`[EXTRA COLUMN] ${table}.${col}`);
        }
      }
    }
  }
}

compare();

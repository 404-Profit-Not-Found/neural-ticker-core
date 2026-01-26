// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require('pg');

const PROD_DB_URL = 'postgresql://neondb_owner:npg_iAFeH38yMBkW@ep-red-sun-agranmzh-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require';

async function fixProdSchema() {
  const client = new Client({ connectionString: PROD_DB_URL });
  
  try {
    await client.connect();
    console.log('Connected to PROD database...');
    
    // Fix 1: Add tokens_used to stocktwits_analyses
    console.log('Adding tokens_used column to stocktwits_analyses...');
    await client.query(`
      ALTER TABLE "stocktwits_analyses" 
      ADD COLUMN IF NOT EXISTS "tokens_used" integer
    `);
    console.log('✓ tokens_used column added');
    
    // Fix 2: Add inserted_at to stocktwits_posts (if missing)
    console.log('Adding inserted_at column to stocktwits_posts...');
    await client.query(`
      ALTER TABLE "stocktwits_posts" 
      ADD COLUMN IF NOT EXISTS "inserted_at" TIMESTAMP WITH TIME ZONE DEFAULT now()
    `);
    console.log('✓ inserted_at column added');
    
    // Fix 3: Ensure stocktwits_watchers table exists with all columns
    console.log('Ensuring stocktwits_watchers table exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "stocktwits_watchers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "symbol" character varying NOT NULL,
        "count" integer NOT NULL,
        "timestamp" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "stocktwits_watchers_pkey" PRIMARY KEY ("id")
      )
    `);
    await client.query(`
      ALTER TABLE "stocktwits_watchers" 
      ADD COLUMN IF NOT EXISTS "symbol" character varying
    `);
    await client.query(`
      ALTER TABLE "stocktwits_watchers" 
      ADD COLUMN IF NOT EXISTS "count" integer
    `);
    await client.query(`
      ALTER TABLE "stocktwits_watchers" 
      ADD COLUMN IF NOT EXISTS "timestamp" timestamp with time zone DEFAULT now()
    `);
    console.log('✓ stocktwits_watchers table fixed');
    
    console.log('\n=== ALL FIXES APPLIED SUCCESSFULLY ===');
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

fixProdSchema();

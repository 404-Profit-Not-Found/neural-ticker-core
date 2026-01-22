const { Client } = require('pg');

async function checkTables() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_62yqfPNHUAcM@ep-fancy-paper-a2onv6at-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require",
  });

  try {
    await client.connect();
    console.log('Connected to production database.');

    const tables = ['tickers', 'ticker_requests', 'price_ohlcv'];
    
    for (const table of tables) {
      try {
        const res = await client.query(`SELECT count(*) FROM "${table}"`);
        console.log(`Table "${table}": OK, count=${res.rows[0].count}`);
      } catch (err) {
        console.error(`Table "${table}": ERROR: ${err.message}`);
      }
    }

    // List all tables in public schema
    const allTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('All tables in public schema:', allTables.rows.map(r => r.table_name).join(', '));

  } catch (err) {
    console.error('Connection failed:', err.message);
  } finally {
    await client.end();
  }
}

checkTables();

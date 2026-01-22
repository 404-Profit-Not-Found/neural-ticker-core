
const { Client } = require('pg');
require('dotenv').config();

async function checkTickers() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  const res = await client.query("SELECT symbol, name, is_hidden FROM tickers WHERE symbol ILIKE 'NVD%'");
  console.log('Tickers matching NVD%:', res.rows);
  await client.end();
}

checkTickers().catch(console.error);


require('dotenv').config();
const { Client } = require('pg');
const process = require('process');

async function getSchema(client) {
  const tablesResult = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const schema = {};

  for (const row of tablesResult.rows) {
    const tableName = row.table_name;
    const columnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY column_name;
    `, [tableName]);

    schema[tableName] = {};
    for (const col of columnsResult.rows) {
      schema[tableName][col.column_name] = {
        type: col.data_type,
        nullable: col.is_nullable,
        default: col.column_default,
      };
    }
  }

  return schema;
}

async function run() {
  const localUrl = process.env.DATABASE_URL;
  let prodUrl = process.env.postgresql_prod;

  if (!localUrl || !prodUrl) {
    console.error('Missing DATABASE_URL or postgresql_prod in environment variables.');
    process.exit(1);
  }
  
  if (prodUrl.startsWith("'") && prodUrl.endsWith("'")) {
    prodUrl = prodUrl.slice(1, -1);
  }

  console.log('Connecting to Local/Dev DB:', localUrl.replace(/:[^:]*@/, ':***@'));
  console.log('Connecting to Prod DB:', prodUrl.replace(/:[^:]*@/, ':***@'));

  const clientLocal = new Client({ connectionString: localUrl, ssl: { rejectUnauthorized: false } });
  const clientProd = new Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });

  try {
    await clientLocal.connect();
    await clientProd.connect();

    console.log('Fetching schemas...');
    const localSchema = await getSchema(clientLocal);
    const prodSchema = await getSchema(clientProd);

    console.log('\n--- COMPARISON RESULTS ---\n');

    const allTables = new Set([...Object.keys(localSchema), ...Object.keys(prodSchema)]);
    
    for (const table of Array.from(allTables).sort()) {
      const inLocal = !!localSchema[table];
      const inProd = !!prodSchema[table];

      if (inLocal && !inProd) {
        console.log(`[+] Table '${table}' exists in LOCAL but NOT in PROD.`);
        continue;
      }
      if (!inLocal && inProd) {
        console.log(`[-] Table '${table}' exists in PROD but NOT in LOCAL.`);
        continue;
      }

      const localCols = localSchema[table];
      const prodCols = prodSchema[table];
      const allCols = new Set([...Object.keys(localCols), ...Object.keys(prodCols)]);
      
      let tableDiffFound = false;

      for (const col of Array.from(allCols).sort()) {
        const lDef = localCols[col];
        const pDef = prodCols[col];

        if (lDef && !pDef) {
          if (!tableDiffFound) { console.log(`Table '${table}':`); tableDiffFound = true; }
          console.log(`  [+] Column '${col}' is new (Type: ${lDef.type})`);
        } else if (!lDef && pDef) {
          if (!tableDiffFound) { console.log(`Table '${table}':`); tableDiffFound = true; }
          console.log(`  [-] Column '${col}' is missing (was Type: ${pDef.type})`);
        } else {
          if (lDef.type !== pDef.type || lDef.nullable !== pDef.nullable) {
            if (!tableDiffFound) { console.log(`Table '${table}':`); tableDiffFound = true; }
            console.log(`  [*] Column '${col}' mismatch:`);
            console.log(`      Local: ${JSON.stringify(lDef)}`);
            console.log(`      Prod:  ${JSON.stringify(pDef)}`);
          }
        }
      }
    }
    
    console.log('\nDone.');

  } catch (err) {
    console.error('Error comparing schemas:', err);
  } finally {
    await clientLocal.end();
    await clientProd.end();
  }
}

run();

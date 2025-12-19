import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const finnhub = require('finnhub');

const apiKey = process.env.FINNHUB_API_KEY;

if (!apiKey) {
  console.error('Error: FINNHUB_API_KEY not found in .env');
  process.exit(1);
}

const finnhubClient = new finnhub.DefaultApi(apiKey);

const EXCHANGES = [
  { code: 'US', name: 'USA (NYSE/NASDAQ)' },
  { code: 'L', name: 'London Stock Exchange' },
  { code: 'DE', name: 'Germany (XETRA)' },
  { code: 'PA', name: 'Paris (Euronext)' },
  { code: 'MI', name: 'Milan (Borsa Italiana)' },
  { code: 'SW', name: 'Swiss Exchange' },
];

async function testExchanges() {
  console.log('--- Finnhub Exchange Exploration (Free Tier) ---\n');

  // Health check: Try a simple quote call first
  try {
    console.log('Running health check (Quote for AAPL)...');
    const quote = await new Promise<any>((resolve, reject) => {
      finnhubClient.quote('AAPL', (error: any, data: any) => {
        if (error) return reject(error);
        resolve(data);
      });
    });
    console.log('✅ API Connection OK. Current Price:', quote.c);
  } catch (error) {
    console.error('❌ Health check failed. Your API key might be invalid or rate-limited.');
    console.error('Error:', error);
    return;
  }

  console.log('\nStarting Exchange List Scan...\n');
  console.log('NOTE: International symbol listing (Europe, etc.) usually requires a Premium plan.\n');

  for (const exchange of EXCHANGES) {
    try {
      console.log(`Fetching symbols for ${exchange.name} (${exchange.code})...`);
      
      const symbols = await new Promise<any[]>((resolve, reject) => {
        finnhubClient.stockSymbols(exchange.code, (error: any, data: any) => {
          if (error) {
            return reject(error);
          }
          resolve(data);
        });
      });

      if (symbols && Array.isArray(symbols)) {
        console.log(`✅ Success! Found ${symbols.length} symbols.`);
        if (symbols.length > 0) {
          console.log('Sample symbols:');
          symbols.slice(0, 5).forEach((s: any) => {
            console.log(`  - ${s.symbol}: ${s.description} (${s.currency})`);
          });
        }
      } else {
        console.log(`⚠️ No data returned for ${exchange.code}.`);
      }
    } catch (error: any) {
      if (error === 'Unauthorized' || error.includes && error.includes('access')) {
        console.error(`❌ Access Denied for ${exchange.code}. (Likely Premium only)`);
      } else {
        console.error(`❌ Error fetching ${exchange.code}:`, error);
      }
    }
    console.log('-----------------------------------');

    // Small delay to respect rate limits
    await new Promise(r => setTimeout(r, 500));
  }
}

testExchanges().catch(err => {
  console.error('Fatal Script Error:', err);
});

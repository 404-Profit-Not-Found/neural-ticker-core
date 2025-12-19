import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const finnhub = require('finnhub');
const apiKey = process.env.FINNHUB_API_KEY;

if (!apiKey) {
  console.error('FINNHUB_API_KEY not found');
  process.exit(1);
}

const finnhubClient = new finnhub.DefaultApi(apiKey);

const symbols = ['SOI.PA', 'JEN.DE'];

async function testQuotes() {
  console.log('--- Testing Specific European Quotes ---\n');
  
  for (const symbol of symbols) {
    try {
      console.log(`Fetching quote for ${symbol}...`);
      const data = await new Promise<any>((resolve, reject) => {
        finnhubClient.quote(symbol, (error: any, data: any) => {
          if (error) return reject(error);
          resolve(data);
        });
      });

      if (data && data.c !== 0) {
        console.log(`✅ Success for ${symbol}:`);
        console.log(`   Current Price: ${data.c}`);
        console.log(`   High: ${data.h}`);
        console.log(`   Low: ${data.l}`);
        console.log(`   Open: ${data.o}`);
        console.log(`   Prev Close: ${data.pc}`);
      } else {
        console.log(`⚠️ No data or zero price returned for ${symbol}. (Might not be supported on Free tier or invalid symbol)`);
        console.log(`   Full response:`, data);
      }
    } catch (error: any) {
      console.error(`❌ Error for ${symbol}:`, error);
    }
    console.log('-----------------------------------\n');
  }
}

testQuotes().catch(console.error);

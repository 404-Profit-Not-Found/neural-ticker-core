const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const finnhub = require('finnhub');
const apiKey = process.env.FINNHUB_API_KEY;

if (!apiKey) {
  console.error('FINNHUB_API_KEY not found');
  process.exit(1);
}

const finnhubClient = new finnhub.DefaultApi(apiKey);

console.log('Testing Finnhub connection...');

finnhubClient.quote('AAPL', (error, data) => {
  if (error) {
    console.error('❌ Baseline Quote Error:', JSON.stringify(error));
    process.exit(1);
  } else {
    console.log('✅ Baseline Quote Success! AAPL Price:', data.c);
    
    console.log('Testing London Exchange Symbols (L)...');
    finnhubClient.stockSymbols('L', (error, data) => {
      if (error) {
        console.error('❌ London Symbols Error:', typeof error === 'object' ? JSON.stringify(error) : error);
      } else {
        console.log(`✅ Success! Found ${data.length} London symbols.`);
      }
      process.exit(0);
    });
  }
});

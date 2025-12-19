import YahooFinance from 'yahoo-finance2';

const yahoo = new YahooFinance();

// Read symbols from CLI arguments or use defaults
const args = process.argv.slice(2);
const symbols = args.length > 0 ? args : ['SOI.PA', 'JEN.DE', 'AAPL', 'TSLA', 'ASML.AS'];

async function testYahoo() {
  console.log('--- Yahoo Finance Exploration ---\n');
  if (args.length === 0) {
    console.log('Tip: You can pass symbols as arguments, e.g.: npx ts-node scripts/test-yahoo.ts MSFT AAPL AMZN\n');
  }

  for (const symbol of symbols) {
    try {
      console.log(`Fetching data for ${symbol}...`);
      const result = await yahoo.quote(symbol);
      
      if (result) {
        console.log(`✅ Success for ${symbol}:`);
        console.log(`   Price: ${result.regularMarketPrice} ${result.currency}`);
        console.log(`   Name:  ${result.longName || result.shortName}`);
        console.log(`   Exchange: ${result.fullExchangeName}`);
      } else {
        console.log(`⚠️ No data returned for ${symbol}.`);
      }
    } catch (error: any) {
      console.error(`❌ Error for ${symbol}:`, error.message || error);
    }
    console.log('-----------------------------------\n');
  }
}

testYahoo().catch(console.error);

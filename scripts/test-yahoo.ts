
import yahooFinance from 'yahoo-finance2';

async function testYahoo() {
  const symbol = 'ALT';
  console.log(`Testing Yahoo Finance for ${symbol}...`);

  try {
    // 1. Test Quote
    console.log('Fetching Quote...');
    const quote = await yahooFinance.quote(symbol);
    console.log('Quote Result:', quote ? 'Success' : 'Failed');
    
    // 2. Test Chart (Intraday 5m)
    console.log('Fetching Chart (5m)...');
    const chart = await yahooFinance.chart(symbol, { interval: '5m' });
    if (chart && chart.quotes && chart.quotes.length > 0) {
      console.log(`Chart Success: Received ${chart.quotes.length} candles.`);
      console.log('Sample:', chart.quotes[0]);
    } else {
      console.log('Chart Failed: No quotes returned.');
      console.log('Full Result:', JSON.stringify(chart, null, 2));
    }

  } catch (error: any) {
    console.error('Yahoo Finance Error:', error.message);
    if (error.errors) {
      console.error('Validation Errors:', JSON.stringify(error.errors, null, 2));
    }
  }
}

testYahoo();

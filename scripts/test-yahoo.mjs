
import YahooFinance from 'yahoo-finance2';

async function testYahoo() {
  const symbol = 'ALT'; 
  console.log(`Testing Yahoo Finance for ${symbol}...`);
  
  const yahoo = new YahooFinance({
    suppressNotices: ['yahooSurvey', 'ripHistorical'],
    fetchOptions: {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        }
    }
  });

  try {
    // 2. Test Chart (Intraday 5m)
    console.log('Fetching Chart (5m)...');
    
    // Set period1 to 5 days ago to ensure we span a weekend if needed and get some data
    const period1 = new Date();
    period1.setDate(period1.getDate() - 5);
    
    try {
        const chart = await yahoo.chart(symbol, { 
            interval: '5m',
            period1: period1
        });
        // Log the structure to be sure
        
        if (chart && chart.quotes && chart.quotes.length > 0) {
            console.log(`Chart Success: Received ${chart.quotes.length} candles.`);
            console.log('First Candle:', chart.quotes[0]);
            console.log('Last Candle:', chart.quotes[chart.quotes.length - 1]);
        } else {
            console.log('Chart Failed: No quotes returned.');
            console.log('Full Result:', JSON.stringify(chart, null, 2));
        }
    } catch (chartErr) {
        console.log('Chart Fetch Error:', chartErr.message);
        if (chartErr.errors) console.log(JSON.stringify(chartErr.errors, null, 2));
    }

  } catch (error) {
    console.error('Yahoo Finance General Error:', error.message);
  }
}

testYahoo();

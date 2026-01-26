
import YahooFinance from 'yahoo-finance2';

async function testHistorical() {
  const symbol = 'ALT'; 
  console.log(`Testing Yahoo Finance Historical for ${symbol}...`);
  
  const yahoo = new YahooFinance({
    suppressNotices: ['yahooSurvey', 'ripHistorical'],
    fetchOptions: {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        }
    }
  });

  try {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1); // 1 Year ago
    const to = new Date();

    console.log(`Fetching Historical (1d) from ${from.toISOString()} to ${to.toISOString()}...`);
    
    const result = await yahoo.historical(symbol, {
        period1: from,
        period2: to,
        interval: '1d'
    });

    console.log('Result type:', Array.isArray(result) ? 'Array' : typeof result);
    if (Array.isArray(result)) {
        console.log(`Success: Received ${result.length} records.`);
        if (result.length > 0) {
            console.log('Sample[0]:', result[0]);
        }
    } else {
        console.log('Result keys:', Object.keys(result || {}));
        console.log('Full Result:', JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('Yahoo Finance Historical Error:', error.message);
    if (error.errors) console.error(JSON.stringify(error.errors, null, 2));
  }
}

testHistorical();

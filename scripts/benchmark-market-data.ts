
// @ts-nocheck
const YahooFinance = require('yahoo-finance2').default; // This is the class
const finnhub = require('finnhub');

// Load env vars
require('dotenv').config();

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

if (!FINNHUB_API_KEY) {
    console.warn("⚠️  FINNHUB_API_KEY not found in .env, Finnhub tests will fail/be limited");
} else {
    console.log("ℹ️  Finnhub API Key found and loaded from environment");
}

const yahoo = new YahooFinance({
    suppressNotices: ['yahooSurvey', 'ripHistorical'],
    fetchOptions: {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      }
    }
});

const finnhubClient = new finnhub.DefaultApi({
    apiKey: FINNHUB_API_KEY,
    basePath: "https://finnhub.io/api/v1",
    isJsonMime: (mime) => mime && mime.indexOf("json") !== -1,
});


const SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'EURUSD=X', 'BTC-USD'];
const YEARS_TO_TEST = [1, 2]; // Request 1y, 2y as requested

async function testYahoo(symbol, years) {
    const to = new Date();
    const from = new Date();
    from.setFullYear(from.getFullYear() - years);

    console.log(`[Yahoo] Fetching ${symbol} for ${years} years...`);
    const start = Date.now();
    try {
        const result = await yahoo.historical(symbol, {
            period1: from,
            period2: to,
            interval: '1d'
        });
        const duration = Date.now() - start;
        console.log(`   ✅ [Yahoo] ${symbol} (${years}y): ${result.length} candles in ${duration}ms`);
        if (result.length > 0) {
            const oldest = result[0].date;
            console.log(`      Oldest: ${new Date(oldest).toISOString().split('T')[0]}`);
        }
        return { success: true, count: result.length, ms: duration };
    } catch (e) {
        console.error(`   ❌ [Yahoo] ${symbol} (${years}y) Failed: ${e.message}`);
        return { success: false, error: e.message };
    }
}

async function testFinnhub(symbol, years) {
    if (!FINNHUB_API_KEY) return { success: false, error: "No API Key" };

    const to = Math.floor(Date.now() / 1000);
    const from = Math.floor(Date.now() / 1000) - (years * 365 * 24 * 60 * 60);

    console.log(`[Finnhub] Fetching ${symbol} for ${years} years...`);
    const start = Date.now();
    
    return new Promise((resolve) => {
        // @ts-ignore
        finnhubClient.stockCandles(symbol, 'D', from, to, (error, data, response) => {
            const duration = Date.now() - start;
            if (error) {
                 // Try to log response body if available
                 const errDetail = response ? JSON.stringify(response.body) : JSON.stringify(error);
                 console.error(`   ❌ [Finnhub] ${symbol} (${years}y) API Error: ${errDetail}`);
                 resolve({ success: false, error: errDetail });
                 return;
            }
            if (!data) {
                console.warn(`   ⚠️ [Finnhub] ${symbol} (${years}y): No Data Object`);
                resolve({ success: false, count: 0 });
                return;
            }
            if (data.s === 'no_data') {
                 console.warn(`   ⚠️ [Finnhub] ${symbol} (${years}y): No Data`);
                 resolve({ success: true, count: 0, ms: duration });
                 return;
            }
            if (data.s !== 'ok') {
                 console.error(`   ❌ [Finnhub] ${symbol} (${years}y) Status: ${data.s}`);
                 resolve({ success: false, error: data.s });
                 return;
            }

            const count = data.t ? data.t.length : 0;
            console.log(`   ✅ [Finnhub] ${symbol} (${years}y): ${count} candles in ${duration}ms`);
            if (count > 0 && data.t) {
                 const oldest = new Date(data.t[0] * 1000);
                 console.log(`      Oldest: ${oldest.toISOString().split('T')[0]}`);
            }
            resolve({ success: true, count, ms: duration });
        });
    });
}

async function runBenchmark() {
    console.log("🚀 Starting Market Data Benchmark...");
    console.log("-----------------------------------");

    for (const symbol of SYMBOLS) {
        console.log(`\nTesting Symbol: ${symbol}`);
        
        for (const years of YEARS_TO_TEST) {
             // Test Yahoo
             await testYahoo(symbol, years);
             
             // Wait a bit
             await new Promise(r => setTimeout(r, 500));
             
             // Test Finnhub
             await testFinnhub(symbol, years);
             
             await new Promise(r => setTimeout(r, 500));
        }
    }
    console.log("\n-----------------------------------");
    console.log("✅ Benchmark Complete");
}

runBenchmark();

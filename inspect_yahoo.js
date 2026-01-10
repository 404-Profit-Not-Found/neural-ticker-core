
const YahooFinance = require('yahoo-finance2').default; // This is the class constructor in v2? Or the default export is the instance?
// Actually, looking at the service, it does: import YahooFinance from 'yahoo-finance2'; private yahoo = new YahooFinance({...});
// But in CommonJS require, it might be different. Let's try to match the service pattern but adapted for CJS.

async function run() {
  try {
    const yahoo = new YahooFinance({
        suppressNotices: ['yahooSurvey', 'ripHistorical'],
        fetchOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } }
    });
    
    const symbol = 'NVDA';
    console.log(`Fetching summary for ${symbol}...`);
    const result = await yahoo.quoteSummary(symbol, {
      modules: [
          'summaryProfile',
          'defaultKeyStatistics',
          'financialData',
          'calendarEvents',
          'earnings',
      ],
    });

    console.log("--- summaryProfile ---");
    console.log(JSON.stringify(result.summaryProfile, null, 2));
    
    console.log("\n--- defaultKeyStatistics ---");
    console.log(JSON.stringify(result.defaultKeyStatistics, null, 2));

    console.log("\n--- financialData ---");
    console.log(JSON.stringify(result.financialData, null, 2));

  } catch (e) {
    console.error(e);
  }
}

run();

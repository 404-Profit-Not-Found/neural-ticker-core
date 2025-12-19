import YahooFinance from 'yahoo-finance2';

const yahoo = new YahooFinance();

// Silence the survey notice
// @ts-ignore
yahoo._env.suppressNotices = ['yahooSurvey'];

const symbol = process.argv[2] || 'SOI.PA';

async function exploreYahooData() {
  console.log(`=== Yahoo Finance Deep Dive: ${symbol} ===\n`);

  try {
    // 1. QUOTE (Real-time/Delayed Price)
    console.log('--- [1] yahoo.quote() ---');
    const quote = await yahoo.quote(symbol);
    console.log('Sample Fields (Quote):', {
      symbol: quote.symbol,
      price: quote.regularMarketPrice,
      currency: quote.currency,
      exchange: quote.fullExchangeName,
      marketCap: quote.marketCap,
      sharesOutstanding: quote.sharesOutstanding,
    });
    // console.log('Raw Quote Data:', JSON.stringify(quote, null, 2));
    console.log('\n');

    // 2. HISTORICAL (OHLCV)
    console.log('--- [2] yahoo.historical() ---');
    const historical = await yahoo.historical(symbol, {
      period1: new Date('2024-01-01'),
      period2: new Date(), // Today
      interval: '1d',
    });
    console.log(`Fetched ${historical.length} historical records.`);
    if (historical.length > 0) {
      console.log('Sample Historical Record:', historical[historical.length - 1]);
    }
    console.log('\n');

    // 3. QUOTE SUMMARY (Fundamentals, Profile, etc.)
    console.log('--- [3] yahoo.quoteSummary() ---');
    const summary = await yahoo.quoteSummary(symbol, {
      modules: [
        'summaryProfile',
        'defaultKeyStatistics',
        'financialData',
        'calendarEvents',
        'earnings',
      ],
    });
    
    if (summary.summaryProfile) {
      console.log('Summary Profile:', {
        sector: summary.summaryProfile.sector,
        industry: summary.summaryProfile.industry,
        website: summary.summaryProfile.website,
        employees: summary.summaryProfile.fullTimeEmployees,
      });
    }

    if (summary.financialData) {
      console.log('Financial Highlights:', {
        recommendation: summary.financialData.recommendationKey,
        targetPrice: summary.financialData.targetMeanPrice,
        totalCash: summary.financialData.totalCash,
        totalDebt: summary.financialData.totalDebt,
        freeCashflow: summary.financialData.freeCashflow,
        operatingMargins: summary.financialData.operatingMargins,
      });
    }

    if (summary.defaultKeyStatistics) {
      console.log('Key Statistics:', {
        beta: summary.defaultKeyStatistics.beta,
        forwardPE: summary.defaultKeyStatistics.forwardPE,
        trailingEps: summary.defaultKeyStatistics.trailingEps,
        sharesOutstanding: summary.defaultKeyStatistics.sharesOutstanding,
      });
    }
    console.log('\n');

    // 4. SEARCH (News & Related)
    console.log('--- [4] yahoo.search() ---');
    const searchResults = await yahoo.search(symbol);
    if (searchResults.news && searchResults.news.length > 0) {
      console.log(`Found ${searchResults.news.length} news items.`);
      console.log('Latest News Headline:', searchResults.news[0].title);
      console.log('Latest News URL:', searchResults.news[0].link);
    }
    console.log('\n');

    console.log('=== Deep Dive Complete ===');
    console.log('Tip: You can see the full JSON by uncommenting the log lines in the script.');
  } catch (error: any) {
    console.error('❌ Error during Deep Dive:', error.message || error);
  }
}

exploreYahooData();

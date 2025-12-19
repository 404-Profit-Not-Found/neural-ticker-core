const axios = require('axios');

async function testHistory() {
  const symbols = ['AAPL', 'SOI.PA'];
  const baseUrl = 'http://localhost:3000/api/v1';

  for (const symbol of symbols) {
    console.log(`\n--- Testing History for ${symbol} ---`);
    try {
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const to = new Date().toISOString();
      
      console.log(`Fetching history from ${from} to ${to}...`);
      const response = await axios.get(`${baseUrl}/tickers/${symbol}/composite`);
      
      const history = response.data.market_data.history;
      console.log(`Success! Received ${history.length} data points.`);
      
      if (history.length > 0) {
        console.log('First point:', history[0]);
        console.log('Last point:', history[history.length - 1]);
      } else {
        console.warn('No history returned!');
      }
    } catch (e) {
      console.error(`Error for ${symbol}:`, e.response?.data || e.message);
    }
  }
}

testHistory();

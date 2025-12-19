const https = require('https');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const apiKey = process.env.FINNHUB_API_KEY;

function testExchange(code) {
  return new Promise((resolve, reject) => {
    const url = `https://finnhub.io/api/v1/stock/symbol?exchange=${code}&token=${apiKey}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`--- Result for ${code} ---`);
        console.log(`Status: ${res.statusCode}`);
        try {
          const json = JSON.parse(data);
          if (Array.isArray(json)) {
            console.log(`Count: ${json.length} symbols`);
          } else {
            console.log(`Response:`, json);
          }
        } catch (e) {
          console.log(`Raw Body:`, data);
        }
        console.log('-------------------------\n');
        resolve();
      });
    }).on('error', reject);
  });
}

async function run() {
  await testExchange('US');
  await testExchange('L');
}

run();

const { jsonToToon } = require('toon-parser');

const sample = {
  AAPL: {
    price: 150,
    fundamentals: { pe: 25 }
  }
};

try {
  const result = jsonToToon(sample);
  console.log('Result type:', typeof result);
  console.log('Result:', result);
} catch (e) {
  console.error(e);
}

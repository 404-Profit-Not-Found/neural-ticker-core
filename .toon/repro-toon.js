const { jsonToToon } = require('toon-parser');

const complexObj = {
  name: 'AAPL',
  timestamp: new Date(), // Suspect this breaks it
  nested: {
    val: null,
    list: [1, 2]
  }
};

try {
  console.log('Testing Date object...');
  console.log(jsonToToon(complexObj));
} catch (e) {
  console.error('Failed on Date:', e.message);
}

const entityLike = {
    symbol: 'AAPL',
    someFn: () => {} // Suspect this breaks it too
};

try {
    console.log('Testing Function...');
    console.log(jsonToToon(entityLike));
} catch (e) {
    console.error('Failed on Function:', e.message);
}

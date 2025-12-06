try {
  const toon = require('toon-parser');
  console.log('Exports:', Object.keys(toon));
  console.log('Type:', typeof toon);
  if (typeof toon === 'function') console.log('It is a function');
} catch (e) {
  console.error(e);
}

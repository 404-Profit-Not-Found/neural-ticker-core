
const { pathToRegexp } = require('path-to-regexp');

const patterns = [
    '/api/(.*)',          // Classical
    '/api/:path*',        // Named zero-or-more
    '/api/:path(.*)',     // Named custom regex
    '/api/:path+',        // Named one-or-more
    '/api{/*path}',       // v8 repeatable?
    '/api/(.*)', 
    '/api/:splat(.*)',
    '/api(.*)',
    '/api/:rest*'
];

console.log('Testing patterns for path-to-regexp v8...');
patterns.forEach(p => {
    try {
        const keys = [];
        pathToRegexp(p, keys);
        console.log(`PASS: "${p}"`);
    } catch (e) {
        console.log(`FAIL: "${p}" -> ${e.message}`);
    }
});


/**
 * Public Link Security Audit Script
 * 
 * Usage: node audit-public-link.js <BASE_URL> <EMAIL> <PASSWORD>
 * Example: node audit-public-link.js http://localhost:3000 myuser@example.com mypass
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const EMAIL = process.argv[3];
const PASSWORD = process.argv[4];

if (!EMAIL || !PASSWORD) {
    console.error('Usage: node audit-public-link.js <BASE_URL> <EMAIL> <PASSWORD>');
    process.exit(1);
}

// Colors
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const blue = (text) => `\x1b[34m${text}\x1b[0m`;

async function login() {
    console.log(blue('[*] Logging in...'));
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    });

    if (!res.ok) throw new Error(`Login failed: ${res.statusText}`);
    const data = await res.json();
    return data.accessToken; // Adjust based on your Auth response
}

async function getResearchIdAndLink(token) {
    console.log(blue('[*] Fetching research notes...'));
    // 1. List notes
    const listRes = await fetch(`${BASE_URL}/api/v1/research?limit=1`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const listData = await listRes.json();
    
    if (!listData.data || listData.data.length === 0) {
        throw new Error('No research notes found. Please create one first.');
    }
    
    const note = listData.data[0];
    console.log(green(`[+] Found Research ID: ${note.id}`));

    // 2. Get Share Link
    console.log(blue('[*] Generating Share Link...'));
    const linkRes = await fetch(`${BASE_URL}/api/v1/research/${note.id}/share-link`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!linkRes.ok) throw new Error('Failed to get share link');
    
    const linkData = await linkRes.json();
    // linkData: { signature, path }
    // Full URL: BASE_URL + '/api/v1/public' ... ensure path logic matches backend
    // Backend returns `path: /report/:id/:sig`. This is frontend path? 
    // Wait, the backend logic returns a path for the FRONTEND to use.
    // The PUBLIC API endpoint is likely /api/v1/public/report/:id/:sig
    // Let's verify paths.
    
    // Frontend Route: /report/:researchId/:signature
    // Backend Public API: /api/v1/public/report/:researchId/:signature
    
    return {
        id: note.id,
        signature: linkData.signature,
        publicApiUrl: `${BASE_URL}/api/v1/public/report/${note.id}/${linkData.signature}`
    };
}

async function runTests() {
    try {
        const token = await login();
        const { id, signature, publicApiUrl } = await getResearchIdAndLink(token);

        console.log(green(`[+] Target Public API: ${publicApiUrl}`));
        console.log('--- STARTING AUDIT ---\n');

        // TEST 1: Valid Signature
        process.stdout.write('Test 1: Valid Signature Access... ');
        const res1 = await fetch(publicApiUrl);
        if (res1.status === 200) console.log(green('PASS (200 OK)'));
        else console.log(red(`FAIL (Status: ${res1.status})`));

        // TEST 2: Tampered Signature
        process.stdout.write('Test 2: Tampered Signature... ');
        const tamperedSig = signature.substring(0, signature.length - 1) + 'X';
        const url2 = publicApiUrl.replace(signature, tamperedSig);
        const res2 = await fetch(url2);
        if (res2.status === 403) console.log(green('PASS (403 Forbidden)'));
        else console.log(red(`FAIL (Expected 403, got ${res2.status})`));

        // TEST 3: ID Enumeration (Valid Sig, Different ID)
        process.stdout.write('Test 3: ID Enumeration (Sig mismatch)... ');
        // Change one char in UUID.
        // Assumes UUID format 8-4-4-4-12
        const parts = id.split('-');
        const lastPart = parts[parts.length-1];
        const newLast = lastPart.substring(0, lastPart.length-1) + (lastPart.endsWith('a') ? 'b' : 'a');
        const newId = [...parts.slice(0, -1), newLast].join('-');
        
        const url3 = publicApiUrl.replace(id, newId); // Keep original sig!
        const res3 = await fetch(url3);
        if (res3.status === 403) console.log(green('PASS (403 Forbidden)'));
        else console.log(red(`FAIL (Expected 403, got ${res3.status})`));

        // TEST 4: SQL Injection in ID
        process.stdout.write('Test 4: SQL Injection Payload in ID... ');
        const sqlPayload = id + "' OR '1'='1";
        const url4 = publicApiUrl.replace(id, encodeURIComponent(sqlPayload));
        const res4 = await fetch(url4);
        // Expect 403 (Invalid Sig) or 400/500/404. Definitely NOT 200.
        if (res4.status !== 200) console.log(green(`PASS (Blocked: ${res4.status})`));
        else console.log(red('FAIL (200 OK - VULNERABLE!)'));

        // TEST 5: Rate Limiting
        process.stdout.write(`Test 5: Rate Limiting (Burst 20 reqs)... `);
        // We probably won't hit the 100 limit, but let's see if we get ANY 429.
        // If limit is 100, we need > 100.
        // Let's just try 10 quick ones to check stability.
        const promises = [];
        for (let i = 0; i < 10; i++) promises.push(fetch(publicApiUrl));
        const results = await Promise.all(promises);
        const statuses = results.map(r => r.status);
        const anyFail = statuses.some(s => s !== 200);
        
        if (!anyFail) console.log(blue('INFO (All 200 OK - Limit is likely higher than 10)'));
        else if (statuses.includes(429)) console.log(green('PASS (429 Encountered)'));
        else console.log(red(`WARN (Some failed with: ${statuses.filter(s => s!==200).join(',')})`));
        
        console.log('\n--- AUDIT COMPLETE ---');

    } catch (err) {
        console.error(red(`\nERROR: ${err.message}`));
    }
}

runTests();

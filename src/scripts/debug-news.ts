import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import yahooFinance from 'yahoo-finance2';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const finnhub = require('finnhub');

const symbol = 'EKT.DE';

async function testNews() {
    console.log(`Testing news fetch for ${symbol}...`);

    // 1. Yahoo Finance Search
    try {
        console.log('\n--- Yahoo Finance Search ---');
        const yahooResult = await yahooFinance.search(symbol);
        const news = (yahooResult as any).news || [];
        console.log(`Yahoo Search found ${news.length} items.`);
        news.forEach((n: any, i: number) => {
            console.log(`[${i}] ${n.title} (${n.publisher}) - ${n.link}`);
        });
    } catch (e) {
        console.error('Yahoo failed:', e.message);
    }

    // 2. Finnhub News
    try {
        console.log('\n--- Finnhub Company News ---');
        const apiKey = process.env.FINNHUB_API_KEY;
        if (!apiKey) {
            console.log('Skipping Finnhub (No API Key)');
        } else {
            const api_key = finnhub.ApiClient.instance.authentications['api_key'];
            api_key.apiKey = apiKey;
            const finnhubClient = new finnhub.DefaultApi();
            
            const to = new Date().toISOString().split('T')[0];
            const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            console.log(`Fetching Finnhub news from ${from} to ${to} for ${symbol}...`);
            
            await new Promise<void>((resolve) => {
                finnhubClient.companyNews(symbol, from, to, (error: any, data: any) => {
                    if (error) {
                        console.error('Finnhub Error:', error);
                    } else {
                        console.log(`Finnhub returned ${data.length} items.`);
                        data.forEach((n: any, i: number) => {
                            console.log(`[${i}] ${n.headline} (${n.source}) - ${n.url}`);
                        });
                    }
                    resolve();
                });
            });
        }
    } catch (e) {
        console.error('Finnhub setup failed:', e.message);
    }
}

testNews();

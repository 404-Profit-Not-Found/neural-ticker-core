
import { DataSource } from 'typeorm';
import { PriceOhlcv } from '../src/modules/market-data/entities/price-ohlcv.entity';
import { TickerEntity } from '../src/modules/tickers/entities/ticker.entity';
import * as dotenv from 'dotenv';

dotenv.config();

// Minimal entities for connection
const entities = [PriceOhlcv, TickerEntity];

const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'neural-ticker.db', // Adjust if using Postgres in dev, but user context says 'database: neural-ticker.db' in MEMORY[user_global] for MVP?
  // Actually tech-stack says Neon Serverless Postgres.
  // config/configuration.ts would tell us.
  // Let's assume env vars are set correctly for the connection.
  // We'll trust the env vars.
  type: 'postgres',
  url: process.env.DATABASE_URL, 
  entities: entities,
  synchronize: false,
});

async function inspectData() {
  try {
    await AppDataSource.initialize();
    console.log('Database connected.');

    const tickerRepo = AppDataSource.getRepository(TickerEntity);
    const ohlcvRepo = AppDataSource.getRepository(PriceOhlcv);

    const symbol = 'NVDA';
    const ticker = await tickerRepo.findOne({ where: { symbol } });

    if (!ticker) {
      console.log(`Ticker ${symbol} not found.`);
      return;
    }

    console.log(`Ticker ${symbol} ID: ${ticker.id}`);

    // Check count of 1d candles
    const count = await ohlcvRepo.count({
        where: { symbol_id: ticker.id, timeframe: '1d' }
    });
    console.log(`Total '1d' candles for ${symbol}: ${count}`);

    // Fetch last 20 candles
    const candles = await ohlcvRepo.find({
        where: { symbol_id: ticker.id, timeframe: '1d' },
        order: { ts: 'DESC' },
        take: 20
    });

    console.log('Last 20 candles:');
    candles.forEach(c => {
        console.log(`Date: ${c.ts.toISOString()} | Close: ${c.close} | Source: ${c.source}`);
    });

    // Check for duplicates on the same day?
    // Let's group by day
    const allCandles = await ohlcvRepo.find({
        where: { symbol_id: ticker.id, timeframe: '1d' },
        order: { ts: 'DESC' },
        take: 1000
    });
    
    const dayMap = new Map();
    let dups = 0;
    allCandles.forEach(c => {
        const day = c.ts.toISOString().split('T')[0];
        if (dayMap.has(day)) {
            dups++;
            // console.log(`Duplicate found for ${day}:`, c);
        }
        dayMap.set(day, true);
    });
    console.log(`Found ${dups} potential duplicate days in last 1000 candles.`);


  } catch (error) {
    console.error('Error:', error);
  } finally {
    await AppDataSource.destroy();
  }
}

inspectData();

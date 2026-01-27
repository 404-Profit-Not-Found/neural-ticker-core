import { DataSource } from 'typeorm';
import { ExchangeRateEntity } from './src/modules/currency/entities/exchange-rate.entity';
import { config } from 'dotenv';
config();

async function main() {
    console.log('Connecting to DB to FORCE SYNC...');
    const dataSource = new DataSource({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: [ExchangeRateEntity],
        synchronize: true, // <--- FORCE CREATE TABLE
        ssl: { rejectUnauthorized: false }
    });
    
    await dataSource.initialize();
    console.log('Schema Sync Complete. Table exchange_rates should exist.');
    
    await dataSource.destroy();
}

main().catch(console.error);

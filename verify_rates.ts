import { DataSource } from 'typeorm';
import { ExchangeRateEntity } from './src/modules/currency/entities/exchange-rate.entity';
import { config } from 'dotenv';
config();

async function main() {
    console.log('Connecting to DB...');
    const dataSource = new DataSource({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: [ExchangeRateEntity],
        ssl: { rejectUnauthorized: false }
    });
    
    await dataSource.initialize();
    
    console.log('Checking persistency...');
    const rates = await dataSource.getRepository(ExchangeRateEntity).find();
    
    console.log(`Found ${rates.length} rates in DB.`);
    
    const eur = rates.find(r => r.currency_code === 'EUR');
    if (eur) {
        console.log(`EUR Rate: ${eur.rate_to_usd}`);
        if (eur.rate_to_usd === 1) console.error('FAIL: EUR is 1.0 (Default value bug?)');
        else console.log('SUCCESS: EUR rate looks real.');
    } else {
        console.warn('EUR not found in DB yet (maybe API call failed?)');
    }

    await dataSource.destroy();
}

main().catch(console.error);
